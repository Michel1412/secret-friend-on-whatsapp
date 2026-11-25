import { randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import wwebjs from 'whatsapp-web.js'
import pino from 'pino'
import qrcode from 'qrcode'
import {
  isBrowserAlreadyRunning,
  mensagemAbertura,
  releaseStuckBrowser,
  sessionUserDataDir,
  userDataDirFromError,
} from './browser-lock.ts'
import { config, browserName, deviceName } from './config.ts'
import { instalarNomeDoAparelho, type ClienteNome } from './device-name.ts'
import { resolveChromePath } from './chrome-path.ts'
import { SendFailure, toSeconds, type DeliveryResult, type OutboundKey } from '../../shared/deliver.ts'
import { sameAccount, type AccountRef } from '../../shared/identity.ts'
import { phoneDigits } from '../../shared/phone.ts'
import { apagadoConfirmado, apagarComTentativas } from './wa-flow.ts'
import { codigoTeste, mascararDestino, mensagemTeste } from '../../shared/sync-gate.ts'
import type { WhatsAppSnapshot } from '../../shared/types.ts'

const { Client, LocalAuth } = wwebjs
const logger = pino({ level: config.logLevel })

type WaMessage = {
  id: { _serialized: string }
  delete: (everyone?: boolean) => Promise<void>
}

type WaClient = {
  initialize: () => Promise<void>
  destroy: () => Promise<void>
  logout: () => Promise<void>
  on: (event: string, listener: (...args: never[]) => void) => void
  off: (event: string, listener: (...args: never[]) => void) => void
  getNumberId: (number: string) => Promise<{ _serialized: string; user?: string } | null>
  sendMessage: (chatId: string, text: string) => Promise<WaMessage>
  getMessageById: (id: string) => Promise<WaMessage | null>
  getChats: () => Promise<unknown[]>
  info?: { wid?: { user?: string; _serialized?: string } }
}

function emptySnapshot(): WhatsAppSnapshot {
  return {
    status: 'disconnected',
    qrDataUrl: null,
    phone: null,
    pushName: null,
    error: null,
    appStateReady: false,
    appStateReadyEm: null,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorFields(error: unknown): { message: string } {
  return { message: error instanceof Error ? error.message : 'erro desconhecido' }
}

/**
 * One WhatsApp Web session per email, via whatsapp-web.js.
 * "Apagar para mim" is message.delete(false), the WhatsApp Web command.
 */
export class WhatsAppSession {
  snapshot: WhatsAppSnapshot = emptySnapshot()
  private client: WaClient | null = null
  private generation = 0
  private intentionalClose = false
  private opening: Promise<void> | null = null
  private own: AccountRef = { phone: null, jid: null, lid: null }

  constructor(
    private readonly dataPath: string,
    private readonly clientId: string,
    private readonly launch?: () => Promise<void>,
  ) {}

  getOrStart(): Promise<void> {
    if (this.opening) return this.opening
    this.intentionalClose = false
    let resolveTask!: () => void
    let rejectTask!: (reason: unknown) => void
    const task = new Promise<void>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })
    this.opening = task
    const run = this.launch ?? (() => this.open())
    try {
      run().then(resolveTask, rejectTask)
    } catch (error) {
      rejectTask(error)
    }
    void task.finally(() => {
      if (this.opening === task) this.opening = null
    })
    return task
  }

  connect(force = false): Promise<void> {
    if (this.opening) return this.opening
    if (!force && (this.snapshot.status === 'connected' || this.snapshot.status === 'qr')) return Promise.resolve()
    return this.getOrStart()
  }

  async logout(): Promise<void> {
    this.intentionalClose = true
    this.generation += 1
    const client = this.client
    this.client = null
    try {
      await client?.logout()
    } catch (error) {
      logger.warn({ ...errorFields(error) }, 'logout whatsapp')
      try {
        await client?.destroy()
      } catch {
        // browser already closed
      }
    }
    this.own = { phone: null, jid: null, lid: null }
    this.snapshot = emptySnapshot()
  }

  async destroy(): Promise<void> {
    this.intentionalClose = true
    this.generation += 1
    const client = this.client
    this.client = null
    try {
      await client?.destroy()
    } catch (error) {
      logger.warn({ ...errorFields(error) }, 'fechar navegador')
    }
    this.snapshot = { ...emptySnapshot(), error: null }
  }

  async deliver(e164: string, text: string): Promise<DeliveryResult> {
    let sent: { jid: string; messageId: string; message: WaMessage }
    try {
      sent = await this.sendText(e164, text)
    } catch (error) {
      if (error instanceof SendFailure) return { sent: false, deletedForMe: false, error: error.message }
      return { sent: false, deletedForMe: false, error: 'Falha ao enviar a mensagem.' }
    }
    const key: OutboundKey = {
      remoteJid: sent.jid,
      id: sent.messageId,
      timestamp: toSeconds(Date.now()),
    }
    if (sameAccount(this.own, { phone: e164, jid: sent.jid })) {
      logger.info({ jid: sent.jid, messageId: sent.messageId }, 'próprio número, sem apagar')
      return { sent: true, deletedForMe: false, ownNumber: true, key }
    }
    const confirmed = await this.deleteMessage(sent.message, true)
    return {
      sent: true,
      deletedForMe: confirmed,
      via: confirmed ? 'mensagem' : null,
      key,
      error: confirmed ? undefined : 'Enviado (não confirmado apagado).',
    }
  }

  async deleteOwnMessage(key: OutboundKey): Promise<{ confirmed: boolean; via: 'mensagem' | 'conversa' | null }> {
    const client = this.requireClient()
    let message: WaMessage | null = null
    try {
      message = await client.getMessageById(key.id)
    } catch (error) {
      logger.warn({ ...errorFields(error), jid: key.remoteJid, messageId: key.id }, 'mensagem não encontrada para apagar')
      return { confirmed: true, via: 'mensagem' }
    }
    if (!message) return { confirmed: true, via: 'mensagem' }
    const confirmed = await this.deleteMessage(message, false)
    return { confirmed, via: confirmed ? 'mensagem' : null }
  }

  async testarApagar(phone: string | null): Promise<{
    codigo: string
    destino: string
    envioOk: boolean
    apagadoOk: boolean
    passos: { passo: string; ok: boolean; detalhe: string }[]
  }> {
    const codigo = codigoTeste(() => randomInt(0, 1_000_000_000) / 1_000_000_000)
    const passos: { passo: string; ok: boolean; detalhe: string }[] = []
    const note = (passo: string, ok: boolean, detalhe: string) => {
      passos.push({ passo, ok, detalhe })
      logger.info({ passo, ok, detalhe, codigo }, 'teste apagar')
    }
    const vazio = (destino = '••••') => ({ codigo, destino, envioOk: false, apagadoOk: false, passos })
    if (!this.client || this.snapshot.status !== 'connected') {
      note('conexão', false, 'WhatsApp não está conectado.')
      return vazio()
    }
    if (!this.snapshot.appStateReady) {
      note('pronto', false, 'O WhatsApp ainda não ficou pronto. Espere o selo Verificado.')
      return vazio()
    }
    note('pronto', true, 'Cliente pronto e chats carregados.')
    const target = phone || this.own.phone
    if (!target) {
      note('destino', false, 'Não há número conectado para o teste.')
      return vazio()
    }
    const destino = mascararDestino(target)
    try {
      const sent = await this.sendText(target, mensagemTeste(codigo))
      note('envio', true, `Enviado com código ${codigo} para ${mascararDestino(sent.jid)}.`)
      const apagado = await this.deleteMessage(sent.message, true)
      note('apagar', apagado, apagado ? `Apagado código ${codigo}.` : `Não confirmado o apagar do código ${codigo}.`)
      return { codigo, destino, envioOk: true, apagadoOk: apagado, passos }
    } catch (error) {
      note('envio', false, errorFields(error).message)
      return { codigo, destino, envioOk: false, apagadoOk: false, passos }
    }
  }

  private requireClient(): WaClient {
    if (!this.client || this.snapshot.status !== 'connected') {
      throw new SendFailure('O WhatsApp não está conectado.')
    }
    return this.client
  }

  private rememberOwn(client: WaClient): void {
    const wid = client.info?.wid
    this.own = {
      phone: wid?.user ? `+${wid.user}` : null,
      jid: wid?._serialized ?? null,
      lid: null,
    }
    this.snapshot = { ...this.snapshot, phone: this.own.phone ?? null }
  }

  private async sendText(e164: string, text: string): Promise<{ jid: string; messageId: string; message: WaMessage }> {
    const client = this.requireClient()
    const digits = phoneDigits(e164)
    let jid = ''
    try {
      const registered = await client.getNumberId(digits)
      if (!registered?._serialized) throw new SendFailure('Este número não está no WhatsApp.')
      jid = registered._serialized
    } catch (error) {
      if (error instanceof SendFailure) throw error
      logger.warn({ ...errorFields(error), jid: digits }, 'consulta de número falhou')
      throw new SendFailure('Não consegui consultar esse número no WhatsApp.')
    }
    try {
      const message = await client.sendMessage(jid, text)
      const messageId = message.id?._serialized
      if (!messageId) throw new SendFailure('O WhatsApp não confirmou o envio.')
      logger.info({ jid, messageId }, 'mensagem enviada')
      return { jid, messageId, message }
    } catch (error) {
      if (error instanceof SendFailure) throw error
      logger.warn({ ...errorFields(error), jid }, 'envio falhou')
      throw new SendFailure('Falha ao enviar a mensagem.')
    }
  }

  private async deleteMessage(message: WaMessage, waitBefore: boolean): Promise<boolean> {
    const client = this.requireClient()
    const messageId = message.id._serialized
    if (waitBefore) await sleep(config.deleteDelayMs)
    let revoked = false
    const onRevoke = (revokedMessage: { id?: { _serialized?: string } }) => {
      if (revokedMessage.id?._serialized === messageId) revoked = true
    }
    client.on('message_revoke_me', onRevoke as (...args: never[]) => void)
    try {
      return await apagarComTentativas(async () => {
        try {
          const live = await client.getMessageById(messageId)
          if (!live) return true
          await live.delete(false)
        } catch (error) {
          const fields = errorFields(error)
          logger.warn({ ...fields, messageId }, 'apagar para mim falhou')
          if (/not found|não encontrad/i.test(fields.message)) return true
        }
        await sleep(600)
        if (revoked) return true
        try {
          const again = await client.getMessageById(messageId)
          return apagadoConfirmado({ revoke: revoked, encontrada: Boolean(again) })
        } catch {
          return apagadoConfirmado({ revoke: revoked, encontrada: false })
        }
      })
    } finally {
      client.off('message_revoke_me', onRevoke as (...args: never[]) => void)
    }
  }

  private async dropClient(): Promise<void> {
    const client = this.client
    this.client = null
    if (!client) return
    try {
      await client.destroy()
    } catch {
      // o navegador já pode ter caído
    }
  }

  private wire(client: WaClient, generation: number): void {
    client.on('qr', ((qr: string) => {
      if (generation !== this.generation) return
      void qrcode.toDataURL(qr, { margin: 1, width: 280 }).then((qrDataUrl) => {
        if (generation !== this.generation) return
        this.snapshot = { ...this.snapshot, status: 'qr', qrDataUrl, error: null }
        logger.info('qr pronto')
      })
    }) as (...args: never[]) => void)

    client.on('ready', (() => {
      if (generation !== this.generation) return
      this.rememberOwn(client)
      this.snapshot = {
        ...this.snapshot,
        status: 'connected',
        qrDataUrl: null,
        error: null,
        phone: this.own.phone ?? null,
      }
      logger.info({ jid: this.own.jid }, 'whatsapp conectado')
      void this.markVerified(client, generation)
    }) as (...args: never[]) => void)

    client.on('auth_failure', ((message: string) => {
      logger.warn({ message }, 'falha de autenticação')
      this.snapshot = { ...emptySnapshot(), error: 'O WhatsApp recusou a sessão. Gere o QR de novo.' }
    }) as (...args: never[]) => void)

    client.on('disconnected', ((reason: string) => {
      logger.warn({ reason }, 'whatsapp desconectou')
      if (generation !== this.generation || this.intentionalClose) return
      this.client = null
      this.snapshot = { ...emptySnapshot(), error: 'A conexão caiu. Gere o QR de novo.' }
    }) as (...args: never[]) => void)
  }

  private createClient(executablePath: string | undefined): WaClient {
    return new Client({
      authStrategy: new LocalAuth({ clientId: this.clientId, dataPath: this.dataPath }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        ...(executablePath ? { executablePath } : {}),
      },
    }) as unknown as WaClient
  }

  private async open(): Promise<void> {
    const generation = ++this.generation
    this.intentionalClose = false
    await this.dropClient()
    this.snapshot = {
      ...this.snapshot,
      status: 'connecting',
      qrDataUrl: null,
      error: null,
      appStateReady: false,
      appStateReadyEm: null,
    }
    await mkdir(this.dataPath, { recursive: true })
    const executablePath = resolveChromePath({
      platform: process.platform,
      env: process.env,
      exists: existsSync,
    })
    logger.info({ executablePath: executablePath ?? 'padrão do puppeteer' }, 'navegador escolhido')
    const perfil = sessionUserDataDir(this.dataPath, this.clientId)
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (generation !== this.generation) return
      const client = this.createClient(executablePath)
      this.client = client
      this.wire(client, generation)
      const pararNome = instalarNomeDoAparelho(client as unknown as ClienteNome, deviceName, browserName, (nivel, mensagem, extra) => {
        if (nivel === 'info') logger.info(extra, mensagem)
        else logger.warn(extra, mensagem)
      })
      try {
        await client.initialize()
        return
      } catch (error) {
        lastError = error
        const message = errorFields(error).message
        logger.error({ message, attempt }, 'falha ao abrir whatsapp')
        if (generation !== this.generation) return
        const travado = isBrowserAlreadyRunning(message)
        if (travado && attempt === 1) {
          const dir = userDataDirFromError(message) || perfil
          await this.dropClient()
          try {
            const released = await releaseStuckBrowser(dir)
            logger.warn(
              { processos: released.killed.length, proprios: released.kept.length, locks: released.removed.length },
              'perfil do navegador estava preso',
            )
          } catch (releaseError) {
            logger.warn({ ...errorFields(releaseError) }, 'não soltei o perfil do navegador')
          }
          continue
        }
        break
      } finally {
        pararNome()
      }
    }
    if (generation !== this.generation) return
    await this.dropClient()
    const caminho = lastError instanceof Error ? userDataDirFromError(lastError.message) : null
    this.snapshot = { ...emptySnapshot(), error: mensagemAbertura(lastError, caminho || perfil) }
  }

  private async markVerified(client: WaClient, generation: number): Promise<void> {
    try {
      await client.getChats()
      logger.info('chats sincronizados')
    } catch (error) {
      logger.warn({ ...errorFields(error) }, 'sync de chats')
    }
    if (generation !== this.generation) return
    this.snapshot = {
      ...this.snapshot,
      status: 'connected',
      appStateReady: true,
      appStateReadyEm: new Date().toISOString(),
    }
    logger.info('whatsapp verificado')
  }
}

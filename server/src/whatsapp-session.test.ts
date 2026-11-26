import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  class FakeClient {
    handlers = new Map<string, (...args: unknown[]) => void>()
    info: { wid?: { user?: string; _serialized?: string } } = {
      wid: { user: '5511900000001', _serialized: '5511900000001@c.us' },
    }
    initialize = vi.fn(async () => {
      if (state.mode === 'retry') {
        state.mode = 'ok'
        throw new Error('The browser is already running for /tmp/papel-nenhum. Use a different profile')
      }
      if (state.mode === 'fail') throw new Error('chrome ausente')
      if (state.mode === 'timeout') throw new Error('Waiting failed: 30000ms exceeded')
      if (state.mode === 'timeout-once') {
        state.mode = 'ok'
        throw new Error('Waiting failed: 30000ms exceeded')
      }
      if (state.mode === 'nome') await this.setDeviceName?.()
    })
    destroy = vi.fn(async () => undefined)
    logout = vi.fn(async () => {
      this.emit('disconnected', 'LOGOUT')
    })
    getNumberId = vi.fn(async (digits: string): Promise<{ _serialized: string; user: string } | null> => ({
      _serialized: `${digits}@c.us`,
      user: digits,
    }))
    sendMessage = vi.fn(async () => ({
      id: { _serialized: 'MSG1' },
      delete: vi.fn(async () => undefined),
    }))
    getMessageById = vi.fn(async () => null as { id: { _serialized: string }; delete: () => Promise<void> } | null)
    getChats = vi.fn(async () => [{ id: 'chat' }])
    setDeviceName?: () => Promise<void>
    pupPage?: {
      evaluate: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>
      waitForFunction?: () => Promise<unknown>
    } | null
    constructor(public options?: {
      deviceName?: string
      browserName?: string
      authTimeoutMs?: number
      webVersion?: string
      webVersionCache?: { type?: string; remotePath?: string; strict?: boolean }
    }) {
      state.lastOptions = options
      state.clients.push(this)
      if (state.withDeviceHook) {
        this.setDeviceName = vi.fn(async () => undefined)
        this.pupPage = {
          waitForFunction: vi.fn(async () => true),
          evaluate: vi.fn(async (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args)),
        }
      }
    }
    on(event: string, listener: (...args: unknown[]) => void) {
      this.handlers.set(event, listener)
    }
    off(event: string, listener: (...args: unknown[]) => void) {
      if (this.handlers.get(event) === listener) this.handlers.delete(event)
    }
    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args)
    }
  }
  return {
    mode: 'ok' as 'ok' | 'retry' | 'fail' | 'nome' | 'timeout' | 'timeout-once',
    withDeviceHook: false,
    lastOptions: undefined as { deviceName?: string; browserName?: string } | undefined,
    clients: [] as FakeClient[],
    FakeClient,
  }
})

vi.mock('whatsapp-web.js', () => ({
  default: {
    Client: state.FakeClient,
    LocalAuth: class {
      constructor(public opts: unknown) {}
    },
  },
}))

import { browserName, deviceName, config } from './config.ts'
import { WhatsAppSession } from './whatsapp.ts'

const dirs: string[] = []

afterEach(async () => {
  state.mode = 'ok'
  state.withDeviceHook = false
  state.lastOptions = undefined
  state.clients.length = 0
  delete (globalThis as { require?: unknown }).require
  config.deleteDelayMs = 0
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function start() {
  const dir = await mkdtemp(path.join(tmpdir(), 'papel-wa-'))
  dirs.push(dir)
  const session = new WhatsAppSession(dir, 'cliente')
  await session.getOrStart()
  const client = state.clients.at(-1)!
  return { session, client }
}

describe('sessão WhatsApp com cliente falso', () => {
  it('abre uma vez, mostra o QR, fica verificado e ignora evento antigo', async () => {
    const { session, client } = await start()
    expect(client.initialize).toHaveBeenCalledTimes(1)
    client.emit('qr', 'qr-falso')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(session.snapshot.status).toBe('qr')
    expect(session.snapshot.qrDataUrl).toMatch(/^data:image/)
    const again = session.connect(false)
    await again
    expect(client.initialize).toHaveBeenCalledTimes(1)

    client.emit('ready')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(session.snapshot.status).toBe('connected')
    expect(session.snapshot.appStateReady).toBe(true)
    expect(session.snapshot.phone).toBe('+5511900000001')

    await session.logout()
    expect(session.snapshot.status).toBe('disconnected')
    client.emit('qr', 'tarde')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(session.snapshot.qrDataUrl).toBe(null)
  })

  it('pula o apagar no próprio número, confirma revoke e esgota tentativas', async () => {
    const { session, client } = await start()
    client.emit('ready')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const own = await session.deliver('+5511900000001', 'aviso')
    expect(own.ownNumber).toBe(true)
    expect(own.deletedForMe).toBe(false)

    client.getNumberId.mockResolvedValueOnce(null)
    const missing = await session.deliver('+5521900000002', 'aviso')
    expect(missing.sent).toBe(false)

    client.getNumberId.mockRejectedValueOnce(new Error('rede'))
    const consult = await session.deliver('+5521900000002', 'aviso')
    expect(consult.error).toMatch(/consultar/)

    client.sendMessage.mockRejectedValueOnce(new Error('envio'))
    const failedSend = await session.deliver('+5521900000002', 'aviso')
    expect(failedSend.sent).toBe(false)

    client.sendMessage.mockResolvedValueOnce({ id: { _serialized: '' }, delete: vi.fn() })
    const noId = await session.deliver('+5521900000002', 'aviso')
    expect(noId.error).toMatch(/confirmou/)

    const message = {
      id: { _serialized: 'MSG1' },
      delete: vi.fn(async () => {
        client.emit('message_revoke_me', { id: { _serialized: 'MSG1' } })
      }),
    }
    client.getMessageById.mockResolvedValue(message)
    const removed = await session.deliver('+5521900000002', 'aviso')
    expect(removed.deletedForMe).toBe(true)

    client.getMessageById.mockResolvedValue({
      id: { _serialized: 'MSG9' },
      delete: vi.fn(async () => undefined),
    })
    const unconfirmed = await session.deliver('+5521900000002', 'aviso')
    expect(unconfirmed.deletedForMe).toBe(false)
    expect(unconfirmed.error).toMatch(/não confirmado/)

    const retry = await session.deleteOwnMessage({ remoteJid: 'jid', id: 'MSG9', timestamp: 1 })
    expect(retry.confirmed).toBe(false)
    client.getMessageById.mockResolvedValueOnce(null)
    const gone = await session.deleteOwnMessage({ remoteJid: 'jid', id: 'SUMIU', timestamp: 1 })
    expect(gone.confirmed).toBe(true)
    client.getMessageById.mockRejectedValueOnce(new Error('not found'))
    const missingMessage = await session.deleteOwnMessage({ remoteJid: 'jid', id: 'X', timestamp: 1 })
    expect(missingMessage.confirmed).toBe(true)
  })

  it('recusa o teste sem sessão, sem verificação, e registra o teste pronto', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'papel-wa-'))
    dirs.push(dir)
    const session = new WhatsAppSession(dir, 'cliente')
    const early = await session.testarApagar('+5511900000001')
    expect(early.envioOk).toBe(false)

    await session.getOrStart()
    const client = state.clients.at(-1)!
    let release!: (value: { id: string }[]) => void
    client.getChats.mockReturnValueOnce(new Promise((resolve) => {
      release = resolve
    }))
    client.emit('ready')
    const waiting = await session.testarApagar(null)
    expect(waiting.passos.some((step) => step.passo === 'pronto' && !step.ok)).toBe(true)
    release([])
    await new Promise((resolve) => setTimeout(resolve, 20))

    client.getNumberId.mockResolvedValue({ _serialized: '5511900000009@c.us', user: '5511900000009' })
    client.getMessageById.mockResolvedValue(null)
    const tested = await session.testarApagar('+5511900000009')
    expect(tested.envioOk).toBe(true)
    expect(tested.apagadoOk).toBe(true)
    expect(tested.destino.endsWith('0009')).toBe(true)
    expect(tested.codigo).toMatch(/^\d{8}$/)

    client.sendMessage.mockRejectedValueOnce(new Error('falhou'))
    const broken = await session.testarApagar('+5511900000009')
    expect(broken.envioOk).toBe(false)
  })

  it('trata auth_failure, disconnect, retry de navegador preso e falha final', async () => {
    const { session, client } = await start()
    client.emit('auth_failure', 'recusado')
    expect(session.snapshot.error).toMatch(/recusou/)
    client.emit('disconnected', 'NAVIGATION')
    expect(session.snapshot.status).toBe('disconnected')
    expect(session.snapshot.error).toMatch(/caiu/)

    state.mode = 'retry'
    const retried = await start()
    expect(retried.client.initialize).toHaveBeenCalled()

    state.mode = 'fail'
    const dir = await mkdtemp(path.join(tmpdir(), 'papel-wa-'))
    dirs.push(dir)
    const broken = new WhatsAppSession(dir, 'cliente')
    await broken.getOrStart()
    expect(broken.snapshot.status).toBe('disconnected')
    expect(broken.snapshot.error).toMatch(/navegador/)
    await broken.destroy()
    client.getChats.mockRejectedValueOnce(new Error('sync'))
    client.emit('ready')
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  it('não manda deviceName para a lib e aplica o nome antes do QR', async () => {
    const modulo = { info: () => ({ name: 'Chrome', os: 'Linux', ua: 'ua' }) }
    ;(globalThis as { require?: unknown }).require = (nome: string) => (nome === 'WAWebMiscBrowserUtils' ? modulo : null)
    state.withDeviceHook = true
    state.mode = 'nome'
    const { session, client } = await start()
    expect(state.lastOptions?.deviceName).toBeUndefined()
    expect(state.lastOptions?.browserName).toBeUndefined()
    expect(state.lastOptions && 'authTimeoutMs' in state.lastOptions).toBe(true)
    expect(deviceName).toBe('Papelzinho - ZAP')
    expect(browserName).toBe('Chrome')
    expect(modulo.info()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome', ua: 'ua' })
    expect(session.snapshot.error).toBeNull()
    client.emit('qr', 'qr-nome')
    await vi.waitFor(() => expect(session.snapshot.status).toBe('qr'))
  })

  it('abre o QR mesmo quando o módulo do aparelho não existe', async () => {
    ;(globalThis as { require?: unknown }).require = () => null
    state.withDeviceHook = true
    state.mode = 'nome'
    const { session, client } = await start()
    expect(session.snapshot.error).toBeNull()
    expect(session.snapshot.status).toBe('connecting')
    client.emit('qr', 'qr-sem-modulo')
    await vi.waitFor(() => expect(session.snapshot.qrDataUrl).toMatch(/^data:image/))
    expect(session.snapshot.status).toBe('qr')
  })

  it('depois do timeout tenta a versão guardada e, sem ela, uma recente', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'papel-wa-'))
    dirs.push(dir)
    const gravadas: string[] = []
    state.mode = 'timeout-once'
    const comGuardada = new WhatsAppSession(dir, 'cliente', undefined, {
      forcada: null,
      ler: async () => '2.3000.1050000001-alpha',
      gravar: async (versao) => {
        gravadas.push(versao)
      },
      recente: async () => '2.3000.1040000002-alpha',
    })
    await comGuardada.getOrStart()
    expect(state.clients.map((client) => client.options?.webVersion ?? null)).toEqual([null, '2.3000.1050000001-alpha'])
    expect(state.clients[0]?.options?.webVersionCache?.type).toBe('none')
    expect(state.clients[1]?.options?.webVersionCache?.type).toBe('remote')
    expect(comGuardada.snapshot.error).toBeNull()

    state.clients.length = 0
    state.mode = 'timeout-once'
    const semGuardada = new WhatsAppSession(dir, 'cliente-2', undefined, {
      forcada: null,
      ler: async () => null,
      gravar: async () => undefined,
      recente: async (evitar) => {
        expect(evitar).toContain(null)
        return '2.3000.1040000002-alpha'
      },
    })
    await semGuardada.getOrStart()
    expect(state.clients.map((client) => client.options?.webVersion ?? null)).toEqual([null, '2.3000.1040000002-alpha'])
  })

  it('não troca de versão quando o erro não é timeout e para na terceira tentativa', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'papel-wa-'))
    dirs.push(dir)
    let recentes = 0
    state.mode = 'fail'
    const quebrado = new WhatsAppSession(dir, 'cliente', undefined, {
      forcada: null,
      ler: async () => '2.3000.1050000001-alpha',
      gravar: async () => undefined,
      recente: async () => {
        recentes += 1
        return '2.3000.1040000002-alpha'
      },
    })
    await quebrado.getOrStart()
    expect(state.clients).toHaveLength(1)
    expect(recentes).toBe(0)
    expect(quebrado.snapshot.error).toMatch(/navegador/)
    expect(quebrado.snapshot.error).not.toMatch(/Waiting failed/)

    state.clients.length = 0
    state.mode = 'timeout'
    const esgotado = new WhatsAppSession(dir, 'cliente-3', undefined, {
      forcada: null,
      ler: async () => '2.3000.1050000001-alpha',
      gravar: async () => undefined,
      recente: async () => '2.3000.1040000002-alpha',
    })
    await esgotado.getOrStart()
    expect(state.clients).toHaveLength(3)
    expect(state.clients.map((client) => client.options?.webVersion ?? null)).toEqual([
      null,
      '2.3000.1050000001-alpha',
      '2.3000.1040000002-alpha',
    ])
    expect(esgotado.snapshot.error).toMatch(/não terminou de carregar/)
    expect(esgotado.snapshot.error).not.toMatch(/Waiting failed|30000/)
    expect(esgotado.snapshot.etapa).toBeNull()
  })

  it('WWEB_VERSION força uma única tentativa e o QR guarda a versão vista', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'papel-wa-'))
    dirs.push(dir)
    const gravadas: string[] = []
    state.mode = 'ok'
    const session = new WhatsAppSession(dir, 'cliente', undefined, {
      forcada: '2.3000.1040000000-alpha',
      ler: async () => '2.3000.1050000001-alpha',
      gravar: async (versao) => {
        gravadas.push(versao)
      },
      recente: async () => '2.3000.1040000002-alpha',
    })
    await session.getOrStart()
    expect(state.clients).toHaveLength(1)
    expect(state.clients[0]?.options?.webVersion).toBe('2.3000.1040000000-alpha')
    const client = state.clients[0]!
    client.emit('qr', 'qr-versao')
    await vi.waitFor(() => expect(gravadas).toEqual(['2.3000.1040000000-alpha']))
  })
})

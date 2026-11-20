import { fillTemplate } from '../../shared/template.ts'
import type { SendJobView } from '../../shared/types.ts'
import type { DrawStore, StoredDraw, StoredParticipant } from './draw-store.ts'
import { HistoryStore, maskDestination, nextAttempt, type HistoryType } from './history.ts'
import type { WhatsAppSession } from './whatsapp.ts'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const APAGADO = 'Removida do seu WhatsApp. Quem recebeu continua com a mensagem.'
const NAO_CONFIRMADO = 'Enviado (não confirmado apagado).'
const PROPRIO = 'Enviado para o próprio número, não apagado.'

export class Sender {
  private progress: SendJobView = { ativo: false, feitos: 0, total: 0, erro: null }

  constructor(
    private readonly store: DrawStore,
    private readonly whatsapp: WhatsAppSession,
    private readonly history?: HistoryStore,
  ) {}

  view(): SendJobView {
    return this.progress
  }

  isRunning(): boolean {
    return this.progress.ativo
  }

  start(draw: StoredDraw, template: string, intervaloMs: number): void {
    if (this.progress.ativo) {
      throw new Error('Já existe um envio em andamento.')
    }
    const queue = draw.participantes.filter((person) => person.status !== 'apagado' && !person.manter)
    if (queue.length === 0) {
      throw new Error('Não há mensagens pendentes para enviar ou apagar.')
    }
    this.progress = { ativo: true, feitos: 0, total: queue.length, erro: null }
    void this.loop(draw, template, intervaloMs).catch((error) => {
      this.progress = {
        ...this.progress,
        ativo: false,
        erro: error instanceof Error ? error.message : 'O envio parou antes do fim.',
      }
    })
  }

  private async loop(draw: StoredDraw, template: string, intervaloMs: number): Promise<void> {
    const ids = draw.participantes.filter((person) => person.status !== 'apagado' && !person.manter).map((person) => person.id)
    try {
      for (let index = 0; index < ids.length; index += 1) {
        if (this.whatsapp.snapshot.status !== 'connected') {
          this.progress = {
            ...this.progress,
            erro: 'O WhatsApp desconectou. Conecte de novo para continuar.',
          }
          break
        }
        const person = draw.participantes.find((item) => item.id === ids[index])
        if (!person || person.status === 'apagado') {
          this.progress = { ...this.progress, feitos: index + 1 }
          continue
        }

        if (person.manter) {
          this.progress = { ...this.progress, feitos: index + 1 }
          continue
        }
        if (person.status === 'enviado' && person.mensagem) {
          await this.note(draw.id, person, 'reenviado', person.mensagem.id, null)
          const removal = await this.whatsapp.deleteOwnMessage(person.mensagem)
          const tipo: HistoryType = removal.confirmed ? 'apagado' : 'nao_confirmado'
          await this.note(draw.id, person, tipo, person.mensagem.id, removal.confirmed ? null : NAO_CONFIRMADO)
          if (removal.confirmed) {
            person.status = 'apagado'
            person.detalhe = APAGADO
          } else {
            person.status = 'enviado'
            person.detalhe = NAO_CONFIRMADO
          }
        } else {
          await this.note(draw.id, person, 'consulta', null, null)
          const text = fillTemplate(template, person.sorteadoNome)
          const result = await this.whatsapp.deliver(person.telefone, text)
          person.mensagem = result.key ?? person.mensagem
          const messageId = result.key?.id ?? null
          if (!result.sent) {
            person.status = 'erro'
            person.detalhe = result.error ?? 'Falha ao enviar a mensagem.'
            await this.note(draw.id, person, 'erro', messageId, person.detalhe)
          } else if (result.ownNumber) {
            person.status = 'enviado'
            person.manter = true
            person.detalhe = PROPRIO
            await this.note(draw.id, person, 'proprio_numero', messageId, null)
          } else if (result.deletedForMe) {
            person.status = 'apagado'
            person.detalhe = APAGADO
            await this.note(draw.id, person, 'apagado', messageId, null)
          } else {
            person.status = 'enviado'
            person.detalhe = NAO_CONFIRMADO
            await this.note(draw.id, person, 'nao_confirmado', messageId, NAO_CONFIRMADO)
          }
        }

        this.progress = { ...this.progress, feitos: index + 1 }
        await this.store.save(draw)
        const hasNext = index < ids.length - 1
        if (hasNext && this.whatsapp.snapshot.status === 'connected') {
          await sleep(intervaloMs)
        }
      }
    } finally {
      this.progress = { ...this.progress, ativo: false }
      await this.store.save(draw)
    }
  }

  private async note(
    sorteioId: string,
    person: StoredParticipant,
    tipo: HistoryType,
    messageId: string | null,
    erro: string | null,
  ) {
    if (!this.history) return
    const existing = await this.history.load()
    const now = new Date().toISOString()
    await this.history.append({
      participantId: person.id,
      destino: maskDestination(person.telefone),
      tipo,
      tentativa: nextAttempt(existing, person.id, sorteioId),
      sentAt: tipo === 'apagado' ? null : now,
      deletedAt: tipo === 'apagado' ? now : null,
      confirmedAt: tipo === 'apagado' || tipo === 'proprio_numero' ? now : null,
      erro,
      messageId,
      sorteioId,
    })
  }
}

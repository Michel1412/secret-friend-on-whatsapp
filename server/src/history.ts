import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mascararDestino } from '../../shared/sync-gate.ts'
import type { HistoryEvent, HistoryType, SendStatus } from '../../shared/types.ts'

export type { HistoryEvent, HistoryType }

const FORBIDDEN = ['sorteado', 'mensagem', 'texto', 'nomeSorteado', 'body']

export function maskDestination(value: string): string {
  return mascararDestino(value)
}

export function nextAttempt(events: readonly HistoryEvent[], participantId: string, sorteioId: string): number {
  const count = events.filter((event) => event.participantId === participantId && event.sorteioId === sorteioId).length
  return count + 1
}

export function deriveMember(events: readonly HistoryEvent[]): { status: SendStatus; detalhe: string; manter: boolean } | null {
  const relevant = events.filter((event) => event.tipo !== 'teste' && event.tipo !== 'consulta')
  const last = relevant.at(-1)
  if (!last) return null
  if (last.tipo === 'apagado') {
    return { status: 'apagado', detalhe: 'Removida do seu WhatsApp. Quem recebeu continua com a mensagem.', manter: false }
  }
  if (last.tipo === 'proprio_numero') {
    return { status: 'enviado', detalhe: 'Enviado para o próprio número, não apagado.', manter: true }
  }
  if (last.tipo === 'erro') {
    return { status: 'erro', detalhe: last.erro ?? 'Falha ao enviar a mensagem.', manter: false }
  }
  if (last.tipo === 'nao_confirmado' || last.tipo === 'enviado' || last.tipo === 'reenviado') {
    return { status: 'enviado', detalhe: 'Enviado (não confirmado apagado).', manter: false }
  }
  return null
}

export class HistoryStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<HistoryEvent[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as HistoryEvent[]
      return Array.isArray(parsed) ? parsed.filter(isEvent) : []
    } catch {
      return []
    }
  }

  async append(event: HistoryEvent): Promise<HistoryEvent[]> {
    assertSafe(event)
    const next = [...(await this.load()), event]
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, JSON.stringify(next), 'utf8')
    await rename(temporary, this.filePath)
    return next
  }

  async forDraw(sorteioId: string | null): Promise<HistoryEvent[]> {
    const all = await this.load()
    if (!sorteioId) return all
    return all.filter((event) => event.sorteioId === sorteioId)
  }
}

function isEvent(value: unknown): value is HistoryEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<HistoryEvent>
  return typeof event.participantId === 'string' && typeof event.tipo === 'string' && typeof event.sorteioId === 'string'
}

function assertSafe(event: HistoryEvent) {
  const raw = JSON.stringify(event)
  for (const key of FORBIDDEN) {
    if (raw.includes(`"${key}"`)) throw new Error('O histórico não pode guardar o sorteio nem o texto.')
  }
}

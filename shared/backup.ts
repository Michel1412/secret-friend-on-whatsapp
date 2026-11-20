import { normalizeBrazilPhone } from './phone'
import type { ParticipantInput } from './types'

export type BackupData = {
  participantes: ParticipantInput[]
  mensagem?: string
  intervaloMs?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readPeople(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  if (!record) throw new Error('O arquivo precisa ser um JSON com a lista de participantes.')
  const list = record.participantes ?? record.participants
  if (!Array.isArray(list)) {
    throw new Error('Não achei a lista "participantes" nesse JSON.')
  }
  return list
}

export function parseBackup(raw: unknown): BackupData {
  const list = readPeople(raw)
  if (list.length === 0) throw new Error('O arquivo não tem participantes.')
  if (list.length > 200) throw new Error('O arquivo passa de 200 pessoas.')

  const participantes: ParticipantInput[] = []
  const seen = new Set<string>()
  list.forEach((item, index) => {
    const record = asRecord(item)
    const nome = String(record?.nome ?? record?.name ?? '').trim()
    const phoneInput = String(record?.telefone ?? record?.phone ?? '')
    const line = index + 1
    if (!nome) throw new Error(`Linha ${line}: falta o nome.`)
    if (nome.length > 80) throw new Error(`Linha ${line}: nome longo demais.`)
    const phone = normalizeBrazilPhone(phoneInput)
    if (!phone.ok) throw new Error(`Linha ${line}: ${phone.error}`)
    if (seen.has(phone.e164)) throw new Error(`Linha ${line}: telefone repetido.`)
    seen.add(phone.e164)
    const id = String(record?.id ?? '').trim() || crypto.randomUUID()
    participantes.push({ id, nome, telefone: phone.e164 })
  })

  const record = asRecord(raw)
  const mensagem = typeof record?.mensagem === 'string' ? record.mensagem : undefined
  const intervalo = Number(record?.intervaloMs)
  const intervaloMs =
    Number.isFinite(intervalo) && intervalo >= 2000 && intervalo <= 15000
      ? Math.round(intervalo)
      : undefined
  return { participantes, mensagem, intervaloMs }
}

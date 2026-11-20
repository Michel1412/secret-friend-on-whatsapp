import { MENSAGEM_PADRAO } from '../shared/template'
import { normalizeBrazilPhone } from '../shared/phone'
import type { ParticipantInput } from '../shared/types'

const PEOPLE = 'secret-friend-on-whatsapp.participantes'
const MESSAGE = 'secret-friend-on-whatsapp.mensagem'
const DELAY = 'secret-friend-on-whatsapp.intervalo'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function loadPeople(): ParticipantInput[] {
  const raw = read(PEOPLE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ParticipantInput[]
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((person) => {
      const nome = String(person?.nome ?? '').trim()
      const phone = normalizeBrazilPhone(String(person?.telefone ?? ''))
      if (!nome || !phone.ok) return []
      return [{ id: String(person.id || crypto.randomUUID()), nome, telefone: phone.e164 }]
    })
  } catch {
    return []
  }
}

export function savePeople(people: ParticipantInput[]) {
  localStorage.setItem(PEOPLE, JSON.stringify(people))
}

export function loadMessage(): string {
  return read(MESSAGE) || MENSAGEM_PADRAO
}

export function saveMessage(message: string) {
  localStorage.setItem(MESSAGE, message)
}

const PAUSES = [2000, 3000, 4000, 6000, 8000]

export function loadDelay(): number {
  const value = Number(read(DELAY))
  return PAUSES.includes(value) ? value : 3000
}

export function saveDelay(delay: number) {
  localStorage.setItem(DELAY, String(delay))
}

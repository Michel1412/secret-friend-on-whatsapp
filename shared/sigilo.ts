import type { ParticipantInput, RevealedPair } from './types'

/** Frase fixa do modal de proteção. Não é uma senha secreta. */
export const FRASE_QUEBRA_SIGILO = 'quero quebrar o sigilo'

export function normalizarFrase(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

export function fraseConfere(input: string): boolean {
  return normalizarFrase(input) === FRASE_QUEBRA_SIGILO
}

export type GateResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterMs?: number }

const MAX_FAILURES = 5
const LOCK_MS = 20_000

export function createSigiloGate(now: () => number = Date.now) {
  let failures = 0
  let lockedUntil = 0

  return {
    reset() {
      failures = 0
      lockedUntil = 0
    },
    attempt(input: string): GateResult {
      const clock = now()
      if (clock < lockedUntil) {
        return {
          ok: false,
          error: 'Muitas tentativas seguidas. Espere 20 segundos e digite de novo.',
          retryAfterMs: lockedUntil - clock,
        }
      }
      if (!fraseConfere(input)) {
        failures += 1
        if (failures >= MAX_FAILURES) {
          failures = 0
          lockedUntil = clock + LOCK_MS
          return {
            ok: false,
            error: 'Muitas tentativas seguidas. O sigilo fica travado por 20 segundos.',
            retryAfterMs: LOCK_MS,
          }
        }
        return { ok: false, error: 'A frase não confere. O sigilo continua fechado.' }
      }
      failures = 0
      lockedUntil = 0
      return { ok: true }
    },
  }
}

export function impressaoDaLista(people: readonly ParticipantInput[]): string {
  return people
    .map((person) => `${person.id}\u001f${person.nome.trim()}\u001f${person.telefone}`)
    .sort()
    .join('\u001e')
}

export function validarPares(pares: readonly RevealedPair[]) {
  const givers = pares.map((pair) => pair.telefone)
  const receivers = pares.map((pair) => pair.telefoneSorteado)
  const sameSet =
    givers.length === receivers.length &&
    givers.every((phone) => receivers.includes(phone)) &&
    new Set(givers).size === givers.length &&
    new Set(receivers).size === receivers.length
  return {
    total: pares.length,
    semAutoSorteio: pares.every((pair) => pair.telefone !== pair.telefoneSorteado),
    bijecao: sameSet,
  }
}

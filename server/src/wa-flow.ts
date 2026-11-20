import { LIMITE_TENTATIVAS_APAGAR, registrarFalhaApagar } from '../../shared/sync-gate.ts'

export type WaNumber = { _serialized: string } | null

export type WaMessageRef = { id: { _serialized: string } }

export function apagadoConfirmado(input: { revoke: boolean; encontrada: boolean }): boolean {
  if (input.revoke) return true
  return !input.encontrada
}

export async function apagarComTentativas(
  attempt: () => Promise<boolean>,
  limite = LIMITE_TENTATIVAS_APAGAR,
): Promise<boolean> {
  let tentativas = 0
  while (tentativas < limite) {
    if (await attempt()) return true
    const next = registrarFalhaApagar(tentativas, limite)
    tentativas = next.tentativas
    if (next.esgotou) return false
  }
  return false
}

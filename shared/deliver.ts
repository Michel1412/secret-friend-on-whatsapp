export type OutboundKey = {
  remoteJid: string
  lid?: string | null
  id: string
  timestamp: number
}

export type DeliveryResult = {
  sent: boolean
  deletedForMe: boolean
  via?: 'mensagem' | 'conversa' | null
  aguardandoChave?: boolean
  ownNumber?: boolean
  key?: OutboundKey
  error?: string
}

export class SendFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SendFailure'
  }
}

/** Seconds since epoch, accepting protobuf Long-like values. */
export function toSeconds(value: unknown): number {
  let numeric: number
  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    numeric = (value as { toNumber: () => number }).toNumber()
  } else if (value && typeof value === 'object' && 'toString' in value) {
    numeric = Number((value as { toString: () => string }).toString())
  } else {
    numeric = Number(value)
  }
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.floor(Date.now() / 1000)
  if (numeric > 10_000_000_000) return Math.floor(numeric / 1000)
  return Math.floor(numeric)
}

/**
 * Payload of WhatsApp "apagar para mim".
 * This is an app-state patch (`deleteMessageForMe`), not a revoke for everyone.
 */
export function deleteForMeModification(key: OutboundKey) {
  return {
    deleteForMe: {
      deleteMedia: false,
      key: {
        remoteJid: key.remoteJid,
        fromMe: true as const,
        id: key.id,
      },
      timestamp: toSeconds(key.timestamp),
    },
  }
}

export async function entregarMensagem(
  deps: {
    sendText: (text: string) => Promise<OutboundKey>
    deleteForMe: (key: OutboundKey) => Promise<boolean>
    sleep: (ms: number) => Promise<void>
  },
  options: { text: string; deleteDelayMs: number; attempts?: number; skipDelete?: boolean },
): Promise<DeliveryResult> {
  const attempts = options.attempts ?? 3
  let key: OutboundKey
  try {
    key = await deps.sendText(options.text)
  } catch (error) {
    const message =
      error instanceof SendFailure ? error.message : 'Falha ao enviar a mensagem.'
    return { sent: false, deletedForMe: false, error: message }
  }

  if (options.skipDelete) {
    return { sent: true, deletedForMe: false, ownNumber: true, key }
  }

  await deps.sleep(options.deleteDelayMs)
  let lastError = 'Enviado (não confirmado apagado).'
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const confirmed = await deps.deleteForMe(key)
      if (confirmed) return { sent: true, deletedForMe: true, key }
      lastError = 'Enviado (não confirmado apagado).'
    } catch (error) {
      if (error instanceof SendFailure) lastError = error.message
      if (attempt < attempts - 1) await deps.sleep(800)
    }
  }
  return { sent: true, deletedForMe: false, key, error: lastError }
}

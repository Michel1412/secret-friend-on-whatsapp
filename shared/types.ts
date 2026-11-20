export type SendStatus = 'pendente' | 'enviado' | 'apagado' | 'erro'

export type ParticipantInput = {
  id: string
  nome: string
  telefone: string
}

export type PublicParticipant = {
  id: string
  nome: string
  telefone: string
  status: SendStatus
  detalhe: string | null
  /** Mensagem do próprio número conectado: foi enviada e não deve ser apagada. */
  manter: boolean
}

export type PublicDraw = {
  id: string
  criadoEm: string
  impressao: string
  participantes: PublicParticipant[]
}

export type RevealedPair = {
  nome: string
  telefone: string
  sorteado: string
  telefoneSorteado: string
}

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

export type WhatsAppSnapshot = {
  status: WhatsAppStatus
  qrDataUrl: string | null
  phone: string | null
  pushName: string | null
  error: string | null
  /** A chave de sincronização do celular já está neste computador. */
  appStateReady: boolean
  appStateReadyEm: string | null
}

export type SendJobView = {
  ativo: boolean
  feitos: number
  total: number
  erro: string | null
}

export type HistoryType =
  | 'consulta'
  | 'enviado'
  | 'apagado'
  | 'nao_confirmado'
  | 'proprio_numero'
  | 'erro'
  | 'reenviado'
  | 'teste'

/** Append-only send log. Never includes the drawn name or the message text. */
export type HistoryEvent = {
  participantId: string
  destino: string
  tipo: HistoryType
  tentativa: number
  sentAt: string | null
  deletedAt: string | null
  confirmedAt: string | null
  erro: string | null
  messageId: string | null
  sorteioId: string
}

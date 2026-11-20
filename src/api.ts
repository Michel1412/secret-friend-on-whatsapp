import type { HistoryEvent, ParticipantInput, PublicDraw, RevealedPair, SendJobView, WhatsAppSnapshot } from '../shared/types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, 'Não consegui falar com o servidor local.')
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) {
    throw new ApiError(response.status, body?.error || 'O servidor recusou o pedido.')
  }
  return body as T
}

export type Perfil = {
  email: string
  participantes: ParticipantInput[]
  mensagem: string
  intervaloMs: number
}

export type PassoApagar = { passo: string; ok: boolean; detalhe: string }

export type TesteRegistro = {
  codigo: string
  destino: string
  em: string
  envioOk: boolean
  apagadoOk: boolean
}

export type WhatsAppView = WhatsAppSnapshot & { testes?: TesteRegistro[] }

export function getSession() {
  return request<{ email: string | null }>('/api/sessao')
}

export function login(email: string) {
  return request<{ email: string }>('/api/sessao', { method: 'POST', body: JSON.stringify({ email }) })
}

export function logoutAccount() {
  return request<{ ok: boolean }>('/api/sessao', { method: 'DELETE' })
}

export function getPerfil() {
  return request<Perfil>('/api/perfil')
}

export function savePerfil(perfil: Omit<Perfil, 'email'>) {
  return request<Perfil>('/api/perfil', { method: 'PUT', body: JSON.stringify(perfil) })
}

export function testarApagar(telefone: string) {
  return request<{ codigo: string; passos: PassoApagar[]; historico: TesteRegistro[] }>('/api/whatsapp/testar-apagar', {
    method: 'POST',
    body: JSON.stringify({ telefone }),
  })
}

export function getWhatsApp() {
  return request<WhatsAppView>('/api/whatsapp')
}

export function connectWhatsApp() {
  return request<WhatsAppSnapshot>('/api/whatsapp/connect', { method: 'POST' })
}

export function logoutWhatsApp() {
  return request<WhatsAppSnapshot>('/api/whatsapp/logout', { method: 'POST' })
}

export function getHistorico(sorteioId?: string) {
  const query = sorteioId ? `?sorteio=${encodeURIComponent(sorteioId)}` : ''
  return request<{ eventos: HistoryEvent[] }>(`/api/historico${query}`)
}

export function getSorteio() {
  return request<{ sorteio: PublicDraw | null; envio: SendJobView }>('/api/sorteio')
}

export function createDraw(participantes: { id: string; nome: string; telefone: string }[]) {
  return request<{ sorteio: PublicDraw }>('/api/sorteio', {
    method: 'POST',
    body: JSON.stringify({ participantes }),
  }).then((body) => body.sorteio)
}

export function quebrarSigilo(frase: string) {
  return request<{ sorteioId: string; criadoEm: string; pares: RevealedPair[] }>('/api/sigilo', {
    method: 'POST',
    body: JSON.stringify({ frase }),
  })
}

export function startSend(mensagem: string, intervaloMs: number) {
  return request<{ envio: SendJobView; sorteio: PublicDraw }>('/api/enviar', {
    method: 'POST',
    body: JSON.stringify({ mensagem, intervaloMs }),
  })
}

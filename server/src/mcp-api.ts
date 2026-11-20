import type { HistoryEvent, PublicDraw, SendJobView, WhatsAppSnapshot } from '../../shared/types.ts'
import type { ParticipantInput } from '../../shared/types.ts'

export type PapelApi = {
  whatsapp(): Promise<WhatsAppSnapshot>
  connect(): Promise<WhatsAppSnapshot>
  perfil(): Promise<{ participantes: ParticipantInput[]; mensagem: string; intervaloMs: number }>
  savePerfil(input: { participantes: ParticipantInput[]; mensagem: string; intervaloMs: number }): Promise<unknown>
  sorteio(): Promise<{ sorteio: PublicDraw | null; envio: SendJobView }>
  criarSorteio(participantes: ParticipantInput[]): Promise<{ sorteio: PublicDraw }>
  enviar(mensagem: string, intervaloMs: number, ids?: string[]): Promise<{ envio: SendJobView; sorteio: PublicDraw }>
  testar(telefone?: string): Promise<{ codigo: string; destino: string; envioOk: boolean; apagadoOk: boolean }>
  historico(sorteioId?: string): Promise<{ eventos: HistoryEvent[] }>
  sigilo(frase: string): Promise<{ pares: { nome: string; telefone: string; sorteado: string; telefoneSorteado: string }[] }>
}

export class RunningAppClient implements PapelApi {
  private cookie = ''

  constructor(
    private readonly base: string,
    private readonly email: string,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.cookie) await this.login()
    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.cookie,
        ...(init?.headers ?? {}),
      },
    })
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) throw new Error(body?.error || 'A API recusou o pedido.')
    return body as T
  }

  private async login() {
    const response = await fetch(`${this.base}/api/sessao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email }),
    })
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) throw new Error(body?.error || 'Não consegui entrar com o e-mail do MCP.')
    const raw = response.headers.get('set-cookie') ?? ''
    this.cookie = raw.split(';')[0] ?? ''
    if (!this.cookie) throw new Error('A API não devolveu o cookie de sessão.')
  }

  whatsapp() {
    return this.call<WhatsAppSnapshot>('/api/whatsapp')
  }
  connect() {
    return this.call<WhatsAppSnapshot>('/api/whatsapp/connect', { method: 'POST' })
  }
  perfil() {
    return this.call<Awaited<ReturnType<PapelApi['perfil']>>>('/api/perfil')
  }
  savePerfil(input: { participantes: ParticipantInput[]; mensagem: string; intervaloMs: number }) {
    return this.call('/api/perfil', { method: 'PUT', body: JSON.stringify(input) })
  }
  sorteio() {
    return this.call<Awaited<ReturnType<PapelApi['sorteio']>>>('/api/sorteio')
  }
  criarSorteio(participantes: ParticipantInput[]) {
    return this.call<Awaited<ReturnType<PapelApi['criarSorteio']>>>('/api/sorteio', {
      method: 'POST',
      body: JSON.stringify({ participantes }),
    })
  }
  enviar(mensagem: string, intervaloMs: number, ids?: string[]) {
    return this.call<Awaited<ReturnType<PapelApi['enviar']>>>('/api/enviar', {
      method: 'POST',
      body: JSON.stringify({ mensagem, intervaloMs, ids }),
    })
  }
  testar(telefone?: string) {
    return this.call<Awaited<ReturnType<PapelApi['testar']>>>('/api/whatsapp/testar-apagar', {
      method: 'POST',
      body: JSON.stringify({ telefone }),
    })
  }
  historico(sorteioId?: string) {
    const query = sorteioId ? `?sorteio=${encodeURIComponent(sorteioId)}` : ''
    return this.call<Awaited<ReturnType<PapelApi['historico']>>>(`/api/historico${query}`)
  }
  sigilo(frase: string) {
    return this.call<Awaited<ReturnType<PapelApi['sigilo']>>>('/api/sigilo', {
      method: 'POST',
      body: JSON.stringify({ frase }),
    })
  }
}

export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function assertLocalBearer(remote: string | undefined, authorization: string | undefined, token: string) {
  if (!isLoopback(remote)) throw Object.assign(new Error('O MCP HTTP só aceita 127.0.0.1.'), { status: 403 })
  if (!token || authorization !== `Bearer ${token}`) {
    throw Object.assign(new Error('Token do MCP inválido.'), { status: 401 })
  }
}

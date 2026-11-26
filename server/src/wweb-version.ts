import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** HTML de uma versão. `{version}` é trocado pela lib. */
export const WWEB_HTML_REMOTO =
  'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'

/** Lista pública. Não é uma versão fixa. */
export const WWEB_LISTA_REMOTA = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json'

export const LIMITE_TENTATIVAS_WWEB = 3

const VERSAO = /^\d+\.\d+\.\d+(?:-alpha)?$/

export type FonteVersao = 'padrao' | 'forcada' | 'guardada' | 'recente'

export type PassoVersao = {
  fonte: FonteVersao
  versao: string | null
}

export type VersaoPublica = {
  version: string
  released?: string
  expire?: string
}

export function versaoValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return VERSAO.test(texto) ? texto : null
}

export function nucleoVersao(versao: string | null | undefined): string {
  return (versao ?? '').replace(/-alpha$/, '')
}

export function mesmaVersao(a: string | null | undefined, b: string | null | undefined): boolean {
  const esquerda = nucleoVersao(a)
  const direita = nucleoVersao(b)
  return Boolean(esquerda) && esquerda === direita
}

/**
 * Próxima abertura. Sem versão forçada: padrão da lib, depois a guardada,
 * depois uma recente da lista. No máximo três, sem repetir a mesma.
 */
export function proximoPasso(entrada: {
  forcada: string | null
  guardada: string | null
  recente: string | null
  tentadas: PassoVersao[]
}): PassoVersao | null {
  if (entrada.tentadas.length >= LIMITE_TENTATIVAS_WWEB) return null
  const forcada = versaoValida(entrada.forcada)
  if (forcada) {
    if (entrada.tentadas.some((passo) => passo.fonte === 'forcada')) return null
    return { fonte: 'forcada', versao: forcada }
  }
  if (!entrada.tentadas.some((passo) => passo.fonte === 'padrao')) {
    return { fonte: 'padrao', versao: null }
  }
  const guardada = versaoValida(entrada.guardada)
  if (guardada && !entrada.tentadas.some((passo) => mesmaVersao(passo.versao, guardada))) {
    return { fonte: 'guardada', versao: guardada }
  }
  const recente = versaoValida(entrada.recente)
  if (recente && !entrada.tentadas.some((passo) => mesmaVersao(passo.versao, recente))) {
    return { fonte: 'recente', versao: recente }
  }
  return null
}

export function ehTimeoutDeCarga(mensagem: string): boolean {
  return /waiting failed:\s*\d+\s*ms exceeded/i.test(mensagem) || /auth timeout/i.test(mensagem) || /ready timeout/i.test(mensagem)
}

export function ehFalhaDeVersao(mensagem: string): boolean {
  return ehTimeoutDeCarga(mensagem) || /couldn't load version/i.test(mensagem)
}

export function lerListaVersoes(json: unknown): { lista: VersaoPublica[]; atual: string | null } {
  if (!json || typeof json !== 'object') return { lista: [], atual: null }
  const corpo = json as { versions?: unknown; currentVersion?: unknown }
  const lista = Array.isArray(corpo.versions)
    ? corpo.versions.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const version = versaoValida((item as { version?: unknown }).version)
        if (!version) return []
        const released = (item as { released?: unknown }).released
        const expire = (item as { expire?: unknown }).expire
        return [
          {
            version,
            released: typeof released === 'string' ? released : undefined,
            expire: typeof expire === 'string' ? expire : undefined,
          },
        ]
      })
    : []
  return { lista, atual: versaoValida(corpo.currentVersion) }
}

/** A mais nova que ainda não foi tentada. A atual da lista sai se a tentativa padrão já falhou. */
export function escolherVersaoRecente(
  lista: VersaoPublica[],
  evitar: Array<string | null>,
  atual: string | null,
  agora = Date.now(),
): string | null {
  const bloqueadas = new Set(evitar.filter((item): item is string => Boolean(item)).map((item) => nucleoVersao(item)))
  if (evitar.some((item) => item == null) && atual) bloqueadas.add(nucleoVersao(atual))
  const candidatas = lista
    .filter((item) => {
      if (!item.expire) return true
      const prazo = Date.parse(item.expire)
      return Number.isFinite(prazo) ? prazo > agora : true
    })
    .filter((item) => !bloqueadas.has(nucleoVersao(item.version)))
    .sort((a, b) => Date.parse(b.released || '0') - Date.parse(a.released || '0'))
  return candidatas[0]?.version ?? null
}

export async function buscarVersaoRecente(opcoes: {
  url: string
  timeoutMs: number
  evitar: Array<string | null>
  fetchImpl?: typeof fetch
  agora?: number
}): Promise<string | null> {
  const fetchImpl = opcoes.fetchImpl ?? fetch
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), opcoes.timeoutMs)
  try {
    const resposta = await fetchImpl(opcoes.url, { signal: controle.signal })
    if (!resposta.ok) return null
    const json: unknown = await resposta.json()
    const { lista, atual } = lerListaVersoes(json)
    return escolherVersaoRecente(lista, opcoes.evitar, atual, opcoes.agora ?? Date.now())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function caminhoVersaoGuardada(dataDir: string): string {
  return path.join(dataDir, 'whatsapp-web-version.json')
}

export async function lerVersaoGuardada(arquivo: string): Promise<string | null> {
  try {
    const cru = await readFile(arquivo, 'utf8')
    const json: unknown = JSON.parse(cru)
    if (!json || typeof json !== 'object') return null
    return versaoValida((json as { versao?: unknown }).versao)
  } catch {
    return null
  }
}

export async function gravarVersaoGuardada(arquivo: string, versao: string): Promise<void> {
  const valida = versaoValida(versao)
  if (!valida) return
  await mkdir(path.dirname(arquivo), { recursive: true })
  await writeFile(arquivo, `${JSON.stringify({ versao: valida })}\n`, 'utf8')
}

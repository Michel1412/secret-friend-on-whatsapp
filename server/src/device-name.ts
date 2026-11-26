/**
 * Nome do aparelho em Aparelhos conectados, sem usar o setDeviceName da lib.
 *
 * whatsapp-web.js 1.34.8 (Client.js, setDeviceName) faz
 * `window.require('WAWebMiscBrowserUtils').info` e quebra com
 * "Cannot read properties of null (reading 'info')" quando o WhatsApp Web
 * novo devolve null. O nome passou para o módulo-função WAWebBrowserInfo
 * no WhatsApp Web 2.3000.10486x (revocx35/wa_logger_mobile, ARCHITECTURE.md;
 * oxidezap/whatsapp-rust#979 chama `WAWebBrowserInfo().os`).
 *
 * `aplicarNomeDoAparelho` não pode fechar sobre imports: o Puppeteer envia
 * o fonte dela para a página. A lista de candidatos fica repetida no corpo.
 */

export const CANDIDATOS_MODULO_NAVEGADOR = ['WAWebMiscBrowserUtils', 'WAWebBrowserInfo'] as const

export type StatusNomeAparelho =
  | { status: 'aplicado'; modulo: string; jaEra: boolean }
  | { status: 'indisponivel'; motivo: 'sem-require' | 'sem-modulo' }

type RequireWhatsApp = ((nome: string) => unknown) & {
  c?: unknown
  cache?: unknown
  modules?: unknown
}

type FuncaoInfo = (this: unknown, ...args: unknown[]) => unknown

/**
 * Procura o módulo do navegador e troca `info` para devolver `os` (aparelho)
 * e `name` (navegador). Não lança: sem módulo, segue com o nome padrão.
 */
export function aplicarNomeDoAparelho(
  aparelho: string,
  navegador: string,
  requireModulo?: RequireWhatsApp | null,
): StatusNomeAparelho {
  const candidatos = ['WAWebMiscBrowserUtils', 'WAWebBrowserInfo']
  try {
    const os = typeof aparelho === 'string' ? aparelho.trim() : ''
    const nomeNavegador = typeof navegador === 'string' ? navegador.trim() : ''
    if (!os && !nomeNavegador) return { status: 'indisponivel', motivo: 'sem-modulo' }

    let pedir = requireModulo ?? null
    if (typeof pedir !== 'function') {
      const globalReq = (globalThis as { require?: unknown }).require
      if (typeof globalReq !== 'function') return { status: 'indisponivel', motivo: 'sem-require' }
      pedir = globalReq as RequireWhatsApp
    }
    const requireAtual = pedir

    const ler = (nome: string): unknown => {
      try {
        return requireAtual(nome)
      } catch {
        return undefined
      }
    }

    const marcado = (valor: unknown): boolean =>
      typeof valor === 'function' && Boolean((valor as { __papelzinhoNome?: boolean }).__papelzinhoNome)

    const embrulhar = (original: FuncaoInfo): FuncaoInfo => {
      const wrapped: FuncaoInfo = function (this: unknown, ...args: unknown[]) {
        let base: Record<string, unknown> = {}
        try {
          const valor = original.apply(this, args)
          if (valor && typeof valor === 'object') base = valor as Record<string, unknown>
        } catch {
          base = {}
        }
        return {
          ...base,
          ...(os ? { os } : {}),
          ...(nomeNavegador ? { name: nomeNavegador } : {}),
        }
      }
      try {
        Object.defineProperty(wrapped, '__papelzinhoNome', { value: true })
      } catch {
        ;(wrapped as { __papelzinhoNome?: boolean }).__papelzinhoNome = true
      }
      return wrapped
    }

    const publicarFuncao = (original: FuncaoInfo, nome: string, wrapped: FuncaoInfo): boolean => {
      const bolsas = [requireAtual.c, requireAtual.cache]
      for (const bolsa of bolsas) {
        if (!bolsa || typeof bolsa !== 'object') continue
        for (const entrada of Object.values(bolsa as Record<string, unknown>)) {
          if (!entrada || typeof entrada !== 'object') continue
          const registro = entrada as { exports?: unknown }
          if (typeof registro.exports === 'function' && registro.exports === original) {
            registro.exports = wrapped
            return true
          }
          if (registro.exports && typeof registro.exports === 'object') {
            const exp = registro.exports as { default?: unknown }
            if (typeof exp.default === 'function' && exp.default === original) {
              exp.default = wrapped
              return true
            }
          }
        }
      }
      const globalReq = (globalThis as { require?: unknown }).require
      if (typeof globalReq !== 'function' || globalReq !== requireAtual) return false
      const ja = globalReq as { __papelzinhoRequire?: Record<string, unknown> }
      if (ja.__papelzinhoRequire) {
        ja.__papelzinhoRequire[nome] = wrapped
        return true
      }
      const overrides: Record<string, unknown> = { [nome]: wrapped }
      const patched: RequireWhatsApp = function (this: unknown, ...args: unknown[]) {
        const chave = args[0]
        if (typeof chave === 'string' && Object.prototype.hasOwnProperty.call(overrides, chave)) return overrides[chave]
        return (globalReq as FuncaoInfo).apply(this, args)
      }
      for (const chave of Object.getOwnPropertyNames(globalReq)) {
        if (chave === 'prototype' || chave === 'arguments' || chave === 'caller') continue
        try {
          const desc = Object.getOwnPropertyDescriptor(globalReq, chave)
          if (desc) Object.defineProperty(patched, chave, desc)
        } catch {
          // propriedade só de leitura
        }
      }
      try {
        Object.defineProperty(patched, '__papelzinhoRequire', { value: overrides })
      } catch {
        ;(patched as { __papelzinhoRequire?: Record<string, unknown> }).__papelzinhoRequire = overrides
      }
      try {
        ;(globalThis as { require: unknown }).require = patched
        return true
      } catch {
        return false
      }
    }

    const sonda = (fn: FuncaoInfo): 'ok' | 'nao' => {
      try {
        const valor = fn()
        if (!valor || typeof valor !== 'object') return 'nao'
        const registro = valor as { name?: unknown; os?: unknown }
        if (typeof registro.name === 'string' || typeof registro.os === 'string') return 'ok'
        return 'nao'
      } catch {
        return 'nao'
      }
    }

    const temCaraDeNavegador = (modulo: object): boolean => {
      const registro = modulo as { startDownloading?: unknown; hardRefresh?: unknown }
      return typeof registro.startDownloading === 'function' || typeof registro.hardRefresh === 'function'
    }

    const nomeDeFuncao = (nome: string): boolean =>
      /WAWebBrowserInfo|WAWebMiscBrowserUtils|WAWebBrowserUtils|WAWebUserAgent|BrowserInfo|MiscBrowser/i.test(nome)

    const aplicarMetodo = (nome: string, modulo: object, conhecido: boolean): StatusNomeAparelho | null => {
      const info = (modulo as { info?: unknown }).info
      if (marcado(info)) return { status: 'aplicado', modulo: nome, jaEra: true }
      if (typeof info !== 'function') return null
      if (!conhecido) {
        if (!temCaraDeNavegador(modulo)) return null
        if (sonda(info as FuncaoInfo) !== 'ok') return null
      }
      ;(modulo as { info: FuncaoInfo }).info = embrulhar(info as FuncaoInfo)
      return { status: 'aplicado', modulo: nome, jaEra: false }
    }

    const aplicarFuncao = (nome: string, fn: FuncaoInfo, conhecido: boolean): StatusNomeAparelho | null => {
      if (marcado(fn)) return { status: 'aplicado', modulo: nome, jaEra: true }
      if (!conhecido && !nomeDeFuncao(nome)) return null
      if (sonda(fn) !== 'ok') return null
      const wrapped = embrulhar(fn)
      if (!publicarFuncao(fn, nome, wrapped)) return null
      return { status: 'aplicado', modulo: nome, jaEra: false }
    }

    const aplicarModulo = (nome: string, valor: unknown, conhecido: boolean): StatusNomeAparelho | null => {
      let bruto = valor
      if (bruto && typeof bruto === 'object' && 'exports' in (bruto as { exports?: unknown })) {
        const exp = (bruto as { exports?: unknown }).exports
        if (exp !== undefined) bruto = exp
      }
      if (typeof bruto === 'function') return aplicarFuncao(nome, bruto as FuncaoInfo, conhecido)
      if (!bruto || typeof bruto !== 'object') return null
      const direto = aplicarMetodo(nome, bruto, conhecido)
      if (direto) return direto
      const padrao = (bruto as { default?: unknown }).default
      if (typeof padrao === 'function') {
        if (marcado(padrao)) return { status: 'aplicado', modulo: nome, jaEra: true }
        if (!conhecido && !nomeDeFuncao(nome)) return null
        if (sonda(padrao as FuncaoInfo) !== 'ok') return null
        ;(bruto as { default: FuncaoInfo }).default = embrulhar(padrao as FuncaoInfo)
        return { status: 'aplicado', modulo: nome, jaEra: false }
      }
      if (padrao && typeof padrao === 'object') return aplicarMetodo(nome, padrao, conhecido)
      return null
    }

    for (const nome of candidatos) {
      const modulo = ler(nome)
      if (modulo == null) continue
      const status = aplicarModulo(nome, modulo, true)
      if (status) return status
    }

    const mapas: Record<string, unknown>[] = []
    const debug = ler('__debug')
    if (debug && typeof debug === 'object') {
      const registro = debug as { modulesMap?: unknown; modules?: unknown }
      if (registro.modulesMap && typeof registro.modulesMap === 'object') {
        mapas.push(registro.modulesMap as Record<string, unknown>)
      }
      if (registro.modules && typeof registro.modules === 'object') mapas.push(registro.modules as Record<string, unknown>)
    }
    if (requireAtual.modules && typeof requireAtual.modules === 'object') {
      mapas.push(requireAtual.modules as Record<string, unknown>)
    }
    for (const mapa of mapas) {
      for (const nome of Object.keys(mapa)) {
        if (candidatos.includes(nome)) continue
        const status = aplicarModulo(nome, mapa[nome], false)
        if (status) return status
      }
    }
    return { status: 'indisponivel', motivo: 'sem-modulo' }
  } catch {
    return { status: 'indisponivel', motivo: 'sem-modulo' }
  }
}

export type PaginaNome = {
  evaluate?: (fn: (...args: any[]) => unknown, ...args: any[]) => Promise<unknown>
  waitForFunction?: (condicao: string, opcoes?: { timeout?: number }) => Promise<unknown>
}

export type ClienteNome = {
  pupPage?: PaginaNome | null
  setDeviceName?: (...args: unknown[]) => Promise<void>
}

/**
 * A lib chama setDeviceName dentro de inject(), depois de `window.Debug.VERSION`
 * e antes de montar o QR (Client.js 1.34.8, por volta das linhas 132 e 1377).
 * Trocar esse método evita o evaluate frágil. O vigia cobre uma lib nova que
 * deixe de chamar setDeviceName: a página já carregou, o pareamento ainda não.
 */
export function instalarNomeDoAparelho(
  client: ClienteNome,
  aparelho: string,
  navegador: string,
  avisar: (nivel: 'info' | 'warn', mensagem: string, extra: Record<string, unknown>) => void,
): () => void {
  let parado = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let resolverEspera: (() => void) | undefined
  let jaAvisouIndisponivel = false

  const registrar = (resultado: StatusNomeAparelho | undefined) => {
    if (!resultado || (resultado.status === 'aplicado' && resultado.jaEra)) return
    if (resultado.status === 'aplicado') {
      jaAvisouIndisponivel = true
      avisar('info', 'nome do aparelho aplicado', { modulo: resultado.modulo })
      return
    }
    if (resultado.motivo === 'sem-require' || jaAvisouIndisponivel) return
    jaAvisouIndisponivel = true
    avisar('warn', 'nome do aparelho indisponível; a conexão segue', {})
  }

  const aplicarNaPagina = async () => {
    const pagina = client.pupPage
    if (!pagina || typeof pagina.evaluate !== 'function') return
    try {
      registrar((await pagina.evaluate(aplicarNomeDoAparelho, aparelho, navegador)) as StatusNomeAparelho)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido'
      avisar('warn', 'não apliquei o nome do aparelho', { message })
    }
  }

  if (typeof client.setDeviceName === 'function') {
    client.setDeviceName = async () => {
      await aplicarNaPagina()
    }
  }

  const parar = () => {
    parado = true
    if (timer) clearTimeout(timer)
    resolverEspera?.()
  }

  const ciclo = async () => {
    const limite = Date.now() + 30_000
    while (!parado && Date.now() < limite) {
      const pagina = client.pupPage
      if (pagina && typeof pagina.waitForFunction === 'function') {
        try {
          await pagina.waitForFunction(
            'window.Debug?.VERSION != undefined && typeof window.require === "function"',
            { timeout: Math.max(1000, limite - Date.now()) },
          )
        } catch (error) {
          if (!parado) {
            const message = error instanceof Error ? error.message : 'erro desconhecido'
            avisar('warn', 'não apliquei o nome do aparelho', { message })
          }
          return
        }
        await aplicarNaPagina()
        return
      }
      if (pagina && typeof pagina.evaluate === 'function') {
        let pronto = false
        try {
          pronto = Boolean(
            await pagina.evaluate(() => {
              const alvo = globalThis as { require?: unknown; Debug?: { VERSION?: unknown } }
              return typeof alvo.require === 'function' && Boolean(alvo.Debug?.VERSION)
            }),
          )
        } catch {
          pronto = false
        }
        if (pronto) {
          await aplicarNaPagina()
          return
        }
      }
      if (parado) return
      await new Promise<void>((resolve) => {
        resolverEspera = resolve
        timer = setTimeout(() => {
          timer = undefined
          resolve()
        }, 15)
      })
    }
  }

  void ciclo().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'erro desconhecido'
    avisar('warn', 'não apliquei o nome do aparelho', { message })
  })

  return parar
}

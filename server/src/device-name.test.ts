import { afterEach, describe, expect, it, vi } from 'vitest'
import { CANDIDATOS_MODULO_NAVEGADOR, aplicarNomeDoAparelho, instalarNomeDoAparelho, type ClienteNome } from './device-name'

type Info = { name?: string; os?: string; ua?: string }

afterEach(() => {
  delete (globalThis as { require?: unknown }).require
  delete (globalThis as { Debug?: unknown }).Debug
})

function requireNome(modulos: Record<string, unknown>) {
  const vistos: string[] = []
  const pedir = (nome: string) => {
    vistos.push(nome)
    if (Object.prototype.hasOwnProperty.call(modulos, nome)) return modulos[nome]
    return null
  }
  return { pedir, vistos }
}

describe('aplicarNomeDoAparelho', () => {
  it('usa os candidatos conhecidos, começando por WAWebMiscBrowserUtils', () => {
    expect([...CANDIDATOS_MODULO_NAVEGADOR]).toEqual(['WAWebMiscBrowserUtils', 'WAWebBrowserInfo'])
    const fonte = aplicarNomeDoAparelho.toString()
    expect(fonte.indexOf('WAWebMiscBrowserUtils')).toBeGreaterThan(-1)
    expect(fonte.indexOf('WAWebMiscBrowserUtils')).toBeLessThan(fonte.indexOf('WAWebBrowserInfo'))
  })

  it('aplica pelo módulo principal e mantém os outros campos', () => {
    const info = () => ({ name: 'Chrome', os: 'Linux', ua: 'ua-teste' })
    const modulo = { info }
    const { pedir, vistos } = requireNome({ WAWebMiscBrowserUtils: modulo })
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(status).toEqual({ status: 'aplicado', modulo: 'WAWebMiscBrowserUtils', jaEra: false })
    expect(vistos[0]).toBe('WAWebMiscBrowserUtils')
    expect(modulo.info()).toEqual({ name: 'Chrome', os: 'Papelzinho - ZAP', ua: 'ua-teste' })
    const deNovo = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(deNovo).toEqual({ status: 'aplicado', modulo: 'WAWebMiscBrowserUtils', jaEra: true })
    expect(modulo.info()).toEqual({ name: 'Chrome', os: 'Papelzinho - ZAP', ua: 'ua-teste' })
  })

  it('a função serializada roda sem o escopo do módulo', () => {
    const isolada = new Function(`return (${aplicarNomeDoAparelho.toString()})`)() as typeof aplicarNomeDoAparelho
    const modulo = { info: () => ({ name: 'Chrome', os: 'Linux', ua: 'ua' }) }
    const status = isolada(' Papelzinho - ZAP ', 'Chrome', ((nome: string) =>
      nome === 'WAWebMiscBrowserUtils' ? modulo : null) as (nome: string) => unknown)
    expect(status).toMatchObject({ status: 'aplicado', modulo: 'WAWebMiscBrowserUtils', jaEra: false })
    expect(modulo.info()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome', ua: 'ua' })
  })

  it('acha o candidato alternativo quando o principal vem null', () => {
    const info = () => ({ name: 'Firefox', os: 'Mac OS' })
    const modulo = { info }
    const { pedir, vistos } = requireNome({
      WAWebMiscBrowserUtils: null,
      WAWebBrowserInfo: modulo,
    })
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(status).toEqual({ status: 'aplicado', modulo: 'WAWebBrowserInfo', jaEra: false })
    expect(vistos.slice(0, 2)).toEqual(['WAWebMiscBrowserUtils', 'WAWebBrowserInfo'])
    expect(modulo.info()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome' })
  })

  it('não lança quando o require estoura', () => {
    const pedir = () => {
      throw new Error('modulo sumiu')
    }
    expect(() => aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)).not.toThrow()
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(status).toEqual({ status: 'indisponivel', motivo: 'sem-modulo' })
  })

  it('não lança quando o require devolve null', () => {
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', () => null)
    expect(status).toEqual({ status: 'indisponivel', motivo: 'sem-modulo' })
  })

  it('não lança quando info não é função', () => {
    const modulo = { info: { name: 'Chrome', os: 'Linux' } }
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', () => modulo)
    expect(status).toEqual({ status: 'indisponivel', motivo: 'sem-modulo' })
    expect(modulo.info).toEqual({ name: 'Chrome', os: 'Linux' })
  })

  it('cobre info que devolve null ou que lança, sem estourar na hora de ler', () => {
    const nulo = { info: () => null as unknown as Info }
    aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) => (nome === 'WAWebMiscBrowserUtils' ? nulo : null))
    expect(nulo.info()).toEqual({ os: 'Papelzinho - ZAP', name: 'Chrome' })

    const quebrado = {
      info: () => {
        throw new Error('cedo')
      },
    }
    aplicarNomeDoAparelho('Papelzinho - ZAP', '', (nome) => (nome === 'WAWebMiscBrowserUtils' ? quebrado : null))
    expect(quebrado.info()).toEqual({ os: 'Papelzinho - ZAP' })
  })

  it('grava só o navegador quando o aparelho vem vazio e aceita default.info', () => {
    const interno = { info: () => ({ name: 'Edge', os: 'Windows', ua: 'ua' }) }
    const modulo = { default: interno }
    const status = aplicarNomeDoAparelho('  ', 'Chrome', (nome) => (nome === 'WAWebMiscBrowserUtils' ? modulo : null))
    expect(status).toMatchObject({ status: 'aplicado', modulo: 'WAWebMiscBrowserUtils' })
    expect(interno.info()).toEqual({ name: 'Chrome', os: 'Windows', ua: 'ua' })
  })

  it('substitui a função do módulo no cache e também o default função', () => {
    const original = () => ({ name: 'Chrome', os: 'Linux', ua: 'ua' })
    const cache = { mod: { exports: original }, vazio: null, nada: 1, solto: { exports: { default: () => ({ foo: 1 }) } } }
    const pedir = Object.assign(
      (nome: string) => (nome === 'WAWebBrowserInfo' ? cache.mod.exports : null),
      { c: cache, cache: 'ignorar' },
    )
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(status).toEqual({ status: 'aplicado', modulo: 'WAWebBrowserInfo', jaEra: false })
    expect((pedir('WAWebBrowserInfo') as () => Info)()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome', ua: 'ua' })
    const deNovo = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(deNovo).toMatchObject({ jaEra: true, modulo: 'WAWebBrowserInfo' })

    const solto = () => ({ name: 'Chrome', os: 'Linux' })
    const caixa = { default: solto }
    const statusCaixa = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) =>
      nome === 'WAWebBrowserInfo' ? caixa : null,
    )
    expect(statusCaixa).toMatchObject({ status: 'aplicado', modulo: 'WAWebBrowserInfo', jaEra: false })
    expect(caixa.default()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome' })
    expect(aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) => (nome === 'WAWebBrowserInfo' ? caixa : null))).toMatchObject({
      jaEra: true,
    })
  })

  it('não troca uma função que não devolve name/os nem uma que não dá para publicar', () => {
    const ruim = () => {
      throw new Error('nao e info')
    }
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) => (nome === 'WAWebBrowserInfo' ? ruim : null))
    expect(status.status).toBe('indisponivel')
    expect(() => ruim()).toThrow('nao e info')

    const info = () => ({ name: 'Chrome', os: 'Linux' })
    const semOnde = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) => (nome === 'WAWebBrowserInfo' ? info : null))
    expect(semOnde.status).toBe('indisponivel')
    expect(info()).toEqual({ name: 'Chrome', os: 'Linux' })
  })

  it('troca o require global quando o módulo é a própria função', () => {
    const original = () => ({ name: 'Chrome', os: 'Linux' })
    const pedir = (nome: string) => (nome === 'WAWebBrowserInfo' ? original : null)
    ;(globalThis as { require?: unknown }).require = pedir
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome')
    expect(status).toMatchObject({ status: 'aplicado', modulo: 'WAWebBrowserInfo', jaEra: false })
    const atual = (globalThis as { require: (nome: string) => () => Info }).require
    expect(atual('WAWebBrowserInfo')()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome' })
    expect(atual('WAWebConnModel')).toBe(null)
  })

  it('segue sem editar se o require global não deixa substituir', () => {
    const original = () => ({ name: 'Chrome', os: 'Linux' })
    const pedir = (nome: string) => (nome === 'WAWebBrowserInfo' ? original : null)
    Object.defineProperty(globalThis, 'require', { value: pedir, writable: false, configurable: true })
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(status).toEqual({ status: 'indisponivel', motivo: 'sem-modulo' })
    expect(original()).toEqual({ name: 'Chrome', os: 'Linux' })
  })

  it('varre módulos carregados e só troca quem tem cara de navegador', () => {
    const ignorar = { info: () => ({ name: 'Chrome', os: 'Linux' }) }
    const porHardRefresh = {
      info: () => ({ name: 'Chrome', os: 'Linux', ua: 'ua' }),
      hardRefresh: () => undefined,
    }
    const semForma = { info: () => ({ versao: 1 }) , startDownloading: () => undefined }
    const pedir = Object.assign(
      (nome: string) => {
        if (nome === '__debug') {
          return {
            modules: { WAWebMiscBrowserUtils: null },
            modulesMap: {
              CoisaQualquer: ignorar,
              SemForma: semForma,
              WAWebBrowserUtils: porHardRefresh,
            },
          }
        }
        return null
      },
      {
        modules: {
          Numero: 1,
          FuncaoSolta: () => ({ name: 'Chrome', os: 'Linux' }),
          WAWebUserAgent: () => ({ name: 'Safari', os: 'Mac OS' }),
        },
      },
    )
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(status).toEqual({ status: 'aplicado', modulo: 'WAWebBrowserUtils', jaEra: false })
    expect(porHardRefresh.info()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome', ua: 'ua' })
    expect(ignorar.info()).toEqual({ name: 'Chrome', os: 'Linux' })
    expect(semForma.info()).toEqual({ versao: 1 })
  })

  it('também acha startDownloading e um módulo-função pelo nome', () => {
    const baixando = {
      info: () => ({ name: 'Chrome', os: 'Linux' }),
      startDownloading: () => undefined,
    }
    const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) => {
      if (nome === '__debug') return { modulesMap: { OutroNome: { exports: baixando } } }
      return null
    })
    expect(status).toMatchObject({ status: 'aplicado', modulo: 'OutroNome' })
    expect(baixando.info()).toMatchObject({ os: 'Papelzinho - ZAP' })

    const fn = () => ({ name: 'Chrome', os: 'Linux' })
    const cache = { id: { exports: fn } }
    const pedir = Object.assign((nome: string) => (nome === '__debug' ? { modulesMap: { WAWebUserAgent: fn } } : null), {
      c: cache,
    })
    const publicado = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir)
    expect(publicado).toMatchObject({ status: 'aplicado', modulo: 'WAWebUserAgent' })
    expect((cache.id.exports as () => Info)()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome' })
  })

  it('devolve indisponível sem require e quando a leitura do mapa estoura', () => {
    expect(aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome')).toEqual({ status: 'indisponivel', motivo: 'sem-require' })
    expect(aplicarNomeDoAparelho('', '  ')).toEqual({ status: 'indisponivel', motivo: 'sem-modulo' })
    const pedir = new Proxy((() => null) as (nome: string) => unknown, {
      get() {
        throw new Error('mapa')
      },
    })
    expect(aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', pedir as (nome: string) => unknown)).toEqual({
      status: 'indisponivel',
      motivo: 'sem-modulo',
    })
  })

  it('grava a marca mesmo se defineProperty falhar', () => {
    const original = Object.defineProperty
    Object.defineProperty = (() => {
      throw new Error('sem define')
    }) as typeof Object.defineProperty
    try {
      const modulo = { info: () => ({ name: 'Chrome', os: 'Linux' }) }
      const status = aplicarNomeDoAparelho('Papelzinho - ZAP', 'Chrome', (nome) =>
        nome === 'WAWebMiscBrowserUtils' ? modulo : null,
      )
      expect(status).toMatchObject({ status: 'aplicado', jaEra: false })
      expect(modulo.info()).toMatchObject({ os: 'Papelzinho - ZAP' })
    } finally {
      Object.defineProperty = original
    }
  })
})

describe('instalarNomeDoAparelho', () => {
  const avisos: { nivel: string; mensagem: string; extra: Record<string, unknown> }[] = []
  const avisar = (nivel: 'info' | 'warn', mensagem: string, extra: Record<string, unknown>) => {
    avisos.push({ nivel, mensagem, extra })
  }

  afterEach(() => {
    avisos.length = 0
  })

  it('troca setDeviceName e registra o módulo achado uma vez', async () => {
    const modulo = { info: () => ({ name: 'Chrome', os: 'Linux', ua: 'ua' }) }
    ;(globalThis as { require?: unknown }).require = (nome: string) => (nome === 'WAWebMiscBrowserUtils' ? modulo : null)
    let prontos = 0
    const client: ClienteNome = {
      pupPage: {
        evaluate: vi.fn(async (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
          if (args.length === 0) {
            prontos += 1
            return false
          }
          return fn(...args)
        }),
      },
      setDeviceName: async () => {
        throw new Error('original não pode rodar')
      },
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    try {
      await client.setDeviceName?.()
      await client.setDeviceName?.()
      expect(modulo.info()).toMatchObject({ os: 'Papelzinho - ZAP', name: 'Chrome', ua: 'ua' })
      expect(avisos.filter((aviso) => aviso.nivel === 'info')).toEqual([
        { nivel: 'info', mensagem: 'nome do aparelho aplicado', extra: { modulo: 'WAWebMiscBrowserUtils' } },
      ])
    } finally {
      parar()
    }
    expect(prontos).toBeGreaterThan(0)
  })

  it('não quebra se a página ou o setDeviceName não existem', async () => {
    const client: ClienteNome = {}
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    parar()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(avisos).toEqual([])
  })

  it('avisa e segue quando o evaluate ou o waitForFunction falham', async () => {
    const client: ClienteNome = {
      pupPage: {
        waitForFunction: vi.fn(async () => {
          throw new Error('timeout')
        }),
        evaluate: vi.fn(async () => {
          throw new Error('pagina caiu')
        }),
      },
      setDeviceName: async () => undefined,
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    try {
      await client.setDeviceName?.()
      await vi.waitFor(() => expect(avisos.some((aviso) => aviso.extra.message === 'timeout')).toBe(true))
    } finally {
      parar()
    }
    expect(avisos).toEqual(
      expect.arrayContaining([
        { nivel: 'warn', mensagem: 'não apliquei o nome do aparelho', extra: { message: 'pagina caiu' } },
        { nivel: 'warn', mensagem: 'não apliquei o nome do aparelho', extra: { message: 'timeout' } },
      ]),
    )
  })

  it('ignora a falha do waitForFunction se a vigia já parou', async () => {
    let rejeitar!: (erro: unknown) => void
    const client: ClienteNome = {
      pupPage: {
        waitForFunction: () =>
          new Promise((_, reject) => {
            rejeitar = reject
          }),
      },
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    await new Promise((resolve) => setTimeout(resolve, 10))
    parar()
    rejeitar('abortado')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(avisos).toEqual([])
  })

  it('espera a página ficar pronta e então aplica', async () => {
    const modulo = { info: () => ({ name: 'Chrome', os: 'Linux' }) }
    ;(globalThis as { require?: unknown }).require = (nome: string) => (nome === 'WAWebMiscBrowserUtils' ? modulo : null)
    ;(globalThis as { Debug?: unknown }).Debug = { VERSION: '2.3000.0' }
    let leituras = 0
    const client: ClienteNome = {
      pupPage: null,
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    try {
      await new Promise((resolve) => setTimeout(resolve, 20))
      client.pupPage = {
        evaluate: async (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
          if (args.length === 0) {
            leituras += 1
            if (leituras === 1) throw new Error('cedo')
          }
          return fn(...args)
        },
      }
      await vi.waitFor(() => expect(modulo.info()).toMatchObject({ os: 'Papelzinho - ZAP' }))
      expect(avisos.some((aviso) => aviso.nivel === 'info')).toBe(true)
    } finally {
      parar()
    }
  })

  it('avisa indisponível uma vez e não trata falta de require como erro', async () => {
    ;(globalThis as { require?: unknown }).require = () => null
    const client: ClienteNome = {
      pupPage: {
        waitForFunction: async () => true,
        evaluate: async (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
      },
      setDeviceName: async () => undefined,
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    try {
      await client.setDeviceName?.()
      await vi.waitFor(() => expect(avisos.some((aviso) => aviso.mensagem.includes('indisponível'))).toBe(true))
      const antes = avisos.length
      await client.setDeviceName?.()
      expect(avisos.length).toBe(antes)
    } finally {
      parar()
    }
  })

  it('registra erro inesperado da vigia', async () => {
    let leituras = 0
    const client = {
      get pupPage(): ClienteNome['pupPage'] {
        leituras += 1
        if (leituras === 1) throw new Error('leitura')
        return null
      },
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    try {
      await vi.waitFor(() => expect(avisos.some((aviso) => aviso.extra.message === 'leitura')).toBe(true))
    } finally {
      parar()
    }
  })

  it('aceita falha que não é Error', async () => {
    const client: ClienteNome = {
      pupPage: {
        evaluate: async () => {
          throw 'pagina'
        },
      },
      setDeviceName: async () => undefined,
    }
    const parar = instalarNomeDoAparelho(client, 'Papelzinho - ZAP', 'Chrome', avisar)
    try {
      await client.setDeviceName?.()
      expect(avisos).toContainEqual({
        nivel: 'warn',
        mensagem: 'não apliquei o nome do aparelho',
        extra: { message: 'erro desconhecido' },
      })
    } finally {
      parar()
    }
  })
})

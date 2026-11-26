import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buscarVersaoRecente,
  caminhoVersaoGuardada,
  escolherVersaoRecente,
  ehFalhaDeVersao,
  ehTimeoutDeCarga,
  gravarVersaoGuardada,
  lerVersaoGuardada,
  proximoPasso,
  type PassoVersao,
} from './wweb-version'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const lista = [
  { version: '2.3000.1000000001-alpha', released: '2026-09-01T00:00:00.000Z', expire: '2026-10-01T00:00:00.000Z' },
  { version: '2.3000.1050000001-alpha', released: '2026-11-01T00:00:00.000Z', expire: '2027-01-01T00:00:00.000Z' },
  { version: '2.3000.1056305113-alpha', released: '2026-11-26T00:00:00.000Z', expire: '2027-01-26T00:00:00.000Z' },
]

describe('ordem das versões do WhatsApp Web', () => {
  it('sem WWEB_VERSION começa pelo padrão, depois a guardada e então uma recente', () => {
    const tentadas: PassoVersao[] = []
    expect(proximoPasso({ forcada: null, guardada: '2.3000.1050000001-alpha', recente: null, tentadas })).toEqual({
      fonte: 'padrao',
      versao: null,
    })
    tentadas.push({ fonte: 'padrao', versao: '2.3000.1056305113' })
    expect(proximoPasso({ forcada: null, guardada: '2.3000.1050000001-alpha', recente: null, tentadas })).toEqual({
      fonte: 'guardada',
      versao: '2.3000.1050000001-alpha',
    })
    tentadas.push({ fonte: 'guardada', versao: '2.3000.1050000001-alpha' })
    expect(
      proximoPasso({
        forcada: null,
        guardada: '2.3000.1050000001-alpha',
        recente: '2.3000.1040000002-alpha',
        tentadas,
      }),
    ).toEqual({ fonte: 'recente', versao: '2.3000.1040000002-alpha' })
    tentadas.push({ fonte: 'recente', versao: '2.3000.1040000002-alpha' })
    expect(proximoPasso({ forcada: null, guardada: '2.3000.1.1', recente: '2.3000.1.2', tentadas })).toBeNull()
  })

  it('sem versão guardada pula para a recente e não repete a que já falhou', () => {
    const tentadas: PassoVersao[] = [{ fonte: 'padrao', versao: null }]
    expect(proximoPasso({ forcada: null, guardada: null, recente: '2.3000.1050000001-alpha', tentadas })).toEqual({
      fonte: 'recente',
      versao: '2.3000.1050000001-alpha',
    })
    expect(
      proximoPasso({
        forcada: null,
        guardada: '2.3000.1056305113-alpha',
        recente: '2.3000.1050000001-alpha',
        tentadas: [{ fonte: 'padrao', versao: '2.3000.1056305113' }],
      }),
    ).toEqual({ fonte: 'recente', versao: '2.3000.1050000001-alpha' })
  })

  it('WWEB_VERSION força uma versão e não entra na cascata', () => {
    expect(proximoPasso({ forcada: ' 2.3000.1040000000-alpha ', guardada: '2.3000.1.1', recente: '2.3000.1.2', tentadas: [] })).toEqual({
      fonte: 'forcada',
      versao: '2.3000.1040000000-alpha',
    })
    expect(
      proximoPasso({
        forcada: '2.3000.1040000000-alpha',
        guardada: '2.3000.1.1',
        recente: '2.3000.1.2',
        tentadas: [{ fonte: 'forcada', versao: '2.3000.1040000000-alpha' }],
      }),
    ).toBeNull()
    expect(proximoPasso({ forcada: 'nao-e-versao', guardada: null, recente: null, tentadas: [] })).toEqual({
      fonte: 'padrao',
      versao: null,
    })
  })

  it('escolhe a recente que não é a atual nem está vencida', () => {
    const agora = Date.parse('2026-11-26T12:00:00.000Z')
    expect(escolherVersaoRecente(lista, [null], '2.3000.1056305113-alpha', agora)).toBe('2.3000.1050000001-alpha')
    expect(escolherVersaoRecente(lista, ['2.3000.1050000001'], '2.3000.1056305113-alpha', agora)).toBe(
      '2.3000.1056305113-alpha',
    )
    expect(escolherVersaoRecente(lista, ['2.3000.1050000001', '2.3000.1056305113-alpha'], null, agora)).toBeNull()
  })

  it('a lista fora do ar ou lenta devolve null', async () => {
    const fora = await buscarVersaoRecente({
      url: 'https://exemplo.test/versions.json',
      timeoutMs: 50,
      evitar: [null],
      fetchImpl: async () => {
        throw new Error('rede')
      },
    })
    expect(fora).toBeNull()
    const lenta = await buscarVersaoRecente({
      url: 'https://exemplo.test/versions.json',
      timeoutMs: 20,
      evitar: [],
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('abort')))
        }),
    })
    expect(lenta).toBeNull()
    const http = await buscarVersaoRecente({
      url: 'https://exemplo.test/versions.json',
      timeoutMs: 50,
      evitar: [],
      fetchImpl: async () => new Response('nope', { status: 503 }),
    })
    expect(http).toBeNull()
  })

  it('lê a lista e guarda só o número da versão', async () => {
    const agora = Date.parse('2026-11-26T12:00:00.000Z')
    const achada = await buscarVersaoRecente({
      url: 'https://exemplo.test/versions.json',
      timeoutMs: 50,
      evitar: [null],
      agora,
      fetchImpl: async () =>
        Response.json({
          currentVersion: '2.3000.1056305113-alpha',
          versions: lista,
        }),
    })
    expect(achada).toBe('2.3000.1050000001-alpha')

    const dir = await mkdtemp(path.join(tmpdir(), 'papel-versao-'))
    dirs.push(dir)
    const arquivo = caminhoVersaoGuardada(dir)
    expect(await lerVersaoGuardada(arquivo)).toBeNull()
    await gravarVersaoGuardada(arquivo, '2.3000.1050000001-alpha')
    expect(JSON.parse(await readFile(arquivo, 'utf8'))).toEqual({ versao: '2.3000.1050000001-alpha' })
    expect(await lerVersaoGuardada(arquivo)).toBe('2.3000.1050000001-alpha')
    await gravarVersaoGuardada(arquivo, 'texto solto')
    expect(await lerVersaoGuardada(arquivo)).toBe('2.3000.1050000001-alpha')
  })

  it('reconhece timeout e falha de versão, e ignora outro erro', () => {
    expect(ehTimeoutDeCarga('Waiting failed: 30000ms exceeded')).toBe(true)
    expect(ehTimeoutDeCarga('auth timeout')).toBe(true)
    expect(ehTimeoutDeCarga('ready timeout')).toBe(true)
    expect(ehFalhaDeVersao("Couldn't load version 2.3000.1 from the archive")).toBe(true)
    expect(ehTimeoutDeCarga('chrome ausente')).toBe(false)
    expect(ehFalhaDeVersao('The browser is already running')).toBe(false)
  })
})

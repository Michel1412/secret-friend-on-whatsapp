import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { boundedInteger, clampSendDelay } from './config.ts'
import { DrawStore, montarSorteio } from './draw-store.ts'
import { ProfileStore } from './profile.ts'
import { TestLog } from './test-log.ts'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('arquivos locais', () => {
  it('perfil ignora número inválido e volta ao padrão se o arquivo quebrar', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-perfil-'))
    dirs.push(root)
    const file = path.join(root, 'perfil.json')
    const store = new ProfileStore(file, 'ada@exemplo.test')
    expect((await store.load()).intervaloMs).toBe(3000)
    const saved = await store.save({
      participantes: [
        { id: 'a', nome: 'Pessoa Alfa', telefone: '11900000001' },
        { id: 'b', nome: 'Pessoa Alfa', telefone: '11900000001' },
        { id: 'c', nome: '   ', telefone: '21900000002' },
      ],
      mensagem: 'Aviso {{sorteado}}',
      intervaloMs: 999,
    })
    expect(saved.participantes).toHaveLength(1)
    expect(saved.intervaloMs).toBe(3000)
    await writeFile(file, '{', 'utf8')
    expect((await store.load()).participantes).toEqual([])
  })

  it('o diário de testes guarda só os oito últimos', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-testes-'))
    dirs.push(root)
    const log = new TestLog(path.join(root, 'testes.json'))
    expect(await log.load()).toEqual([])
    for (let index = 0; index < 9; index += 1) {
      await log.add({
        codigo: String(index).padStart(8, '0'),
        destino: '••••0000',
        em: '2026-01-01T00:00:00.000Z',
        envioOk: true,
        apagadoOk: index % 2 === 0,
      })
    }
    const all = await log.load()
    expect(all).toHaveLength(8)
    expect(all[0]?.codigo).toBe('00000008')
    await writeFile(path.join(root, 'testes.json'), '{"nao":"lista"}', 'utf8')
    expect(await log.load()).toEqual([])
  })

  it('sorteio recusa lista inválida e o arquivo corrompido vira ausência', async () => {
    expect(() => montarSorteio([{ id: 'a', nome: ' ', telefone: '+5511900000001' }])).toThrow(/nome/)
    expect(() =>
      montarSorteio([
        { id: 'a', nome: 'Pessoa Alfa', telefone: '11900000001' },
        { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002' },
      ]),
    ).toThrow(/internacional/)
    const root = await mkdtemp(path.join(tmpdir(), 'papel-draw-'))
    dirs.push(root)
    const file = path.join(root, 'sorteio.json')
    const store = new DrawStore(file)
    expect(await store.load()).toBe(null)
    const draw = montarSorteio([
      { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001' },
      { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002' },
    ])
    await store.save(draw)
    expect((await store.load())?.id).toBe(draw.id)
    await writeFile(file, '[]', 'utf8')
    expect(await store.load()).toBe(null)
  })
})

describe('limites de configuração', () => {
  it('corta inteiros e a pausa de envio', () => {
    expect(boundedInteger('PAPEL_AUSENTE', 7, 1, 10)).toBe(7)
    process.env.PAPEL_LIMITE = '99'
    expect(boundedInteger('PAPEL_LIMITE', 1, 1, 10)).toBe(10)
    process.env.PAPEL_LIMITE = '3.4'
    expect(boundedInteger('PAPEL_LIMITE', 1, 1, 10)).toBe(3)
    delete process.env.PAPEL_LIMITE
    expect(clampSendDelay('nope')).toBeGreaterThanOrEqual(2000)
    expect(clampSendDelay(1)).toBe(2000)
    expect(clampSendDelay(99999)).toBe(15000)
    expect(clampSendDelay(4500)).toBe(4500)
  })
})

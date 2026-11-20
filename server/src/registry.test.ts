import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserRegistry, userSlug } from './registry'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('usuários separados', () => {
  it('o slug não leva o e-mail nem barras, e dois e-mails não compartilham pasta', () => {
    const ana = userSlug('ana@exemplo.com')
    const bia = userSlug('bia@exemplo.com')
    expect(ana).not.toBe(bia)
    expect(ana).toMatch(/^[a-f0-9]{32}$/)
    expect(userSlug('  Ana@Exemplo.com ')).not.toBe(ana)
  })

  it('sorteio e perfil de um e-mail não aparecem no outro', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-users-'))
    dirs.push(root)
    const registry = new UserRegistry(root)
    const ana = await registry.open('Ana@Exemplo.com')
    const bia = await registry.open('bia@exemplo.com')
    expect(ana.dir).not.toBe(bia.dir)
    expect(ana.email).toBe('ana@exemplo.com')
    await ana.profile.save({
      participantes: [{ id: '1', nome: 'Ana', telefone: '11988880001' }],
      mensagem: 'Oi {{sorteado}}',
      intervaloMs: 3000,
    })
    const again = await registry.open('ana@exemplo.com')
    expect(again).toBe(ana)
    expect((await bia.profile.load()).participantes).toEqual([])
    expect((await ana.profile.load()).participantes[0]?.nome).toBe('Ana')
    await expect(readFile(path.join(bia.dir, 'perfil.json'), 'utf8')).rejects.toThrow()
  })

  it('o encerramento solta todas as sessões abertas', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-users-'))
    dirs.push(root)
    const registry = new UserRegistry(root)
    const ana = await registry.open('ana@exemplo.com')
    await registry.open('bia@exemplo.com')
    await registry.shutdown()
    const deNovo = await registry.open('ana@exemplo.com')
    expect(deNovo).not.toBe(ana)
    expect(deNovo.dir).toBe(ana.dir)
  })
})

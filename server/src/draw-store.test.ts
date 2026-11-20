import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DrawStore, montarSorteio, toPublicDraw, toReveal } from './draw-store'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const people = [
  { id: 'a', nome: 'Ana', telefone: '+5511988880001' },
  { id: 'b', nome: 'Bia', telefone: '+5511988880002' },
  { id: 'c', nome: 'Caio', telefone: '+5511988880003' },
]

describe('sorteio guardado', () => {
  it('não coloca o mapeamento na visão pública', () => {
    const draw = montarSorteio(people, () => 0.1)
    const pub = toPublicDraw(draw)
    expect(JSON.stringify(pub)).not.toContain('sorteado')
    expect(pub.participantes.map((person) => person.nome).sort()).toEqual(['Ana', 'Bia', 'Caio'])
    for (const person of pub.participantes) {
      expect(person.status).toBe('pendente')
    }
    const reveal = toReveal(draw)
    expect(new Set(reveal.map((pair) => pair.sorteado))).toEqual(new Set(['Ana', 'Bia', 'Caio']))
    expect(reveal.every((pair) => pair.nome !== pair.sorteado)).toBe(true)
  })

  it('sobrevive a reinício e o sorteio novo substitui o arquivo', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'secret-friend-on-whatsapp-'))
    dirs.push(dir)
    const store = new DrawStore(path.join(dir, 'sorteio.json'))
    const first = montarSorteio(people, () => 0.2)
    await store.save(first)
    const reopened = new DrawStore(path.join(dir, 'sorteio.json'))
    expect((await reopened.load())?.id).toBe(first.id)

    const second = montarSorteio(people, () => 0.3)
    await store.save(second)
    const onDisk = JSON.parse(await readFile(path.join(dir, 'sorteio.json'), 'utf8')) as { id: string }
    expect(onDisk.id).toBe(second.id)
    expect(onDisk.id).not.toBe(first.id)
  })
})

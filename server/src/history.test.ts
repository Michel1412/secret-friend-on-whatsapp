import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveMember, HistoryStore, nextAttempt } from './history.ts'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('histórico de envio', () => {
  it('só acrescenta eventos e deriva o status sem guardar texto', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-hist-'))
    dirs.push(root)
    const store = new HistoryStore(path.join(root, 'historico.json'))
    expect(await store.load()).toEqual([])
    const base = {
      participantId: 'a',
      destino: '••••0001',
      tentativa: 1,
      sentAt: '2026-01-02T15:04:00.000Z',
      deletedAt: null,
      confirmedAt: null,
      erro: null,
      messageId: 'MID',
      sorteioId: 's1',
    }
    await store.append({ ...base, tipo: 'consulta', messageId: null, tentativa: nextAttempt([], 'a', 's1') })
    await store.append({ ...base, tipo: 'apagado', deletedAt: base.sentAt, confirmedAt: base.sentAt, tentativa: 2 })
    await store.append({ ...base, participantId: 'b', tipo: 'erro', erro: 'falhou', sorteioId: 's2', tentativa: 1 })
    const draw = await store.forDraw('s1')
    expect(draw.map((event) => event.tipo)).toEqual(['consulta', 'apagado'])
    expect(deriveMember(draw)?.status).toBe('apagado')
    expect(JSON.stringify(await store.load())).not.toMatch(/sorteado|mensagem/)
    await expect(
      store.append({ ...base, tipo: 'enviado', sorteado: 'segredo' } as never),
    ).rejects.toThrow(/histórico/)
  })
})

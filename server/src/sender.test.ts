import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WhatsAppSnapshot } from '../../shared/types.ts'
import { DrawStore, type StoredDraw } from './draw-store.ts'
import { Sender } from './sender.ts'
import type { WhatsAppSession } from './whatsapp.ts'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function draw(overrides?: Partial<StoredDraw['participantes'][number]>[]): StoredDraw {
  const people = [
    { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001', sorteadoId: 'b', sorteadoNome: 'Pessoa Beta', sorteadoTelefone: '+5521900000002' },
    { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002', sorteadoId: 'a', sorteadoNome: 'Pessoa Alfa', sorteadoTelefone: '+5511900000001' },
    { id: 'c', nome: 'Pessoa Gama', telefone: '+5511900000003', sorteadoId: 'a', sorteadoNome: 'Pessoa Alfa', sorteadoTelefone: '+5511900000001' },
  ]
  return {
    versao: 1,
    id: 'sorteio-teste',
    criadoEm: '2026-01-01T00:00:00.000Z',
    impressao: 'impressao',
    participantes: people.map((person, index) => ({
      ...person,
      status: 'pendente' as const,
      detalhe: null,
      mensagem: null,
      ...overrides?.[index],
    })),
  }
}

function wa(status: WhatsAppSnapshot['status'] = 'connected') {
  const snapshot = {
    status,
    qrDataUrl: null,
    phone: '+5511900000001',
    pushName: null,
    error: null,
    appStateReady: true,
    appStateReadyEm: '2026-01-01T00:00:00.000Z',
  }
  return {
    snapshot,
    deliver: vi.fn(async (): Promise<{
      sent: boolean
      deletedForMe: boolean
      ownNumber?: boolean
      error?: string
      key?: { remoteJid: string; id: string; timestamp: number }
    }> => ({
      sent: true,
      deletedForMe: true,
      key: { remoteJid: 'jid', id: 'm1', timestamp: 1 },
    })),
    deleteOwnMessage: vi.fn(async (): Promise<{ confirmed: boolean; via: 'mensagem' | null }> => ({
      confirmed: true,
      via: 'mensagem',
    })),
  }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('fila de envio', () => {
  it('percorre apagado, próprio número, erro, não confirmado e reenvio', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-sender-'))
    dirs.push(root)
    const store = new DrawStore(path.join(root, 'sorteio.json'))
    const session = wa()
    const sender = new Sender(store, session as unknown as WhatsAppSession)
    const board = draw([
      {},
      { status: 'enviado', mensagem: { remoteJid: 'jid', id: 'old', timestamp: 1 } },
      {},
    ])

    session.deliver
      .mockResolvedValueOnce({ sent: true, deletedForMe: true, key: { remoteJid: 'jid', id: 'm1', timestamp: 1 } })
      .mockResolvedValueOnce({ sent: false, deletedForMe: false, error: 'Falha ao enviar a mensagem.' })
    sender.start(board, 'Aviso {{sorteado}}', 0)
    expect(() => sender.start(board, 'Aviso {{sorteado}}', 0)).toThrow(/andamento/)
    await settle()
    expect(board.participantes[0]?.status).toBe('apagado')
    expect(board.participantes[1]?.status).toBe('apagado')
    expect(board.participantes[2]?.status).toBe('erro')
    expect(session.deliver).toHaveBeenCalledTimes(2)
    expect((session.deliver.mock.calls as unknown[][])[0]?.[0]).toBe('+5511900000001')

    const again = draw([
      { status: 'enviado', mensagem: { remoteJid: 'jid', id: 'old', timestamp: 1 } },
      { status: 'apagado' },
      { status: 'enviado', mensagem: { remoteJid: 'jid', id: 'old2', timestamp: 1 } },
    ])
    session.deleteOwnMessage.mockResolvedValueOnce({ confirmed: false, via: null })
    sender.start(again, 'Aviso {{sorteado}}', 0)
    await settle()
    expect(again.participantes[0]?.status).toBe('enviado')
    expect(again.participantes[0]?.detalhe).toMatch(/não confirmado/)
    expect(again.participantes[2]?.status).toBe('apagado')
  })

  it('marca o próprio número, para se cair a conexão e ignora quem já foi apagado no meio', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-sender-'))
    dirs.push(root)
    const store = new DrawStore(path.join(root, 'sorteio.json'))
    const session = wa()
    const sender = new Sender(store, session as unknown as WhatsAppSession)
    const board = draw([
      {},
      {},
      {},
    ])
    board.participantes.push({
      id: 'd',
      nome: 'Pessoa Delta',
      telefone: '+5511900000004',
      sorteadoId: 'a',
      sorteadoNome: 'Pessoa Alfa',
      sorteadoTelefone: '+5511900000001',
      status: 'pendente',
      detalhe: null,
      mensagem: null,
    })
    let calls = 0
    session.deliver.mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        board.participantes[1]!.manter = true
        return { sent: true, deletedForMe: false, ownNumber: true, key: { remoteJid: 'jid', id: 'own', timestamp: 1 } }
      }
      session.snapshot.status = 'disconnected'
      return { sent: false, deletedForMe: false, error: 'parou' }
    })
    sender.start(board, 'Aviso {{sorteado}}', 0)
    await settle()
    expect(board.participantes[0]?.manter).toBe(true)
    expect(board.participantes[0]?.detalhe).toMatch(/próprio número/)
    expect(board.participantes[1]?.status).toBe('pendente')
    expect(sender.view().erro).toMatch(/desconectou/)
    expect(sender.isRunning()).toBe(false)

    const empty = draw([{ status: 'apagado' }, { status: 'apagado', manter: true }, { status: 'apagado' }])
    expect(() => sender.start(empty, 'Aviso {{sorteado}}', 0)).toThrow(/pendentes/)
  })

  it('registra falha inesperada da sessão', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-sender-'))
    dirs.push(root)
    const store = new DrawStore(path.join(root, 'sorteio.json'))
    const session = wa()
    session.deliver.mockRejectedValue(new Error('rede caiu'))
    const sender = new Sender(store, session as unknown as WhatsAppSession)
    sender.start(draw(), 'Aviso {{sorteado}}', 0)
    await settle()
    expect(sender.view().erro).toBe('rede caiu')
    expect(sender.view().ativo).toBe(false)
  })
})

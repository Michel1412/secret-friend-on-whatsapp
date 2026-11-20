import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import type { WhatsAppSnapshot } from '../../shared/types.ts'
import { createApp } from './index.ts'
import { UserRegistry } from './registry.ts'
import { WhatsAppSession } from './whatsapp.ts'

const dirs: string[] = []

function blank(): WhatsAppSnapshot {
  return {
    status: 'disconnected',
    qrDataUrl: null,
    phone: null,
    pushName: null,
    error: null,
    appStateReady: false,
    appStateReadyEm: null,
  }
}

class StubSession extends WhatsAppSession {
  constructor() {
    super(path.join(tmpdir(), 'papel-stub'), 'stub', async () => undefined)
  }

  connect = vi.fn(async () => {
    this.snapshot = { ...blank(), status: 'qr', qrDataUrl: 'data:image/gif;base64,AAAA' }
  })

  logout = vi.fn(async () => {
    this.snapshot = blank()
  })

  destroy = vi.fn(async () => undefined)

  testarApagar = vi.fn(async () => ({
    codigo: '00000000',
    destino: '••••0001',
    envioOk: true,
    apagadoOk: true,
    passos: [{ passo: 'envio', ok: true, detalhe: 'ok' }],
  }))

  deliver = vi.fn(async () => ({
    sent: true,
    deletedForMe: true,
    key: { remoteJid: '5511900000002@c.us', id: 'MID', timestamp: 1 },
  }))
}

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'papel-api-'))
  dirs.push(root)
  const box: { session?: StubSession } = {}
  const registry = new UserRegistry(root, () => {
    box.session = new StubSession()
    return box.session
  })
  const app = createApp(registry)
  return { app, registry, box }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('rotas HTTP', () => {
  it('recusa rotas privadas sem cookie e aceita o login', async () => {
    const { app } = await harness()
    for (const path of ['/api/perfil', '/api/whatsapp', '/api/sorteio', '/api/historico']) {
      const denied = await request(app).get(path)
      expect(denied.status).toBe(401)
    }
    expect((await request(app).post('/api/enviar').send({})).status).toBe(401)
    expect((await request(app).post('/api/sigilo').send({})).status).toBe(401)
    expect((await request(app).post('/api/whatsapp/testar-apagar').send({})).status).toBe(401)

    expect((await request(app).get('/api/health')).body).toEqual({ ok: true })
    expect((await request(app).get('/api/sessao')).body).toEqual({ email: null })
    expect((await request(app).post('/api/sessao').send({ email: 'não-é-email' })).status).toBe(400)
    expect((await request(app).get('/api/nao-existe')).status).toBe(404)

    const login = await request(app).post('/api/sessao').send({ email: '  Ada@Exemplo.test ' })
    expect(login.status).toBe(200)
    expect(login.body.email).toBe('ada@exemplo.test')
    const cookie = login.headers['set-cookie']
    expect(String(cookie)).toContain('secret-friend-on-whatsapp-email')

    const session = await request(app).get('/api/sessao').set('Cookie', cookie)
    expect(session.body.email).toBe('ada@exemplo.test')
    const goodbye = await request(app).delete('/api/sessao').set('Cookie', cookie)
    expect(goodbye.body).toEqual({ ok: true })
    const cleared = goodbye.headers['set-cookie']
    expect((await request(app).get('/api/sessao').set('Cookie', cleared)).body.email).toBe(null)
  })

  it('grava perfil, exige Verificado para testar e enviar, e sorteia', async () => {
    const { app, box } = await harness()
    const session = () => box.session!
    const login = await request(app).post('/api/sessao').send({ email: 'ada@exemplo.test' })
    const cookie = login.headers['set-cookie']
    const api = request(app)

    const saved = await api.put('/api/perfil').set('Cookie', cookie).send({
      participantes: [
        { id: 'a', nome: 'Pessoa Alfa', telefone: '11900000001' },
        { id: 'ruim', nome: '', telefone: '123' },
      ],
      mensagem: 'Aviso {{sorteado}}',
      intervaloMs: 4000,
    })
    expect(saved.status).toBe(200)
    expect(saved.body.participantes).toEqual([{ id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001' }])
    expect((await api.get('/api/perfil').set('Cookie', cookie)).body.email).toBe('ada@exemplo.test')

    expect((await api.post('/api/sorteio').set('Cookie', cookie).send({ participantes: [] })).status).toBe(409)
    session().snapshot = { ...session().snapshot, status: 'connected', phone: '+5511900000001' }
    const drawn = await api.post('/api/sorteio').set('Cookie', cookie).send({
      participantes: [
        { id: 'a', nome: 'Pessoa Alfa', telefone: '11900000001' },
        { id: 'b', nome: 'Pessoa Beta', telefone: '21900000002' },
      ],
    })
    expect(drawn.status).toBe(200)
    expect(drawn.body.sorteio.participantes).toHaveLength(2)
    expect(JSON.stringify(drawn.body.sorteio)).not.toContain('sorteadoNome')
    const revealed = await api.post('/api/sigilo').set('Cookie', cookie).send({ frase: 'quero quebrar o sigilo' })
    expect(revealed.status).toBe(200)
    expect(revealed.body.pares).toHaveLength(2)
    expect(revealed.body.pares.every((pair: { telefone: string; telefoneSorteado: string }) => pair.telefone !== pair.telefoneSorteado)).toBe(true)

    expect((await api.post('/api/whatsapp/testar-apagar').set('Cookie', cookie).send({})).status).toBe(409)
    session().snapshot = { ...session().snapshot, status: 'connected', appStateReady: false }
    expect((await api.post('/api/enviar').set('Cookie', cookie).send({ mensagem: 'Aviso {{sorteado}}', intervaloMs: 2000 })).status).toBe(409)

    session().snapshot = { ...session().snapshot, appStateReady: true, appStateReadyEm: '2026-01-01T00:00:00.000Z' }
    expect((await api.post('/api/whatsapp/testar-apagar').set('Cookie', cookie).send({ telefone: 'abc' })).status).toBe(400)
    const tested = await api.post('/api/whatsapp/testar-apagar').set('Cookie', cookie).send({ telefone: '11900000001' })
    expect(tested.status).toBe(200)
    expect(tested.body.destino).toBe('••••0001')
    expect(tested.body.historico).toHaveLength(1)
    const wa = await api.get('/api/whatsapp').set('Cookie', cookie)
    expect(wa.body.status).toBe('connected')
    expect(wa.body.testes).toHaveLength(1)

    const sent = await api.post('/api/enviar').set('Cookie', cookie).send({ mensagem: 'sem variavel', intervaloMs: 2000 })
    expect(sent.status).toBe(400)
    const started = await api.post('/api/enviar').set('Cookie', cookie).send({ mensagem: 'Aviso {{amigo}}', intervaloMs: 2000 })
    expect(started.status).toBe(202)
    expect(started.body.envio.ativo).toBe(true)
    expect((await api.post('/api/whatsapp/logout').set('Cookie', cookie)).status).toBe(409)
    await new Promise((resolve) => setTimeout(resolve, 2600))
    const board = await api.get('/api/sorteio').set('Cookie', cookie)
    expect(board.body.envio.ativo).toBe(false)
    expect(board.body.sorteio.participantes.every((person: { status: string }) => person.status === 'apagado')).toBe(true)
    const log = await api.get('/api/historico').query({ sorteio: board.body.sorteio.id }).set('Cookie', cookie)
    expect(log.status).toBe(200)
    expect(log.body.eventos.some((event: { tipo: string }) => event.tipo === 'apagado')).toBe(true)
    expect(JSON.stringify(log.body)).not.toMatch(/sorteadoNome|Aviso/)
    const testLog = await api.post('/api/whatsapp/testar-apagar').set('Cookie', cookie).send({})
    expect(testLog.status).toBe(200)
    const withTest = await api.get('/api/historico').query({ sorteio: board.body.sorteio.id }).set('Cookie', cookie)
    expect(withTest.body.eventos.some((event: { tipo: string }) => event.tipo === 'teste')).toBe(true)
  })

  it('trava a quebra de sigilo e devolve os pares só com a frase', async () => {
    const { app, box } = await harness()
    const session = () => box.session!
    const login = await request(app).post('/api/sessao').send({ email: 'ada@exemplo.test' })
    const cookie = login.headers['set-cookie']
    expect((await request(app).post('/api/sigilo').set('Cookie', cookie).send({ frase: 'quero quebrar o sigilo' })).status).toBe(404)

    session().snapshot = { ...session().snapshot, status: 'connected' }
    await request(app).post('/api/sorteio').set('Cookie', cookie).send({
      participantes: [
        { id: 'a', nome: 'Pessoa Alfa', telefone: '11900000001' },
        { id: 'b', nome: 'Pessoa Beta', telefone: '21900000002' },
      ],
    })
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const wrong = await request(app).post('/api/sigilo').set('Cookie', cookie).send({ frase: 'nao' })
      expect(wrong.status).toBe(403)
    }
    const locked = await request(app).post('/api/sigilo').set('Cookie', cookie).send({ frase: 'nao' })
    expect(locked.status).toBe(429)
    const opened = await request(app).post('/api/sigilo').set('Cookie', cookie).send({ frase: 'Quero   quebrar o SIGILO' })
    expect(opened.status).toBe(429)
  })

  it('responde 500 quando o perfil quebra e 400 para lista inválida', async () => {
    const { app, registry, box } = await harness()
    const session = () => box.session!
    const login = await request(app).post('/api/sessao').send({ email: 'ada@exemplo.test' })
    const cookie = login.headers['set-cookie']
    const user = await registry.open('ada@exemplo.test')
    user.profile.load = async () => {
      throw new Error('falha de disco')
    }
    const broken = await request(app).get('/api/perfil').set('Cookie', cookie)
    expect(broken.status).toBe(500)
    expect(broken.body.error).toBe('Erro interno.')

    session().snapshot = { ...session().snapshot, status: 'connected' }
    const bad = await request(app).post('/api/sorteio').set('Cookie', cookie).send({
      participantes: [{ id: 'a', nome: 'Pessoa Alfa', telefone: '123' }],
    })
    expect(bad.status).toBe(400)

    const connect = await request(app).post('/api/whatsapp/connect').set('Cookie', cookie)
    expect(connect.body.status).toBe('qr')
    const loggedOut = await request(app).post('/api/whatsapp/logout').set('Cookie', cookie)
    expect(loggedOut.body.status).toBe('disconnected')
  })
})

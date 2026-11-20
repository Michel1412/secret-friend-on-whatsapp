import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  connectWhatsApp,
  createDraw,
  getPerfil,
  getHistorico,
  getSession,
  getSorteio,
  getWhatsApp,
  login,
  logoutAccount,
  logoutWhatsApp,
  quebrarSigilo,
  savePerfil,
  startSend,
  testarApagar,
} from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('cliente HTTP', () => {
  it('cobre cada chamada e traduz erro do servidor', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${String(input)}`)
        if (String(input).endsWith('/api/sessao') && init?.method === 'POST') return json({ email: 'ada@exemplo.test' })
        if (String(input).endsWith('/api/sessao') && init?.method === 'DELETE') return json({ ok: true })
        if (String(input).endsWith('/api/sessao')) return json({ email: null })
        if (String(input).endsWith('/api/perfil') && init?.method === 'PUT') return json({ email: 'ada@exemplo.test', participantes: [], mensagem: 'Aviso {{sorteado}}', intervaloMs: 3000 })
        if (String(input).endsWith('/api/perfil')) return json({ email: 'ada@exemplo.test', participantes: [], mensagem: 'Aviso {{sorteado}}', intervaloMs: 3000 })
        if (String(input).endsWith('/api/whatsapp/connect')) return json({ status: 'qr' })
        if (String(input).endsWith('/api/whatsapp/logout')) return json({ status: 'disconnected' })
        if (String(input).endsWith('/api/whatsapp/testar-apagar')) return json({ codigo: '00000000', passos: [], historico: [] })
        if (String(input).endsWith('/api/whatsapp')) return json({ status: 'disconnected', testes: [] })
        if (String(input).includes('/api/historico')) return json({ eventos: [] })
        if (String(input).endsWith('/api/sorteio') && init?.method === 'POST') return json({ sorteio: { id: 's' } })
        if (String(input).endsWith('/api/sorteio')) return json({ sorteio: null, envio: { ativo: false, feitos: 0, total: 0, erro: null } })
        if (String(input).endsWith('/api/sigilo')) return json({ sorteioId: 's', criadoEm: '2026-01-01T00:00:00.000Z', pares: [] })
        if (String(input).endsWith('/api/enviar')) return json({ envio: { ativo: true, feitos: 0, total: 1, erro: null }, sorteio: { id: 's' } })
        return json({ error: 'não' }, { status: 500 })
      }),
    )

    expect((await getSession()).email).toBe(null)
    expect((await login('ada@exemplo.test')).email).toBe('ada@exemplo.test')
    expect(await logoutAccount()).toEqual({ ok: true })
    expect((await getPerfil()).email).toBe('ada@exemplo.test')
    expect((await savePerfil({ participantes: [], mensagem: 'Aviso {{sorteado}}', intervaloMs: 3000 })).intervaloMs).toBe(3000)
    expect((await getWhatsApp()).status).toBe('disconnected')
    expect((await connectWhatsApp()).status).toBe('qr')
    expect((await logoutWhatsApp()).status).toBe('disconnected')
    expect((await testarApagar('')).codigo).toBe('00000000')
    expect((await getHistorico('s')).eventos).toEqual([])
    expect((await getSorteio()).sorteio).toBe(null)
    expect((await createDraw([])).id).toBe('s')
    expect((await quebrarSigilo('quero quebrar o sigilo')).pares).toEqual([])
    expect((await startSend('Aviso {{sorteado}}', 3000)).envio.ativo).toBe(true)
    expect(calls).toContain('POST /api/enviar')

    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)))
    await expect(getSession()).rejects.toMatchObject({ status: 403, message: 'O servidor recusou o pedido.' })
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Entre com um e-mail.' }, 401)))
    await expect(getPerfil()).rejects.toBeInstanceOf(ApiError)
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    await expect(getSession()).rejects.toMatchObject({ status: 0 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('não json', { status: 500 })))
    await expect(login('ada@exemplo.test')).rejects.toMatchObject({ status: 500 })
  })
})

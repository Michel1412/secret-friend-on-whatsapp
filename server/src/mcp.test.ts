import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertLocalBearer, isLoopback, RunningAppClient } from './mcp-api.ts'
import { startMcpHttp } from './mcp.ts'
import { createPapelServer } from './mcp-tools.ts'
import type { PapelApi } from './mcp-api.ts'

const TOOLS = [
  'get_status',
  'get_qr_code',
  'test_send_and_delete',
  'import_list',
  'export_list',
  'draw',
  'start_send',
  'resend',
  'get_members_status',
  'get_history',
  'break_secrecy',
]

function fakeApi(): PapelApi & { sigiloCalls: string[] } {
  const sigiloCalls: string[] = []
  return {
    sigiloCalls,
    async whatsapp() {
      return {
        status: 'connected',
        qrDataUrl: 'data:image/png;base64,AAAA',
        phone: '+5511900000001',
        pushName: null,
        error: null,
        appStateReady: true,
        appStateReadyEm: '2026-01-02T15:00:00.000Z',
      }
    },
    async connect() {
      return this.whatsapp()
    },
    async perfil() {
      return {
        participantes: [
          { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001' },
          { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002' },
        ],
        mensagem: 'Aviso {{sorteado}}',
        intervaloMs: 3000,
      }
    },
    async savePerfil() {
      return { ok: true }
    },
    async sorteio() {
      return {
        sorteio: {
          id: 's1',
          criadoEm: '2026-01-02T15:00:00.000Z',
          impressao: 'x',
          participantes: [
            { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001', status: 'apagado', detalhe: null, manter: false },
            { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002', status: 'pendente', detalhe: null, manter: false },
          ],
        },
        envio: { ativo: false, feitos: 0, total: 0, erro: null },
      }
    },
    async criarSorteio() {
      return {
        sorteio: {
          id: 's1',
          criadoEm: '2026-01-02T15:00:00.000Z',
          impressao: 'x',
          participantes: [
            { id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001', status: 'pendente', detalhe: null, manter: false },
            { id: 'b', nome: 'Pessoa Beta', telefone: '+5521900000002', status: 'pendente', detalhe: null, manter: false },
          ],
        },
      }
    },
    async enviar() {
      return { envio: { ativo: true, feitos: 0, total: 1, erro: null }, sorteio: (await this.sorteio()).sorteio! }
    },
    async testar() {
      return { codigo: '00000042', destino: '••••0001', envioOk: true, apagadoOk: true }
    },
    async historico() {
      return {
        eventos: [
          {
            participantId: 'a',
            destino: '••••0001',
            tipo: 'apagado',
            tentativa: 1,
            sentAt: '2026-01-02T15:04:00.000Z',
            deletedAt: '2026-01-02T15:04:02.000Z',
            confirmedAt: '2026-01-02T15:04:02.000Z',
            erro: null,
            messageId: 'MID',
            sorteioId: 's1',
          },
        ],
      }
    },
    async sigilo(frase: string) {
      sigiloCalls.push(frase)
      if (frase !== 'quero quebrar o sigilo') throw new Error('A frase não confere. O sigilo continua fechado.')
      return { pares: [{ nome: 'Pessoa Alfa', telefone: '+5511900000001', sorteado: 'Pessoa Beta', telefoneSorteado: '+5521900000002' }] }
    },
  }
}

async function session(api: PapelApi) {
  const server = createPapelServer(api)
  const client = new Client({ name: 'teste', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

describe('MCP local', () => {
  it('lista os tools e responde com a API falsa', async () => {
    const api = fakeApi()
    const { client, server } = await session(api)
    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...TOOLS].sort())
    const secrecy = listed.tools.find((tool) => tool.name === 'break_secrecy')
    expect(secrecy?.annotations?.destructiveHint).toBe(true)
    expect(secrecy?.description).toMatch(/quero quebrar o sigilo/)

    const status = await client.callTool({ name: 'get_status', arguments: {} })
    expect(JSON.stringify(status)).toMatch(/Verificado: sim/)
    const qr = await client.callTool({ name: 'get_qr_code', arguments: {} })
    expect(JSON.stringify(qr)).toMatch(/AAAA/)
    const tested = await client.callTool({ name: 'test_send_and_delete', arguments: {} })
    expect(JSON.stringify(tested)).toMatch(/00000042/)
    const imported = await client.callTool({
      name: 'import_list',
      arguments: { linhas: [['Nome', 'Telefone'], ['Pessoa Gama', '11900000003']], nomeCol: 0, telefoneCol: 1, cabecalho: true, modo: 'substituir' },
    })
    expect(JSON.stringify(imported)).toMatch(/Importadas 1/)
    const exported = await client.callTool({ name: 'export_list', arguments: { formato: 'csv' } })
    expect(JSON.stringify(exported)).toMatch(/Pessoa Alfa/)
    expect(JSON.stringify(exported)).not.toMatch(/sorteado/)
    const drawn = await client.callTool({ name: 'draw', arguments: {} })
    expect(JSON.stringify(drawn)).toMatch(/Sorteio s1/)
    const started = await client.callTool({ name: 'start_send', arguments: { mensagem: 'Aviso {{sorteado}}', intervaloMs: 3000 } })
    expect(JSON.stringify(started)).toMatch(/Envio iniciado/)
    const resent = await client.callTool({ name: 'resend', arguments: { ids: ['b'] } })
    expect(JSON.stringify(resent)).toMatch(/Reenvio/)
    const members = await client.callTool({ name: 'get_members_status', arguments: {} })
    expect(JSON.stringify(members)).toMatch(/confirmedAt/)
    expect(JSON.stringify(members)).not.toMatch(/sorteadoNome/)
    const history = await client.callTool({ name: 'get_history', arguments: { sorteioId: 's1' } })
    expect(JSON.stringify(history)).toMatch(/apagado/)
    const blocked = await client.callTool({ name: 'break_secrecy', arguments: { frase: 'nao' } })
    expect(JSON.stringify(blocked)).toMatch(/não confere/)
    const opened = await client.callTool({ name: 'break_secrecy', arguments: { frase: 'quero quebrar o sigilo' } })
    expect(JSON.stringify(opened)).toMatch(/Pessoa Beta/)
    expect(api.sigiloCalls).toEqual(['nao', 'quero quebrar o sigilo'])
    await client.close()
    await server.close()
  })

  it('no HTTP, initialize, tools/list e uma chamada usam um servidor por POST', async () => {
    const api = fakeApi()
    const listener = startMcpHttp(api, 0, 'segredo')
    await new Promise<void>((resolve) => listener.once('listening', () => resolve()))
    const address = listener.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const url = `http://127.0.0.1:${port}/mcp`

    const denied = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: '{}',
    })
    expect(denied.status).toBe(401)
    const get = await fetch(url, { headers: { Authorization: 'Bearer segredo' } })
    expect(get.status).toBe(405)

    const open = () => {
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: 'Bearer segredo' } },
      })
      const client = new Client({ name: 'teste-http', version: '0' })
      return { transport, client }
    }

    const first = open()
    await first.client.connect(first.transport)
    const listed = await first.client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toContain('get_status')
    const status = await first.client.callTool({ name: 'get_status', arguments: {} })
    expect(JSON.stringify(status)).toMatch(/Verificado: sim/)
    expect(first.transport.sessionId).toBeUndefined()

    const second = open()
    await second.client.connect(second.transport)
    const again = await second.client.callTool({ name: 'get_status', arguments: {} })
    expect(JSON.stringify(again)).toMatch(/Verificado: sim/)

    await first.client.close()
    await second.client.close()
    await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())))
  })

  it('recusa HTTP fora do loopback ou sem bearer', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('8.8.8.8')).toBe(false)
    expect(() => assertLocalBearer('8.8.8.8', 'Bearer segredo', 'segredo')).toThrow(/127\.0\.0\.1/)
    expect(() => assertLocalBearer('127.0.0.1', 'Bearer outro', 'segredo')).toThrow(/Token/)
    expect(() => assertLocalBearer('127.0.0.1', 'Bearer segredo', 'segredo')).not.toThrow()
  })

  it('não envia se o selo Verificado estiver fechado', async () => {
    const api = fakeApi()
    api.whatsapp = async () => ({
      status: 'connected',
      qrDataUrl: null,
      phone: '+5511900000001',
      pushName: null,
      error: null,
      appStateReady: false,
      appStateReadyEm: null,
    })
    const { client, server } = await session(api)
    const result = await client.callTool({ name: 'start_send', arguments: { mensagem: 'Aviso {{sorteado}}' } })
    expect(JSON.stringify(result)).toMatch(/Verificado/)
    await client.close()
    await server.close()
  })

  it('fala com a API em execução e importa um CSV do disco', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-mcp-'))
    const file = path.join(root, 'lista.csv')
    await writeFile(file, 'Nome;Telefone\nPessoa Delta;11900000004\n', 'utf8')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessao')) {
          return new Response(JSON.stringify({ email: 'ada@exemplo.test' }), {
            status: 200,
            headers: { 'set-cookie': 'secret-friend-on-whatsapp-email=ada%40exemplo.test; Path=/' },
          })
        }
        if (!init?.headers || !JSON.stringify(init.headers).includes('secret-friend')) {
          return new Response(JSON.stringify({ error: 'sem cookie' }), { status: 401 })
        }
        if (url.endsWith('/api/whatsapp') && init.method !== 'POST') {
          return Response.json({ status: 'disconnected', qrDataUrl: null, phone: null, pushName: null, error: null, appStateReady: false, appStateReadyEm: null })
        }
        return Response.json({ ok: true })
      }),
    )
    const client = new RunningAppClient('http://127.0.0.1:38471', 'ada@exemplo.test')
    expect((await client.whatsapp()).status).toBe('disconnected')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Informe um e-mail.' }), { status: 400 })),
    )
    await expect(new RunningAppClient('http://127.0.0.1:38471', 'ruim').whatsapp()).rejects.toThrow(/e-mail/)
    vi.unstubAllGlobals()

    const api = fakeApi()
    const { client: mcp, server } = await session(api)
    const imported = await mcp.callTool({ name: 'import_list', arguments: { caminho: file, nomeCol: 0, telefoneCol: 1, cabecalho: true } })
    expect(JSON.stringify(imported)).toMatch(/Importadas 1/)
    const sheet = await mcp.callTool({ name: 'export_list', arguments: { formato: 'xlsx' } })
    expect(JSON.stringify(sheet)).toMatch(/base64/)
    await mcp.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  })
})

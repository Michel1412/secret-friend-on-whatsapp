import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { config as loadEnv } from 'dotenv'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocalBearer, type PapelApi, RunningAppClient } from './mcp-api.ts'
import { createPapelServer } from './mcp-tools.ts'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function loadMcpEnv(envFile = path.join(projectRoot, '.env')): void {
  loadEnv({ path: envFile })
}

/**
 * HTTP local, sem sessão.
 *
 * O SDK recusa reutilizar um transporte com `sessionIdGenerator: undefined`:
 * o segundo POST (tools/list depois do initialize) vira 500,
 * "Stateless transport cannot be reused across requests".
 * Um único `sessionIdGenerator` no mesmo `McpServer` também não serve:
 * o servidor só aceita uma conexão, então o initialize do próximo cliente falha.
 * Cada POST ganha um servidor e um transporte novos. Não há estado de protocolo
 * para guardar: as tools só falam com a API que já está no ar.
 */
export function startMcpHttp(api: PapelApi, port: number, token: string) {
  const listener = http.createServer(async (req, res) => {
    try {
      assertLocalBearer(req.socket.remoteAddress, req.headers.authorization, token)
    } catch (error) {
      const status = (error as { status?: number }).status ?? 403
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(error instanceof Error ? error.message : 'negado')
      return
    }
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404).end('Não encontrado.')
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed')
      return
    }
    await serveStateless(api, req, res)
  })
  listener.listen(port, '127.0.0.1')
  return listener
}

async function serveStateless(api: PapelApi, req: http.IncomingMessage, res: http.ServerResponse) {
  const server = createPapelServer(api)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  let closed = false
  const finish = () => {
    if (closed) return
    closed = true
    void transport.close()
    void server.close()
  }
  res.on('finish', finish)
  res.on('close', finish)
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }))
    }
    finish()
  }
}

async function main() {
  loadMcpEnv()
  const email = process.env.MCP_EMAIL?.trim()
  if (!email) {
    console.error('Defina MCP_EMAIL com o e-mail já usado na interface.')
    process.exit(1)
  }
  const api = new RunningAppClient(process.env.MCP_API_BASE?.trim() || 'http://127.0.0.1:38471', email)
  const httpPort = Number(process.env.MCP_HTTP_PORT)
  if (process.env.MCP_HTTP_PORT) {
    const token = process.env.MCP_TOKEN?.trim() ?? ''
    if (!token) {
      console.error('MCP HTTP exige MCP_TOKEN. O servidor só escuta em 127.0.0.1.')
      process.exit(1)
    }
    startMcpHttp(api, httpPort, token)
  }
  await createPapelServer(api).connect(new StdioServerTransport())
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return path.resolve(entry) === fileURLToPath(import.meta.url)
}

if (isDirectRun()) {
  void main()
}

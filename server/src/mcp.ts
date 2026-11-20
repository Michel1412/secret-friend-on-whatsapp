import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocalBearer, RunningAppClient } from './mcp-api.ts'
import { createPapelServer } from './mcp-tools.ts'

export function startMcpHttp(api: RunningAppClient, port: number, token: string) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const server = createPapelServer(api)
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
    await transport.handleRequest(req, res)
  })
  listener.listen(port, '127.0.0.1')
  void server.connect(transport)
  return listener
}

async function main() {
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

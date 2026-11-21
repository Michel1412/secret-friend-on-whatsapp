import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = path.join(root, 'data', 'fs-deny-probe.txt')
const envFile = path.join(root, '.env')

describe('o dev server entrega o cliente do Vite', () => {
  let server: ViteDevServer | undefined
  let base = ''
  let createdEnv = false

  beforeAll(async () => {
    await fs.mkdir(path.dirname(dataFile), { recursive: true })
    await fs.writeFile(dataFile, 'probe\n')
    try {
      await fs.access(envFile)
    } catch {
      await fs.writeFile(envFile, 'FS_DENY_PROBE=1\n')
      createdEnv = true
    }

    server = await createServer({
      configFile: path.join(root, 'vite.config.ts'),
      clearScreen: false,
      logLevel: 'silent',
      // Skip the dependency crawl so closing the server does not wait on esbuild.
      optimizeDeps: { noDiscovery: true, include: [] },
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
        hmr: false,
      },
    })
    await server.listen()
    base = serverBase(server)
  }, 120_000)

  afterAll(async () => {
    const httpServer = server?.httpServer
    if (httpServer && 'closeAllConnections' in httpServer) httpServer.closeAllConnections()
    await server?.close()
    await fs.rm(dataFile, { force: true })
    await fs.rmdir(path.dirname(dataFile)).catch(() => undefined)
    if (createdEnv) await fs.rm(envFile, { force: true })
  }, 30_000)

  it('responde /@vite/client e /src/main.tsx como JavaScript', async () => {
    const client = await fetch(`${base}/@vite/client`, { redirect: 'manual' })
    const clientType = client.headers.get('content-type') ?? ''
    const clientBody = await client.text()
    expect(client.status).toBe(200)
    expect(clientType).toMatch(/javascript/)
    expect(clientType).not.toMatch(/text\/html/)
    expect(clientBody).toContain('import')
    expect(clientBody).not.toContain('<div id="root">')

    const entry = await fetch(`${base}/src/main.tsx`, { redirect: 'manual' })
    const entryType = entry.headers.get('content-type') ?? ''
    const entryBody = await entry.text()
    expect(entry.status).toBe(200)
    expect(entryType).toMatch(/javascript/)
    expect(entryType).not.toMatch(/text\/html/)
    expect(entryBody).toContain('createRoot')
  }, 60_000)

  it('nega data/ e .env com 403', async () => {
    expect(await statusOf(`${base}/data/fs-deny-probe.txt`)).toBe(403)
    expect(await statusOf(`${base}/.env`)).toBe(403)
    expect(await statusOf(`${base}/.git/HEAD`)).toBe(403)
  })

  it('a lista de deny não inclui dist nem coverage', () => {
    const deny = server?.config.server.fs.deny ?? []
    expect(deny.some((pattern) => pattern.includes('**/dist') || pattern.includes('**/coverage'))).toBe(false)
    expect(deny.some((pattern) => pattern.endsWith('/data/**'))).toBe(true)
  })
})

function serverBase(server: ViteDevServer): string {
  const local = server.resolvedUrls?.local?.[0]
  if (local) return local.replace(/\/$/, '')
  const address = server.httpServer?.address()
  if (address && typeof address === 'object') return `http://127.0.0.1:${address.port}`
  throw new Error('o Vite não publicou uma porta')
}

async function statusOf(url: string): Promise<number> {
  const response = await fetch(url, { redirect: 'manual' })
  await response.body?.cancel()
  return response.status
}

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindShutdown } from './index.ts'
import { UserRegistry } from './registry.ts'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('encerramento do processo', () => {
  it('fecha as sessões uma vez e pede a saída', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit)
    const root = await mkdtemp(path.join(tmpdir(), 'papel-stop-'))
    dirs.push(root)
    const registry = new UserRegistry(root)
    await registry.open('ada@exemplo.test')
    const guards = bindShutdown(registry)
    await guards.fecharSessoes('teste')
    await guards.fecharSessoes('de novo')
    guards.pedirSaida('teste')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(exit).toHaveBeenCalledWith(0)
    process.removeListener('SIGINT', guards.onSigint)
    process.removeListener('SIGTERM', guards.onSigterm)
    process.removeListener('beforeExit', guards.onBeforeExit)
    exit.mockRestore()
  })

  it('registra falha ao fechar', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'papel-stop-'))
    dirs.push(root)
    const registry = new UserRegistry(root)
    registry.shutdown = async () => {
      throw new Error('nao fechou')
    }
    const guards = bindShutdown(registry)
    await guards.fecharSessoes('teste')
    process.removeListener('SIGINT', guards.onSigint)
    process.removeListener('SIGTERM', guards.onSigterm)
    process.removeListener('beforeExit', guards.onBeforeExit)
  })
})

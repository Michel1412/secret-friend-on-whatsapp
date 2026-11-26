import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PREFIX = 'The browser is already running for '
const LOCK_NAMES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'] as const
const BROWSER_EXE =
  /(?:^|[\\/])(?:google-chrome-stable|google-chrome|chromium-browser|chromium|chrome|msedge)(?:\.exe)?(?=\s|"|$)/i

export type ProcessRow = { pid: number; ppid?: number; command: string }

export function sessionUserDataDir(dataPath: string, clientId: string): string {
  const sessionDirName = clientId ? `session-${clientId}` : 'session'
  return path.join(path.resolve(dataPath), sessionDirName)
}

export function isBrowserAlreadyRunning(message: string): boolean {
  return message.includes(PREFIX)
}

export function userDataDirFromError(message: string): string | null {
  const start = message.indexOf(PREFIX)
  if (start < 0) return null
  const from = start + PREFIX.length
  const end = message.indexOf('. Use a different', from)
  if (end < 0) return null
  const dir = message.slice(from, end).trim()
  return dir || null
}

export function normalizarCaminho(value: string): string {
  return value
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase()
}

export function perfilAlvoValido(userDataDir: string): boolean {
  const dir = normalizarCaminho(userDataDir)
  if (dir.length < 12) return false
  if (dir === '/' || /^[a-z]:$/i.test(dir)) return false
  return dir.includes('/session-') || dir.endsWith('/session')
}

export function isBrowserCommand(command: string): boolean {
  return BROWSER_EXE.test(command)
}

export function commandLineMatchesProfile(command: string, userDataDir: string): boolean {
  if (!perfilAlvoValido(userDataDir)) return false
  const alvo = normalizarCaminho(userDataDir)
  return normalizarCaminho(command).includes(alvo)
}

export function parsePs(stdout: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.*\S)\s*$/)
    if (!match) continue
    const withParent = match[2].match(/^(\d+)\s+(.*\S)\s*$/)
    if (withParent) {
      rows.push({ pid: Number(match[1]), ppid: Number(withParent[1]), command: withParent[2] })
    } else {
      rows.push({ pid: Number(match[1]), command: match[2] })
    }
  }
  return rows
}

export function parseCimJson(stdout: string): ProcessRow[] {
  const text = stdout.trim()
  if (!text) return []
  const parsed = JSON.parse(text) as
    | { ProcessId?: number; ParentProcessId?: number; CommandLine?: string | null }
    | Array<{ ProcessId?: number; ParentProcessId?: number; CommandLine?: string | null }>
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows
    .filter((row) => row.ProcessId && row.CommandLine)
    .map((row) => {
      const item: ProcessRow = { pid: Number(row.ProcessId), command: String(row.CommandLine) }
      if (row.ParentProcessId != null) item.ppid = Number(row.ParentProcessId)
      return item
    })
}

export function ehFilhoDoProcesso(row: ProcessRow, rows: ProcessRow[], rootPid: number): boolean {
  if (row.pid === rootPid) return true
  const parents = new Map(rows.map((item) => [item.pid, item.ppid]))
  let parent = row.ppid
  const seen = new Set<number>([row.pid])
  while (parent && parent > 0 && !seen.has(parent)) {
    if (parent === rootPid) return true
    seen.add(parent)
    const next = parents.get(parent)
    if (next == null) return false
    parent = next
  }
  return false
}

export function sanitizarMensagem(message: string, caminhos: string[] = []): string {
  let text = message.replace(/\s+/g, ' ').trim()
  const extras = [...caminhos].filter((item) => item.length >= 3).sort((a, b) => b.length - a.length)
  for (const extra of extras) {
    text = text.split(extra).join('[caminho]')
    text = text.split(extra.replace(/\\/g, '/')).join('[caminho]')
  }
  text = text.replace(
    /The browser is already running for .+?\. Use a different/g,
    'The browser is already running for [caminho]. Use a different',
  )
  text = text.replace(/"[A-Za-z]:\\[^"]+"/g, '"[caminho]"')
  text = text.replace(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, '[caminho]')
  text = text.replace(/\/(?:home|Users|opt|tmp|var|agent|workspace|app)\/\S+/g, '[caminho]')
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  text = text.replace(/(?<!\d)\+?\d{10,15}(?!\d)/g, '[numero]')
  text = text.replace(/\b[a-f0-9]{16,}\b/gi, '[id]')
  if (text.length > 280) text = `${text.slice(0, 279)}…`
  return text
}

export function mensagemAbertura(error: unknown, caminho?: string | null): string {
  const raw = error instanceof Error ? error.message : 'erro desconhecido'
  const limpa = sanitizarMensagem(raw, caminho ? [caminho] : [])
  if (!limpa) return 'Não consegui abrir o navegador do WhatsApp.'
  if (/waiting failed:\s*\d+\s*ms exceeded/i.test(limpa) || /auth timeout/i.test(limpa)) {
    return 'O WhatsApp Web não terminou de carregar. Feche outras janelas do WhatsApp Web, espere alguns segundos e clique em Gerar QR de novo. Se continuar, atualize o Chrome e tente outra vez.'
  }
  if (/não consegui abrir o navegador/i.test(limpa)) return limpa
  return `Não consegui abrir o navegador do WhatsApp. ${limpa}`
}

async function listBrowserProcesses(platform: string): Promise<ProcessRow[]> {
  if (platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(chrome|msedge|chromium)\\.exe$' } | Select-Object ProcessId, ParentProcessId, CommandLine | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
    )
    return parseCimJson(stdout)
  }
  const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=', '-o', 'ppid=', '-o', 'command='], {
    timeout: 8_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  return parsePs(stdout)
}

async function killProcess(pid: number, platform: string): Promise<void> {
  if (platform === 'win32') {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 })
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function releaseStuckBrowser(
  userDataDir: string,
  io: {
    list?: () => Promise<ProcessRow[]>
    kill?: (pid: number) => Promise<void>
    remove?: (filePath: string) => Promise<void>
    wait?: (ms: number) => Promise<void>
    platform?: string
    rootPid?: number
  } = {},
): Promise<{ killed: number[]; kept: number[]; removed: string[] }> {
  if (!perfilAlvoValido(userDataDir)) return { killed: [], kept: [], removed: [] }
  const platform = io.platform ?? process.platform
  const rootPid = io.rootPid ?? process.pid
  const list = io.list ?? (() => listBrowserProcesses(platform))
  const kill = io.kill ?? ((pid: number) => killProcess(pid, platform))
  const remove = io.remove ?? ((filePath: string) => rm(filePath, { force: true }).then(() => undefined))
  const wait = io.wait ?? sleep
  const killed: number[] = []
  const kept: number[] = []
  let rows: ProcessRow[] = []
  try {
    rows = await list()
  } catch {
    rows = []
  }
  for (const row of rows) {
    if (!Number.isInteger(row.pid) || row.pid <= 0) continue
    if (!isBrowserCommand(row.command) || !commandLineMatchesProfile(row.command, userDataDir)) continue
    if (ehFilhoDoProcesso(row, rows, rootPid)) {
      kept.push(row.pid)
      continue
    }
    try {
      await kill(row.pid)
      killed.push(row.pid)
    } catch {
      // o processo pode ter saído entre a lista e o kill
    }
  }
  if (killed.length > 0) await wait(500)
  const removed: string[] = []
  if (kept.length === 0) {
    for (const name of LOCK_NAMES) {
      await remove(path.join(userDataDir, name))
      removed.push(name)
    }
  }
  return { killed, kept, removed }
}

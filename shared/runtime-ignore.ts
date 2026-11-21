import path from 'node:path'

/** Folders created at runtime. They stay inside the repo root so existing sessions keep working. */
export const RUNTIME_GLOBS = [
  '**/data/**',
  '**/.wwebjs_auth/**',
  '**/.wwebjs_cache/**',
  '**/coverage/**',
  '**/dist/**',
] as const

const RUNTIME_MARKERS = ['/data/', '/.wwebjs_auth/', '/.wwebjs_cache/', '/coverage/', '/dist/']

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

/** Globs for a custom DATA_DIR, plus the built-in runtime folders. */
export function runtimeIgnoreGlobs(dataDir = 'data'): string[] {
  const globs: string[] = [...RUNTIME_GLOBS]
  const extra = extraDataDir(dataDir)
  if (!extra) return globs
  if (/^[a-zA-Z]:/.test(extra) || extra.startsWith('/')) {
    globs.push(`${extra.replace(/\/$/, '')}/**`)
  } else {
    globs.push(`**/${extra}/**`)
  }
  return globs
}

const FS_DENY_SENSITIVE = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**'] as const

/**
 * Patterns for Vite `server.fs.deny`.
 *
 * Runtime directories are absolute and anchored to `root` (or to an absolute
 * DATA_DIR). Do not reuse {@link RUNTIME_GLOBS} here. A global dist glob also
 * matches `node_modules/vite/dist/client/client.mjs`. Vite then serves
 * `index.html` for `/@vite/client` and the dev page stays blank.
 * Watching `dist/` and `coverage/` is still fine. That list is {@link runtimeIgnoreGlobs}.
 */
export function runtimeFsDeny(root: string, dataDir = 'data'): string[] {
  const rootPosix = absolutePosix(root)
  const dirs = [`${rootPosix}/data`, `${rootPosix}/.wwebjs_auth`, `${rootPosix}/.wwebjs_cache`]
  const extra = extraDataDir(dataDir)
  if (extra) {
    const dir =
      /^[a-zA-Z]:/.test(extra) || extra.startsWith('/')
        ? extra.replace(/\/$/, '')
        : `${rootPosix}/${extra.replace(/\/$/, '')}`
    if (!dirs.includes(dir)) dirs.push(dir)
  }
  return [...FS_DENY_SENSITIVE, ...dirs.map((dir) => `${dir}/**`)]
}

/** Custom DATA_DIR that is not the default `data` folder. Paths that climb out are ignored. */
function extraDataDir(dataDir: string): string | undefined {
  const normalized = normalizeSlashes(dataDir).replace(/^\.\/|\/$/g, '')
  if (!normalized || normalized === 'data' || normalized.startsWith('..')) return undefined
  return normalized
}

function absolutePosix(root: string): string {
  const normalized = normalizeSlashes(root).replace(/\/+$/, '')
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) return normalized
  return normalizeSlashes(path.resolve(normalized || '.')).replace(/\/+$/, '')
}

/**
 * True for the WhatsApp/Edge profile and other runtime output.
 * Accepts Windows paths (`E:\\...\\data\\...\\wallet.html`) and POSIX paths.
 */
export function isRuntimePath(filePath: string, dataDir = 'data'): boolean {
  const normalized = normalizeSlashes(filePath)
  if (RUNTIME_MARKERS.some((marker) => normalized.includes(marker))) return true
  if (/\/(data|coverage|dist|\.wwebjs_auth|\.wwebjs_cache)$/.test(normalized)) return true
  const custom = normalizeSlashes(dataDir).replace(/^\.\/|\/$/g, '')
  if (!custom || custom === 'data') return false
  const abs = (/^[a-zA-Z]:/.test(custom) || custom.startsWith('/') ? custom : normalizeSlashes(path.resolve(custom))).replace(
    /\/$/,
    '',
  )
  return normalized === abs || normalized.startsWith(`${abs}/`) || normalized.includes(`/${abs}/`) || normalized.endsWith(`/${abs}`)
}

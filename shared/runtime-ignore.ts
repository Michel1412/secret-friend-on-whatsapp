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
  const normalized = normalizeSlashes(dataDir).replace(/^\.\/|\/$/g, '')
  if (!normalized || normalized === 'data' || normalized.startsWith('..')) return globs
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) {
    globs.push(`${normalized.replace(/\/$/, '')}/**`)
  } else {
    globs.push(`**/${normalized}/**`)
  }
  return globs
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

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from '../vite.config'
import { isRuntimePath, normalizeSlashes, runtimeFsDeny, runtimeIgnoreGlobs } from './runtime-ignore'

const require = createRequire(import.meta.url)
const picomatch = require('picomatch') as (
  globs: string[],
  options?: { matchBase?: boolean; nocase?: boolean; dot?: boolean },
) => (input: string) => boolean

/** Same compilation Vite uses for `server.fs.deny` (picomatch, slash-less patterns get a prefix). */
function deniedByVite(patterns: string[], filePath: string): boolean {
  const matches = picomatch(
    patterns.map((pattern) => (pattern.includes('/') ? pattern : `**/${pattern}`)),
    { matchBase: false, nocase: true, dot: true },
  )
  return matches(filePath)
}

const projectRoot = normalizeSlashes(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')).replace(/\/+$/, '')
const viteClient = 'node_modules/vite/dist/client/client.mjs'

const edgeWallet =
  'E:\\Projetos\\secret-friend-on-whatsapp\\data\\users\\abc\\wwebjs\\session-abc\\Edge Wallet\\load-ec-deps.bundle.js'
const edgeShopping =
  'E:/Projetos/secret-friend-on-whatsapp/data/users/abc/wwebjs/session-abc/Edge Shopping/shopping.html'

describe('pastas de runtime fora do Vite', () => {
  it('ignora o perfil do Edge dentro de data/ no Windows', () => {
    expect(isRuntimePath(edgeWallet)).toBe(true)
    expect(isRuntimePath(edgeShopping)).toBe(true)
    expect(isRuntimePath('E:/Projetos/secret-friend-on-whatsapp/index.html')).toBe(false)
    expect(isRuntimePath('E:/Projetos/secret-friend-on-whatsapp/src/App.tsx')).toBe(false)
  })

  it('cobre auth, cache, coverage, dist e um DATA_DIR absoluto', () => {
    expect(isRuntimePath('/repo/.wwebjs_auth/session')).toBe(true)
    expect(isRuntimePath('/repo/.wwebjs_cache/x')).toBe(true)
    expect(isRuntimePath('/repo/coverage/lcov.info')).toBe(true)
    expect(isRuntimePath('/repo/dist/index.html')).toBe(true)
    expect(isRuntimePath('D:\\sessao\\amigos', 'D:\\sessao\\amigos')).toBe(true)
    expect(runtimeIgnoreGlobs('data')).toEqual(
      expect.arrayContaining(['**/data/**', '**/.wwebjs_auth/**', '**/.wwebjs_cache/**', '**/coverage/**', '**/dist/**']),
    )
    expect(runtimeIgnoreGlobs('var/sessao').some((glob) => glob.includes('var/sessao'))).toBe(true)
    expect(runtimeIgnoreGlobs('D:/sessao').some((glob) => glob.startsWith('D:/sessao'))).toBe(true)
  })

  it('o Vite só escaneia index.html e o watch ignora dist e coverage', async () => {
    const resolved = typeof config === 'function' ? await config({ command: 'serve', mode: 'development' }) : config
    expect(resolved.optimizeDeps?.entries).toEqual(['index.html'])
    const ignored = resolved.server?.watch?.ignored
    const patterns = Array.isArray(ignored) ? ignored.filter((item) => typeof item === 'string') : []
    expect(patterns).toEqual(
      expect.arrayContaining(['**/data/**', '**/.wwebjs_auth/**', '**/.wwebjs_cache/**', '**/coverage/**', '**/dist/**']),
    )
    const deny = resolved.server?.fs?.deny ?? []
    expect(deny).toEqual(
      expect.arrayContaining([
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        `${projectRoot}/data/**`,
        `${projectRoot}/.wwebjs_auth/**`,
        `${projectRoot}/.wwebjs_cache/**`,
      ]),
    )
    expect(deny.some((pattern) => pattern.includes('**/dist') || pattern.includes('**/coverage'))).toBe(false)
    expect(deniedByVite(deny, `${projectRoot}/${viteClient}`)).toBe(false)
    expect(deniedByVite(deny, `${projectRoot}/data/users/abc/perfil.json`)).toBe(true)
    expect(deniedByVite(deny, `${projectRoot}/.env`)).toBe(true)
  })
})

describe('server.fs.deny ancorado na raiz', () => {
  const root = '/repo/secret-friend-on-whatsapp'
  const winRoot = 'E:/Projetos/secret-friend-on-whatsapp'
  const client = `${root}/${viteClient}`

  it('não casa o cliente do Vite e ainda bloqueia data, .env, certificados e .git', () => {
    const deny = runtimeFsDeny(root)
    expect(deny).toEqual([
      '.env',
      '.env.*',
      '*.{crt,pem}',
      '**/.git/**',
      `${root}/data/**`,
      `${root}/.wwebjs_auth/**`,
      `${root}/.wwebjs_cache/**`,
    ])
    expect(deniedByVite(deny, client)).toBe(false)
    expect(deniedByVite(deny, `${root}/node_modules/@vitejs/plugin-react/dist/index.js`)).toBe(false)
    expect(deniedByVite(deny, `${root}/node_modules/pkg/data/readme.md`)).toBe(false)
    expect(deniedByVite(deny, `${root}/dist/index.html`)).toBe(false)
    expect(deniedByVite(deny, `${root}/coverage/lcov.info`)).toBe(false)
    expect(deniedByVite(deny, `${root}/src/main.tsx`)).toBe(false)
    expect(deniedByVite(deny, `${root}/data/users/abc/perfil.json`)).toBe(true)
    expect(deniedByVite(deny, `${root}/.env`)).toBe(true)
    expect(deniedByVite(deny, `${root}/.env.local`)).toBe(true)
    expect(deniedByVite(deny, `${root}/.git/config`)).toBe(true)
    expect(deniedByVite(deny, `${root}/certs/dev.pem`)).toBe(true)
    expect(deniedByVite(deny, `${root}/.wwebjs_auth/session`)).toBe(true)
    expect(deniedByVite(deny, `${root}/.wwebjs_cache/x`)).toBe(true)
  })

  it('ancora DATA_DIR relativo ou absoluto, inclusive no Windows', () => {
    const relative = runtimeFsDeny(root, 'var/sessao')
    expect(deniedByVite(relative, `${root}/var/sessao/amigos.json`)).toBe(true)
    expect(deniedByVite(relative, client)).toBe(false)

    const fromDrive = runtimeFsDeny(winRoot, 'D:/sessao')
    expect(deniedByVite(fromDrive, 'D:/sessao/amigos.json')).toBe(true)
    expect(deniedByVite(fromDrive, `${winRoot}/data/users/abc/perfil.json`)).toBe(true)
    expect(deniedByVite(fromDrive, `${winRoot}/${viteClient}`)).toBe(false)
    expect(
      deniedByVite(
        runtimeFsDeny('E:\\Projetos\\secret-friend-on-whatsapp'),
        'E:/Projetos/secret-friend-on-whatsapp/data/users/abc/wwebjs/session-abc/Edge Wallet/shopping.html',
      ),
    ).toBe(true)
    expect(deniedByVite(runtimeFsDeny(root, 'D:\\sessao\\'), 'D:/sessao/amigos.json')).toBe(true)
    expect(deniedByVite(runtimeFsDeny(root, '/var/sessao/'), '/var/sessao/amigos.json')).toBe(true)
  })

  it('não duplica a pasta padrão e ignora DATA_DIR vazio ou que sobe de pasta', () => {
    const base = runtimeFsDeny(root)
    expect(runtimeFsDeny(root, 'data')).toEqual(base)
    expect(runtimeFsDeny(root, './data/')).toEqual(base)
    expect(runtimeFsDeny(root, '')).toEqual(base)
    expect(runtimeFsDeny(root, '..')).toEqual(base)
    expect(runtimeFsDeny(root, '../fora')).toEqual(base)
    expect(runtimeFsDeny(root, './../fora')).toEqual(base)
    expect(runtimeFsDeny(root, `${root}/data`)).toEqual(base)
    const resolved = normalizeSlashes(path.resolve('rel-root')).replace(/\/+$/, '')
    expect(runtimeFsDeny('rel-root')).toContain(`${resolved}/data/**`)
  })
})

import { describe, expect, it } from 'vitest'
import config from '../vite.config'
import { isRuntimePath, runtimeIgnoreGlobs } from './runtime-ignore'

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

  it('o Vite só escaneia index.html e nega as pastas de runtime', async () => {
    const resolved = typeof config === 'function' ? await config({ command: 'serve', mode: 'development' }) : config
    expect(resolved.optimizeDeps?.entries).toEqual(['index.html'])
    const ignored = resolved.server?.watch?.ignored
    const patterns = Array.isArray(ignored) ? ignored.filter((item) => typeof item === 'string') : []
    expect(patterns).toEqual(expect.arrayContaining(['**/data/**', '**/.wwebjs_auth/**', '**/.wwebjs_cache/**']))
    expect(resolved.server?.fs?.deny).toEqual(expect.arrayContaining(['**/data/**']))
  })
})

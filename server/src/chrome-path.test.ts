import { describe, expect, it } from 'vitest'
import { resolveChromePath } from './chrome-path'

describe('Chrome no Windows', () => {
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\Michel\\AppData\\Local',
  }

  it('prefere CHROME_PATH quando o arquivo existe', () => {
    const chosen = resolveChromePath({
      platform: 'win32',
      env: { ...env, CHROME_PATH: 'E:\\Chrome\\chrome.exe' },
      exists: (filePath) => filePath === 'E:\\Chrome\\chrome.exe',
    })
    expect(chosen).toBe('E:\\Chrome\\chrome.exe')
  })

  it('acha o Chrome instalado e, se não houver, o Edge', () => {
    const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    expect(
      resolveChromePath({
        platform: 'win32',
        env,
        exists: (filePath) => filePath === chrome,
      }),
    ).toBe(chrome)
    expect(
      resolveChromePath({
        platform: 'win32',
        env,
        exists: (filePath) => filePath === edge,
      }),
    ).toBe(edge)
  })
})

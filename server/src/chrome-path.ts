import path from 'node:path'

export function chromeCandidates(platform: string, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32') {
    const pf = env.PROGRAMFILES || 'C:\\Program Files'
    const pf86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
    const local = env.LOCALAPPDATA || ''
    return [
      path.win32.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.win32.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      local ? path.win32.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      path.win32.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.win32.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ].filter(Boolean)
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
}

export function resolveChromePath(input: {
  platform: string
  env: NodeJS.ProcessEnv
  exists: (filePath: string) => boolean
}): string | undefined {
  const configured = input.env.CHROME_PATH
  if (configured && input.exists(configured)) return configured
  return chromeCandidates(input.platform, input.env).find((candidate) => input.exists(candidate))
}

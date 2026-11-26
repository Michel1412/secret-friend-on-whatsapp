import { describe, expect, it } from 'vitest'
import {
  commandLineMatchesProfile,
  ehFilhoDoProcesso,
  isBrowserAlreadyRunning,
  isBrowserCommand,
  mensagemAbertura,
  parseCimJson,
  parsePs,
  perfilAlvoValido,
  releaseStuckBrowser,
  sanitizarMensagem,
  sessionUserDataDir,
  userDataDirFromError,
} from './browser-lock'

const PERFIL = 'C:\\Users\\Michel\\papel\\data\\users\\abc123abc123abc123abc123abc123ab\\wwebjs\\session-abc123abc123abc123abc123abc123ab'
const ERRO = `The browser is already running for ${PERFIL}. Use a different \`userDataDir\` or stop the running browser first.`

describe('perfil travado do navegador', () => {
  it('reconhece o erro do Puppeteer e tira o userDataDir sem cortar espaço', () => {
    const comEspaco = 'D:\\Avell PC\\data\\users\\aa\\wwebjs\\session-aa'
    const mensagem = `The browser is already running for ${comEspaco}. Use a different \`userDataDir\` or stop the running browser first.`
    expect(isBrowserAlreadyRunning(mensagem)).toBe(true)
    expect(userDataDirFromError(mensagem)).toBe(comEspaco)
    expect(isBrowserAlreadyRunning('Could not find Chrome')).toBe(false)
  })

  it('monta a mesma pasta de sessão do LocalAuth', () => {
    expect(sessionUserDataDir('data/users/abc/wwebjs', 'abc')).toMatch(/data[\\/]users[\\/]abc[\\/]wwebjs[\\/]session-abc$/)
  })

  it('só casa navegador cuja linha de comando contém aquele perfil', () => {
    const chrome = `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --user-data-dir=${PERFIL}`
    const edge = `C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe --user-data-dir="${PERFIL}"`
    const outro = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --user-data-dir=C:\\Users\\Michel\\outro'
    const node = `node server/src/index.ts ${PERFIL}`
    expect(isBrowserCommand(chrome)).toBe(true)
    expect(isBrowserCommand(edge)).toBe(true)
    expect(isBrowserCommand(node)).toBe(false)
    expect(commandLineMatchesProfile(chrome, PERFIL)).toBe(true)
    expect(commandLineMatchesProfile(edge, PERFIL)).toBe(true)
    expect(commandLineMatchesProfile(outro, PERFIL)).toBe(false)
    expect(commandLineMatchesProfile(node, PERFIL)).toBe(true)
    expect(perfilAlvoValido('session')).toBe(false)
    expect(perfilAlvoValido(PERFIL)).toBe(true)
  })

  it('mata só o navegador do perfil e apaga os locks', async () => {
    const killed: number[] = []
    const removed: string[] = []
    const result = await releaseStuckBrowser(PERFIL, {
      list: async () => [
        { pid: 10, ppid: 1, command: `chrome.exe --user-data-dir=${PERFIL}` },
        { pid: 11, ppid: 1, command: 'chrome.exe --user-data-dir=C:\\outro\\session-outro' },
        { pid: process.pid, ppid: 1, command: 'node server/src/index.ts' },
        { pid: 12, ppid: 1, command: `node server ${PERFIL}` },
      ],
      kill: async (pid) => {
        killed.push(pid)
      },
      remove: async (file) => {
        removed.push(file)
      },
      wait: async () => undefined,
    })
    expect(killed).toEqual([10])
    expect(result.killed).toEqual([10])
    expect(removed.some((file) => file.endsWith('SingletonLock'))).toBe(true)
    expect(removed.some((file) => file.endsWith('lockfile'))).toBe(true)
    expect(result.kept).toEqual([])
  })

  it('não mata o Chrome filho deste processo nem apaga o lock que ele segura', async () => {
    const killed: number[] = []
    const removed: string[] = []
    const result = await releaseStuckBrowser(PERFIL, {
      rootPid: 100,
      list: async () => [
        { pid: 50, ppid: 100, command: `chrome.exe --user-data-dir=${PERFIL}` },
        { pid: 51, ppid: 50, command: `chrome.exe --type=renderer --user-data-dir=${PERFIL}` },
        { pid: 70, ppid: 1, command: `chrome.exe --user-data-dir=${PERFIL}` },
      ],
      kill: async (pid) => {
        killed.push(pid)
      },
      remove: async (file) => {
        removed.push(file)
      },
      wait: async () => undefined,
    })
    expect(killed).toEqual([70])
    expect(result.kept).toEqual([50, 51])
    expect(removed).toEqual([])
  })

  it('a mensagem da UI traz o erro real sem caminho, e-mail ou número', () => {
    const texto = mensagemAbertura(
      new Error(`${ERRO} contato ana@exemplo.com +5511988880001`),
      PERFIL,
    )
    expect(texto).toContain('The browser is already running for')
    expect(texto).toContain('Use a different')
    expect(texto).not.toContain('Michel')
    expect(texto).not.toContain('CHROME_PATH')
    expect(texto).not.toContain('ana@exemplo.com')
    expect(texto).not.toContain('5511988880001')
    expect(texto).not.toContain('abc123')
  })

  it('mostra a falha real de abertura sem o caminho do executável', () => {
    const texto = mensagemAbertura(
      new Error('Failed to launch C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe: spawn UNKNOWN'),
    )
    expect(texto).toContain('spawn UNKNOWN')
    expect(texto).not.toContain('Program Files')
    expect(texto).not.toContain('CHROME_PATH')
  })

  it('lê a lista do PowerShell e do ps', () => {
    expect(parseCimJson('{"ProcessId":4,"CommandLine":"chrome.exe --user-data-dir=C:\\\\a"}')).toEqual([
      { pid: 4, command: 'chrome.exe --user-data-dir=C:\\a' },
    ])
    expect(parsePs('  9  1 /usr/bin/google-chrome --user-data-dir=/tmp/session-a\n')).toEqual([
      { pid: 9, ppid: 1, command: '/usr/bin/google-chrome --user-data-dir=/tmp/session-a' },
    ])
    expect(parseCimJson('')).toEqual([])
    expect(parsePs('')).toEqual([])
    expect(mensagemAbertura('texto')).toMatch(/navegador/)
    const espera = mensagemAbertura(new Error('Waiting failed: 30000ms exceeded'))
    expect(espera).toMatch(/não terminou de carregar/)
    expect(espera).toMatch(/Gerar QR/)
    expect(espera).not.toMatch(/Waiting failed|30000/)
    expect(mensagemAbertura(new Error('auth timeout'))).toMatch(/não terminou de carregar/)
    expect(mensagemAbertura(new Error('Não consegui abrir o navegador do WhatsApp.'))).toMatch(/navegador/)
    expect(sanitizarMensagem('  oi   ', ['ab'])).toBe('oi')
    expect(sanitizarMensagem('x'.repeat(300)).endsWith('…')).toBe(true)
  })

  it('mata navegador órfão, preserva filho e ignora lista quebrada', async () => {
    const dir = '/tmp/papel-perfil-teste/session-abc123abc123abc123abc123abc123ab'
    const rows = [
      { pid: 0, command: 'chrome' },
      { pid: 4, ppid: 1, command: `google-chrome --user-data-dir=${dir}` },
      { pid: 5, ppid: 4, command: `google-chrome --user-data-dir=${dir}` },
      { pid: 6, ppid: 1, command: 'node index.js' },
    ]
    const killed: number[] = []
    const released = await releaseStuckBrowser(dir, {
      list: async () => rows,
      kill: async (pid) => {
        killed.push(pid)
        if (pid === 4) throw new Error('sumiu')
      },
      remove: async () => undefined,
      wait: async () => undefined,
      rootPid: 5,
    })
    expect(killed).toEqual([4])
    expect(released.kept).toContain(5)
    const empty = await releaseStuckBrowser(dir, {
      list: async () => {
        throw new Error('ps')
      },
      remove: async () => undefined,
      wait: async () => undefined,
    })
    expect(empty.killed).toEqual([])
    expect(empty.removed.length).toBeGreaterThan(0)
    expect(ehFilhoDoProcesso({ pid: 8, ppid: 99, command: 'chrome' }, [{ pid: 8, ppid: 99, command: 'chrome' }], 1)).toBe(false)
    expect(await releaseStuckBrowser('session')).toEqual({ killed: [], kept: [], removed: [] })
  })
})

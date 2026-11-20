import { describe, expect, it } from 'vitest'
import { WhatsAppSession } from './whatsapp'

describe('uma abertura por usuário', () => {
  it('duas chamadas concorrentes inicializam uma vez', async () => {
    let initializes = 0
    let release!: () => void
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const session = new WhatsAppSession('/tmp/secret-friend-on-whatsapp-start', 'cliente', async () => {
      initializes += 1
      await hold
    })

    const first = session.getOrStart()
    const second = session.getOrStart()
    const third = session.connect(true)

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(initializes).toBe(1)
    release()
    await Promise.all([first, second, third])
    expect(initializes).toBe(1)
  })
})

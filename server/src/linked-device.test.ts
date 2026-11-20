import { describe, expect, it } from 'vitest'
import { browserName, deviceName } from './config'

describe('aparelho conectado', () => {
  it('usa o nome Papelzinho - ZAP no Chrome do WhatsApp Web', () => {
    expect(deviceName).toBe('Papelzinho - ZAP')
    expect(browserName).toBe('Chrome')
  })
})

import { describe, expect, it } from 'vitest'
import { formatBrazilPhone, normalizeBrazilPhone } from './phone'

describe('normalizeBrazilPhone', () => {
  it('aceita os formatos comuns de celular', () => {
    const expected = '+5511988887777'
    for (const input of [
      '(11) 98888-7777',
      '11988887777',
      '+55 11 98888-7777',
      '5511988887777',
      '011988887777',
    ]) {
      expect(normalizeBrazilPhone(input)).toEqual({ ok: true, e164: expected })
    }
  })

  it('formata para leitura', () => {
    expect(formatBrazilPhone('+5511988887777')).toBe('+55 11 98888-7777')
  })

  it('recusa fixo, DDD inválido e número curto', () => {
    expect(normalizeBrazilPhone('(11) 3333-4444').ok).toBe(false)
    expect(normalizeBrazilPhone('00123456789').ok).toBe(false)
    expect(normalizeBrazilPhone('119888877').ok).toBe(false)
    const ddd = normalizeBrazilPhone('(10) 98888-7777')
    expect(ddd.ok).toBe(false)
    if (!ddd.ok) expect(ddd.error).toMatch(/DDD/)
  })

  it('aceita DDD 55, que também é o código do país', () => {
    expect(normalizeBrazilPhone('(55) 99999-0000')).toEqual({
      ok: true,
      e164: '+5555999990000',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { sameAccount, sameWhatsAppNumber } from './identity'

describe('sameWhatsAppNumber', () => {
  it('aceita o mesmo celular com máscara, 55 e o 9 a mais ou a menos', () => {
    expect(sameWhatsAppNumber('+55 11 98888-7777', '5511988887777')).toBe(true)
    expect(sameWhatsAppNumber('5511988887777', '551188887777')).toBe(true)
    expect(sameWhatsAppNumber('11988887777', '551188887777')).toBe(true)
  })

  it('não confunde outro número nem um LID com telefone', () => {
    expect(sameWhatsAppNumber('5511988887777', '5511988887778')).toBe(false)
    expect(sameWhatsAppNumber('5511988887777', '999999999999@lid')).toBe(false)
  })
})

describe('sameAccount', () => {
  it('reconhece o próprio número pela variação do 9, pelo jid e pelo LID', () => {
    expect(
      sameAccount(
        { phone: '+5511988887777', jid: '5511988887777:12@s.whatsapp.net' },
        { phone: '551188887777' },
      ),
    ).toBe(true)
    expect(
      sameAccount(
        { jid: '5511988880280@s.whatsapp.net', lid: '12345@lid' },
        { jid: '12345:1@lid', phone: '+5511999990000' },
      ),
    ).toBe(true)
  })

  it('não trata outra pessoa como o número conectado', () => {
    expect(
      sameAccount(
        { phone: '+5511988887777', lid: '111@lid' },
        { phone: '+5521988880002', lid: '222@lid' },
      ),
    ).toBe(false)
  })
})

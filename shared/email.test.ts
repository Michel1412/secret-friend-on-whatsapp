import { describe, expect, it } from 'vitest'
import { emailAceito, normalizeEmail } from './email'

describe('e-mail de controle', () => {
  it('normaliza espaços e maiúsculas', () => {
    expect(normalizeEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com')
    expect(emailAceito('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com')
  })

  it('recusa vazio e texto sem arroba', () => {
    expect(emailAceito('')).toBeNull()
    expect(emailAceito('ana')).toBeNull()
    expect(emailAceito('ana@')).toBeNull()
  })
})

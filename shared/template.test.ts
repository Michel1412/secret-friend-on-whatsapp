import { describe, expect, it } from 'vitest'
import { fillTemplate, templateHasVariable } from './template'

describe('fillTemplate', () => {
  it('troca sorteado e amigo, sem interpretar caracteres especiais', () => {
    expect(fillTemplate('Oi {{sorteado}} / {{ amigo }}', '$&')).toBe('Oi $& / $&')
    expect(fillTemplate('Tirou {{AMIGO}}', 'Lia')).toBe('Tirou Lia')
  })

  it('exige a variável', () => {
    expect(templateHasVariable('sem nada')).toBe(false)
    expect(() => fillTemplate('Oi', 'Ana')).toThrow(/sorteado/)
  })
})

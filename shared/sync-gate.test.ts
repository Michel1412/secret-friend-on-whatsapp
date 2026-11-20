import { describe, expect, it } from 'vitest'
import { codigoTeste, envioLiberado, mensagemTeste, registrarFalhaApagar } from './sync-gate'

describe('código do teste de apagar', () => {
  it('gera 8 dígitos, inclusive com zero na frente', () => {
    expect(codigoTeste(() => 0)).toBe('00000000')
    const code = codigoTeste(() => 0.99)
    expect(code).toHaveLength(8)
    expect(code).toMatch(/^\d{8}$/)
    expect(mensagemTeste('12345678')).toBe('Teste Papelzinho #12345678')
  })
})

describe('gate do verificado', () => {
  it('bloqueia o envio até o WhatsApp Web ficar pronto', () => {
    expect(envioLiberado(false)).toBe(false)
    expect(envioLiberado(true)).toBe(true)
  })
})

describe('retry de falha ao apagar', () => {
  it('repete no máximo 3 vezes', () => {
    let tentativas = 0
    const resultados: boolean[] = []
    for (let index = 0; index < 3; index += 1) {
      const next = registrarFalhaApagar(tentativas)
      tentativas = next.tentativas
      resultados.push(next.esgotou)
    }
    expect(resultados).toEqual([false, false, true])
    expect(tentativas).toBe(3)
  })
})

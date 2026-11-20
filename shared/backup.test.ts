import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'

describe('parseBackup', () => {
  it('lê o formato do app e normaliza o telefone', () => {
    const parsed = parseBackup({
      versao: 1,
      participantes: [{ id: 'p1', nome: 'Ana', telefone: '(21) 98888-0000' }],
      mensagem: 'Oi {{sorteado}}',
      intervaloMs: 4000,
    })
    expect(parsed.participantes).toEqual([
      { id: 'p1', nome: 'Ana', telefone: '+5521988880000' },
    ])
    expect(parsed.mensagem).toBe('Oi {{sorteado}}')
    expect(parsed.intervaloMs).toBe(4000)
  })

  it('explica a linha com erro', () => {
    expect(() =>
      parseBackup({ participantes: [{ nome: 'Ana', telefone: '123' }] }),
    ).toThrow(/Linha 1/)
  })
})

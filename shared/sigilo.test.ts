import { describe, expect, it } from 'vitest'
import {
  FRASE_QUEBRA_SIGILO,
  createSigiloGate,
  fraseConfere,
  impressaoDaLista,
  validarPares,
} from './sigilo'

describe('frase de quebra de sigilo', () => {
  it('aceita a frase fixa com maiúsculas e espaços sobrando', () => {
    expect(fraseConfere('  Quero   quebrar o sigilo  ')).toBe(true)
    expect(fraseConfere(FRASE_QUEBRA_SIGILO.toUpperCase())).toBe(true)
  })

  it('não aceita frase parecida nem acento', () => {
    expect(fraseConfere('quero quebrar o sígilo')).toBe(false)
    expect(fraseConfere('quero quebrar sigilo')).toBe(false)
    expect(fraseConfere('')).toBe(false)
  })

  it('trava depois de várias tentativas erradas e solta depois do tempo', () => {
    let clock = 1_000
    const gate = createSigiloGate(() => clock)
    for (let index = 0; index < 4; index += 1) {
      const result = gate.attempt('errado')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.retryAfterMs).toBeUndefined()
    }
    const locked = gate.attempt('errado')
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.retryAfterMs).toBe(20_000)

    const during = gate.attempt(FRASE_QUEBRA_SIGILO)
    expect(during.ok).toBe(false)

    clock += 20_000
    expect(gate.attempt(FRASE_QUEBRA_SIGILO).ok).toBe(true)
  })

  it('um sorteio novo zera as tentativas', () => {
    const gate = createSigiloGate(() => 0)
    for (let index = 0; index < 5; index += 1) gate.attempt('nao')
    gate.reset()
    expect(gate.attempt(FRASE_QUEBRA_SIGILO).ok).toBe(true)
  })
})

describe('impressão e validação da lista revelada', () => {
  it('a impressão não depende da ordem', () => {
    const a = { id: '1', nome: 'Ana', telefone: '+5511999990001' }
    const b = { id: '2', nome: 'Bia', telefone: '+5511999990002' }
    expect(impressaoDaLista([a, b])).toBe(impressaoDaLista([b, a]))
  })

  it('reconhece uma bijeção sem auto-sorteio', () => {
    const result = validarPares([
      {
        nome: 'Ana',
        telefone: '+5511999990001',
        sorteado: 'Bia',
        telefoneSorteado: '+5511999990002',
      },
      {
        nome: 'Bia',
        telefone: '+5511999990002',
        sorteado: 'Ana',
        telefoneSorteado: '+5511999990001',
      },
    ])
    expect(result).toEqual({ total: 2, semAutoSorteio: true, bijecao: true })
  })
})

import { describe, expect, it } from 'vitest'
import {
  DrawError,
  drawDerangement,
  isDerangement,
  randomDerangement,
  rotateDerangement,
} from './derangement'

function assertBijection(ids: string[], pairs: { giverId: string; receiverId: string }[]) {
  expect(pairs).toHaveLength(ids.length)
  expect(pairs.map((pair) => pair.giverId).sort()).toEqual([...ids].sort())
  expect(pairs.map((pair) => pair.receiverId).sort()).toEqual([...ids].sort())
  for (const pair of pairs) {
    expect(pair.giverId).not.toBe(pair.receiverId)
  }
}

describe('drawDerangement', () => {
  it('recusa menos de 2 pessoas', () => {
    expect(() => drawDerangement([])).toThrow(DrawError)
    expect(() => drawDerangement([{ id: 'a' }])).toThrow(/pelo menos 2/)
  })

  it('recusa identificador repetido', () => {
    expect(() => drawDerangement([{ id: 'a' }, { id: 'a' }])).toThrow(/repetidos/)
  })

  it('com 2 pessoas só existe a troca', () => {
    const people = [{ id: 'ana' }, { id: 'bia' }]
    for (let trial = 0; trial < 30; trial += 1) {
      const pairs = drawDerangement(people)
      assertBijection(['ana', 'bia'], pairs)
      const byGiver = Object.fromEntries(pairs.map((pair) => [pair.giverId, pair.receiverId]))
      expect(byGiver.ana).toBe('bia')
      expect(byGiver.bia).toBe('ana')
    }
  })

  it('não tem ponto fixo e cada pessoa aparece uma vez dos dois lados', () => {
    for (const size of [3, 4, 5, 8, 12]) {
      const people = Array.from({ length: size }, (_, index) => ({ id: `p${index}` }))
      for (let trial = 0; trial < 40; trial += 1) {
        const pairs = drawDerangement(people)
        assertBijection(
          people.map((person) => person.id),
          pairs,
        )
      }
    }
  })

  it('cai na rotação quando o sorteio aleatório não acha derangement', () => {
    const perm = randomDerangement(5, () => 0.999999999, 0)
    expect(perm).toEqual(rotateDerangement(5))
    expect(isDerangement(perm)).toBe(true)
  })

  it('rotação de 2 ou mais lugares não tem ponto fixo', () => {
    for (const size of [2, 3, 7]) {
      const perm = rotateDerangement(size)
      expect(isDerangement(perm)).toBe(true)
      expect(new Set(perm).size).toBe(size)
    }
  })
})

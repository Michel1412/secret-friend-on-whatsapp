import { describe, expect, it, vi } from 'vitest'
import { apagadoConfirmado, apagarComTentativas } from './wa-flow'

describe('confirmação do apagar para mim', () => {
  it('confirma com o evento ou quando a mensagem some', () => {
    expect(apagadoConfirmado({ revoke: true, encontrada: true })).toBe(true)
    expect(apagadoConfirmado({ revoke: false, encontrada: false })).toBe(true)
    expect(apagadoConfirmado({ revoke: false, encontrada: true })).toBe(false)
  })

  it('chama o client no máximo 3 vezes', async () => {
    const attempt = vi.fn(async () => false)
    await expect(apagarComTentativas(attempt)).resolves.toBe(false)
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('para na tentativa que o mock confirma', async () => {
    const attempt = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    await expect(apagarComTentativas(attempt)).resolves.toBe(true)
    expect(attempt).toHaveBeenCalledTimes(2)
  })
})

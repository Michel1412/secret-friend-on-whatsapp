import { describe, expect, it, vi } from 'vitest'
import {
  SendFailure,
  deleteForMeModification,
  entregarMensagem,
  toSeconds,
} from './deliver'

const key = { remoteJid: '5511988887777@s.whatsapp.net', id: 'MSG1', timestamp: 1_730_000_000 }

describe('apagar para mim', () => {
  it('monta o patch deleteForMe e não um revoke para todos', () => {
    const modification = deleteForMeModification(key)
    expect(modification.deleteForMe.key.fromMe).toBe(true)
    expect(modification.deleteForMe.timestamp).toBe(1_730_000_000)
    expect(modification).not.toHaveProperty('delete')
    expect(JSON.stringify(modification)).not.toMatch(/REVOKE|deleteForEveryone/i)
  })

  it('converte timestamp longo e milissegundos', () => {
    expect(toSeconds({ toNumber: () => 1_730_000_000 })).toBe(1_730_000_000)
    expect(toSeconds(1_730_000_000_000)).toBe(1_730_000_000)
  })

  it('envia e só então apaga para mim', async () => {
    const order: string[] = []
    const result = await entregarMensagem(
      {
        sendText: async () => {
          order.push('send')
          return key
        },
        deleteForMe: async () => {
          order.push('delete-for-me')
          return true
        },
        sleep: async () => {
          order.push('sleep')
        },
      },
      { text: 'Oi Ana', deleteDelayMs: 10, attempts: 3 },
    )
    expect(result).toMatchObject({ sent: true, deletedForMe: true })
    expect(order).toEqual(['send', 'sleep', 'delete-for-me'])
  })

  it('não apaga se o envio falha', async () => {
    const deleteForMe = vi.fn()
    const result = await entregarMensagem(
      {
        sendText: async () => {
          throw new SendFailure('Este número não está no WhatsApp.')
        },
        deleteForMe,
        sleep: async () => undefined,
      },
      { text: 'Oi', deleteDelayMs: 1 },
    )
    expect(result).toEqual({
      sent: false,
      deletedForMe: false,
      error: 'Este número não está no WhatsApp.',
    })
    expect(deleteForMe).not.toHaveBeenCalled()
  })

  it('mantém o envio se o apagar para mim falha', async () => {
    const result = await entregarMensagem(
      {
        sendText: async () => key,
        deleteForMe: async () => {
          throw new Error('sync')
        },
        sleep: async () => undefined,
      },
      { text: 'Oi', deleteDelayMs: 1, attempts: 2 },
    )
    expect(result.sent).toBe(true)
    expect(result.deletedForMe).toBe(false)
    expect(result.error).toMatch(/não confirmado/)
  })

  it('não apaga quando o destino é o próprio número', async () => {
    const deleteForMe = vi.fn(async () => true)
    const result = await entregarMensagem(
      {
        sendText: async () => key,
        deleteForMe,
        sleep: async () => undefined,
      },
      { text: 'Oi', deleteDelayMs: 1, skipDelete: true },
    )
    expect(result).toMatchObject({ sent: true, deletedForMe: false, ownNumber: true })
    expect(deleteForMe).not.toHaveBeenCalled()
  })

  it('não marca apagado sem confirmação', async () => {
    const result = await entregarMensagem(
      {
        sendText: async () => key,
        deleteForMe: async () => false,
        sleep: async () => undefined,
      },
      { text: 'Oi', deleteDelayMs: 1, attempts: 1 },
    )
    expect(result.deletedForMe).toBe(false)
    expect(result.error).toMatch(/não confirmado/)
  })
})

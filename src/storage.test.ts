/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import { loadDelay, loadMessage, loadPeople, saveDelay, saveMessage, savePeople } from './storage'

describe('rascunho local', () => {
  it('ignora lixo e só aceita pausas conhecidas', () => {
    localStorage.clear()
    expect(loadPeople()).toEqual([])
    expect(loadMessage()).toMatch(/sorteado/)
    expect(loadDelay()).toBe(3000)
    localStorage.setItem('secret-friend-on-whatsapp.participantes', '{')
    localStorage.setItem('secret-friend-on-whatsapp.mensagem', '')
    localStorage.setItem('secret-friend-on-whatsapp.intervalo', '1')
    expect(loadPeople()).toEqual([])
    expect(loadDelay()).toBe(3000)
    savePeople([{ id: 'a', nome: 'Pessoa Alfa', telefone: '+5511900000001' }])
    saveMessage('Aviso {{sorteado}}')
    saveDelay(4000)
    expect(loadPeople()[0]?.nome).toBe('Pessoa Alfa')
    expect(loadMessage()).toBe('Aviso {{sorteado}}')
    expect(loadDelay()).toBe(4000)
    localStorage.setItem(
      'secret-friend-on-whatsapp.participantes',
      JSON.stringify([{ id: 'b', nome: ' ', telefone: '1' }, { nome: 'Pessoa Beta', telefone: '21900000002' }]),
    )
    expect(loadPeople()).toHaveLength(1)
  })
})

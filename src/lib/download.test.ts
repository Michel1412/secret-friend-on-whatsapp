/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'
import { downloadCsv, downloadJson } from './download'

describe('download', () => {
  it('gera json e csv sem abrir navegador de verdade', () => {
    const clicks: string[] = []
    URL.createObjectURL = vi.fn(() => 'blob:papel')
    URL.revokeObjectURL = vi.fn()
    const real = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = real(tag)
      if (tag === 'a') {
        element.click = () => clicks.push(element.download)
      }
      return element
    })
    downloadJson({ pares: [] })
    downloadCsv([
      { nome: 'Pessoa Alfa', telefone: '+5511900000001', sorteado: 'Pessoa Beta', telefoneSorteado: '+5521900000002' },
      { nome: 'Aspas "x"', telefone: '+5511900000003', sorteado: 'Pessoa Alfa', telefoneSorteado: '+5511900000001' },
    ])
    expect(clicks).toEqual(['quebra-de-sigilo.json', 'quebra-de-sigilo.csv'])
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
})

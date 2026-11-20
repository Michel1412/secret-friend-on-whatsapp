import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { readWorkbook, sheetToRows } from './sheet'

describe('planilha', () => {
  it('lê abas, números e células vazias', () => {
    const book = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Telefone'],
      ['Pessoa Alfa', 11900000001],
      ['', ''],
      ['Pessoa Beta', '21900000002'],
    ])
    XLSX.utils.book_append_sheet(book, sheet, 'Turma')
    XLSX.utils.book_append_sheet(book, {}, 'Vazia')
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const table = readWorkbook(bytes)
    expect(table.sheetNames).toEqual(['Turma', 'Vazia'])
    expect(table.sheets.Turma[1]?.[0]).toBe('Pessoa Alfa')
    expect(table.sheets.Turma[1]?.[1]).toMatch(/900000001/)
    expect(table.sheets.Vazia).toEqual([])
    expect(sheetToRows({})).toEqual([])
  })

})

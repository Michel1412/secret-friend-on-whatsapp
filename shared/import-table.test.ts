import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  classifyImport,
  detectDelimiter,
  guessColumns,
  looksLikeHeader,
  parseDelimitedText,
  sniffColumns,
} from './import-table'
import { readWorkbook } from './sheet'

describe('parseDelimitedText', () => {
  it('aceita vírgula, ponto e vírgula, tab e BOM', () => {
    expect(detectDelimiter('Nome,Telefone')).toBe(',')
    expect(detectDelimiter('Nome;Telefone')).toBe(';')
    expect(detectDelimiter('Nome\tTelefone')).toBe('\t')

    const comma = parseDelimitedText('Nome,Telefone\nAna,(11) 98888-7777\n')
    const semi = parseDelimitedText('\uFEFFNome;Telefone\r\n"Ana, Lima";11988887777\r\n')
    const pasted = parseDelimitedText('Nome\tWhatsApp\nBia\t21999990000')

    expect(comma[1]).toEqual(['Ana', '(11) 98888-7777'])
    expect(semi[1]).toEqual(['Ana, Lima', '11988887777'])
    expect(pasted[0]).toEqual(['Nome', 'WhatsApp'])
  })

  it('ignora linha vazia', () => {
    const rows = parseDelimitedText('Nome;Telefone\n\nAna;11988887777\n')
    expect(rows).toHaveLength(2)
  })
})

describe('colunas', () => {
  it('adivinha cabeçalhos em português e inglês', () => {
    expect(guessColumns(['Nome', 'Telefone'])).toEqual({ nome: 0, telefone: 1 })
    expect(guessColumns(['Name', 'Phone'])).toEqual({ nome: 0, telefone: 1 })
    expect(guessColumns(['Pessoa', 'Celular'])).toEqual({ nome: 0, telefone: 1 })
    expect(guessColumns(['Contato', 'WhatsApp'])).toEqual({ nome: 0, telefone: 1 })
    expect(looksLikeHeader(['Nome', 'Telefone'])).toBe(true)
    expect(looksLikeHeader(['Ana', '11988887777'])).toBe(false)
  })

  it('sem cabeçalho, escolhe a coluna que parece telefone', () => {
    expect(
      sniffColumns([
        ['Ana Lima', '11988880001'],
        ['Bia Costa', '21988880002'],
      ]),
    ).toEqual({ nome: 0, telefone: 1 })
  })
})

describe('classifyImport', () => {
  const rows = [
    ['Nome', 'Telefone'],
    ['Ana', '(11) 98888-0001'],
    ['', ''],
    ['Bia', '21988880002'],
    ['Caio', '123'],
    ['', '11988880003'],
    ['Duda', '11988880001'],
    ['Eva', '1198888-0004'],
  ]

  it('normaliza, pula vazios e marca inválidos e repetidos', () => {
    const result = classifyImport(rows, { nomeCol: 0, telefoneCol: 1, header: true })
    expect(result.accepted.map((person) => [person.nome, person.telefone])).toEqual([
      ['Ana', '+5511988880001'],
      ['Bia', '+5521988880002'],
      ['Eva', '+5511988880004'],
    ])
    expect(result.vazios).toBe(1)
    expect(result.invalidos).toBe(2)
    expect(result.duplicados).toBe(1)
    expect(result.issues.map((issue) => issue.status)).toEqual(['invalido', 'invalido', 'duplicado'])
  })

  it('trata repetido da lista atual como duplicado quando for acrescentar', () => {
    const result = classifyImport(
      [
        ['Lia', '11988880001'],
        ['Novo', '11977770001'],
      ],
      { nomeCol: 0, telefoneCol: 1, header: false, existingPhones: ['+5511988880001'] },
    )
    expect(result.accepted.map((person) => person.nome)).toEqual(['Novo'])
    expect(result.duplicados).toBe(1)
  })

  it('inclui a primeira linha quando ela não é cabeçalho', () => {
    const result = classifyImport(
      [
        ['Ana', '11988880001'],
        ['Bia', '21988880002'],
      ],
      { nomeCol: 0, telefoneCol: 1, header: false },
    )
    expect(result.accepted).toHaveLength(2)
  })
})

describe('readWorkbook', () => {
  it('lê a primeira aba e deixa escolher outra', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Nome', 'Telefone'],
        ['Ana', 11988880001],
      ]),
      'Turma',
    )
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'WhatsApp'],
        ['Bia', 21988880002],
      ]),
      'Outra',
    )
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const read = readWorkbook(bytes)
    expect(read.sheetNames).toEqual(['Turma', 'Outra'])
    expect(read.sheets.Turma[1]?.[1]).toBe('11988880001')
    const classified = classifyImport(read.sheets.Outra ?? [], {
      nomeCol: 0,
      telefoneCol: 1,
      header: true,
    })
    expect(classified.accepted[0]?.telefone).toBe('+5521988880002')
  })
})

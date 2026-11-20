import { normalizeBrazilPhone } from './phone'
import type { ParticipantInput } from './types'

const NAME_KEYS = ['nome', 'name', 'participante', 'pessoa', 'contato', 'amigo']
const PHONE_KEYS = ['whatsapp', 'telefone', 'celular', 'phone', 'numero', 'fone', 'tel', 'cel', 'zap']

export type ColumnGuess = {
  nome: number | null
  telefone: number | null
}

export type ImportIssue = {
  line: number
  nome: string
  telefone: string
  status: 'invalido' | 'duplicado'
  motivo: string
}

export type ClassifiedImport = {
  accepted: ParticipantInput[]
  issues: ImportIssue[]
  vazios: number
  invalidos: number
  duplicados: number
}

function headerKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function matchesKey(value: string, keys: readonly string[]): boolean {
  return keys.some((key) => value === key || value.startsWith(key))
}

export function guessColumns(headers: readonly string[]): ColumnGuess {
  let nome: number | null = null
  let telefone: number | null = null
  headers.forEach((header, index) => {
    const key = headerKey(header)
    if (!key) return
    if (nome === null && matchesKey(key, NAME_KEYS)) nome = index
    if (telefone === null && matchesKey(key, PHONE_KEYS)) telefone = index
  })
  if (nome !== null && nome === telefone) telefone = null
  return { nome, telefone }
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 13
}

export function sniffColumns(rows: readonly string[][]): ColumnGuess {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  let phoneIndex: number | null = null
  let phoneScore = 0
  let nameIndex: number | null = null
  let nameScore = 0
  for (let column = 0; column < width; column += 1) {
    let phones = 0
    let names = 0
    for (const row of rows.slice(0, 12)) {
      const value = row[column]?.trim() ?? ''
      if (!value) continue
      if (looksLikePhone(value)) phones += 1
      else if (/[A-Za-zÀ-ÿ]/.test(value)) names += 1
    }
    if (phones > phoneScore) {
      phoneScore = phones
      phoneIndex = column
    }
    if (names > nameScore) {
      nameScore = names
      nameIndex = column
    }
  }
  if (nameIndex !== null && nameIndex === phoneIndex) nameIndex = null
  return { nome: nameIndex, telefone: phoneIndex }
}

export function looksLikeHeader(row: readonly string[]): boolean {
  const guess = guessColumns(row)
  return guess.nome !== null && guess.telefone !== null
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && char === delimiter) count += 1
  }
  return count
}

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8)
  const score = { ',': 0, ';': 0, '\t': 0 }
  for (const line of sample) {
    score[','] += countOutsideQuotes(line, ',')
    score[';'] += countOutsideQuotes(line, ';')
    score['\t'] += countOutsideQuotes(line, '\t')
  }
  if (score['\t'] > 0 && score['\t'] >= score[';'] && score['\t'] >= score[',']) return '\t'
  if (score[';'] > score[',']) return ';'
  return ','
}

/** CSV, semicolon or a spreadsheet paste. UTF-8, with or without BOM. */
export function parseDelimitedText(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!text.trim()) throw new Error('Não encontrei linhas para importar.')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char ?? ''
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += char ?? ''
  }
  row.push(cell.trim())
  if (row.some((value) => value !== '')) rows.push(row)
  if (rows.length === 0) throw new Error('Não encontrei linhas para importar.')
  const width = rows.reduce((max, line) => Math.max(max, line.length), 0)
  return rows.map((line) => {
    const padded = line.slice()
    while (padded.length < width) padded.push('')
    return padded
  })
}

export function classifyImport(
  rows: readonly string[][],
  options: {
    nomeCol: number
    telefoneCol: number
    header: boolean
    existingPhones?: readonly string[]
  },
): ClassifiedImport {
  const start = options.header ? 1 : 0
  const seen = new Set(options.existingPhones ?? [])
  const accepted: ParticipantInput[] = []
  const issues: ImportIssue[] = []
  let vazios = 0
  let invalidos = 0
  let duplicados = 0

  for (let index = start; index < rows.length; index += 1) {
    const source = rows[index] ?? []
    const nome = (source[options.nomeCol] ?? '').trim()
    const telefone = (source[options.telefoneCol] ?? '').trim()
    const line = index + 1
    if (!nome && !telefone) {
      vazios += 1
      continue
    }
    if (!nome) {
      invalidos += 1
      issues.push({ line, nome, telefone, status: 'invalido', motivo: 'Falta o nome.' })
      continue
    }
    if (nome.length > 80) {
      invalidos += 1
      issues.push({ line, nome, telefone, status: 'invalido', motivo: 'Nome longo demais.' })
      continue
    }
    const phone = normalizeBrazilPhone(telefone)
    if (!phone.ok) {
      invalidos += 1
      issues.push({ line, nome, telefone, status: 'invalido', motivo: phone.error })
      continue
    }
    if (seen.has(phone.e164)) {
      duplicados += 1
      issues.push({ line, nome, telefone: phone.e164, status: 'duplicado', motivo: 'Telefone repetido.' })
      continue
    }
    seen.add(phone.e164)
    accepted.push({ id: crypto.randomUUID(), nome, telefone: phone.e164 })
  }

  return { accepted, issues, vazios, invalidos, duplicados }
}

export function defaultMapping(rows: readonly string[][]): { header: boolean; nome: number; telefone: number } {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (width === 0) return { header: false, nome: 0, telefone: 0 }
  const header = Boolean(rows[0] && looksLikeHeader(rows[0]))
  const guess = header && rows[0] ? guessColumns(rows[0]) : sniffColumns(rows)
  let nome = guess.nome ?? 0
  let telefone = guess.telefone ?? (width > 1 ? 1 : 0)
  if (nome === telefone && width > 1) telefone = nome === 0 ? 1 : 0
  return {
    header,
    nome: Math.min(nome, width - 1),
    telefone: Math.min(Math.max(telefone, 0), width - 1),
  }
}

export function columnLetter(index: number): string {
  let value = index + 1
  let letters = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return letters
}

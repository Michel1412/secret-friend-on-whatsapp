import * as XLSX from 'xlsx'

export type WorkbookTable = {
  sheetNames: string[]
  sheets: Record<string, string[][]>
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return ''
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return String(Math.trunc(cell.v))
  return String(cell.w ?? cell.v ?? '').trim()
}

export function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const rows: string[][] = []
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = []
    let filled = false
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const text = cellText(sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })])
      if (text) filled = true
      row.push(text)
    }
    if (filled) rows.push(row)
  }
  return rows
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): WorkbookTable {
  const book = XLSX.read(data, { type: 'array' })
  const sheets: Record<string, string[][]> = {}
  for (const name of book.SheetNames) {
    sheets[name] = sheetToRows(book.Sheets[name] ?? {})
  }
  if (book.SheetNames.length === 0) throw new Error('A planilha não tem abas.')
  return { sheetNames: book.SheetNames, sheets }
}

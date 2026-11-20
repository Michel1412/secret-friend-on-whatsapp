import { useEffect, useId, useMemo, useState } from 'react'
import { parseBackup } from '../../shared/backup'
import {
  classifyImport,
  columnLetter,
  defaultMapping,
  parseDelimitedText,
} from '../../shared/import-table'
import { readWorkbook, type WorkbookTable } from '../../shared/sheet'
import type { ParticipantInput } from '../../shared/types'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'

const PREVIEW = 6
const MAX_PEOPLE = 200

type Loaded = {
  sheetNames: string[]
  sheet: string
  sheets: Record<string, string[][]>
  rows: string[][]
  header: boolean
  nomeCol: number
  telefoneCol: number
  extras?: { mensagem?: string; intervaloMs?: number }
}

type Props = {
  open: boolean
  existing: ParticipantInput[]
  onOpenChange: (open: boolean) => void
  onApply: (
    people: ParticipantInput[],
    mode: 'replace' | 'append',
    extras?: { mensagem?: string; intervaloMs?: number },
  ) => void
}

function loadRows(rows: string[][], extras?: Loaded['extras'], book?: WorkbookTable, sheet = ''): Loaded {
  const mapping = defaultMapping(rows)
  return {
    sheetNames: book?.sheetNames ?? [],
    sheet,
    sheets: book?.sheets ?? {},
    rows,
    header: mapping.header,
    nomeCol: mapping.nome,
    telefoneCol: mapping.telefone,
    extras,
  }
}

export function ImportDialog({ open, existing, onOpenChange, onApply }: Props) {
  const fileId = useId()
  const pasteId = useId()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [paste, setPaste] = useState('')
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoaded(null)
    setPaste('')
    setMode(existing.length > 0 ? 'append' : 'replace')
    setError(null)
  }, [open, existing.length])

  function fail(reason: unknown) {
    setLoaded(null)
    setError(reason instanceof Error ? reason.message : 'Não consegui ler essa lista.')
  }

  async function onFile(file: File) {
    setError(null)
    if (file.size > 5_000_000) {
      setError('Arquivo grande demais. O máximo é 5 MB.')
      return
    }
    try {
      const name = file.name.toLowerCase()
      if (name.endsWith('.xlsx')) {
        const book = readWorkbook(await file.arrayBuffer())
        const sheet = book.sheetNames[0] ?? ''
        const rows = book.sheets[sheet] ?? []
        if (rows.length === 0) throw new Error('A primeira aba está vazia.')
        setLoaded(loadRows(rows, undefined, book, sheet))
        return
      }
      const text = await file.text()
      if (name.endsWith('.json')) {
        const parsed = parseBackup(JSON.parse(text))
        setLoaded(
          loadRows(
            [['Nome', 'Telefone'], ...parsed.participantes.map((person) => [person.nome, person.telefone])],
            { mensagem: parsed.mensagem, intervaloMs: parsed.intervaloMs },
          ),
        )
        return
      }
      setLoaded(loadRows(parseDelimitedText(text)))
    } catch (reason) {
      fail(reason)
    }
  }

  function onPaste() {
    setError(null)
    try {
      setLoaded(loadRows(parseDelimitedText(paste)))
    } catch (reason) {
      fail(reason)
    }
  }

  function chooseSheet(name: string) {
    if (!loaded) return
    const rows = loaded.sheets[name] ?? []
    if (rows.length === 0) {
      setError('Essa aba está vazia.')
      return
    }
    setError(null)
    setLoaded(loadRows(rows, loaded.extras, { sheetNames: loaded.sheetNames, sheets: loaded.sheets }, name))
  }

  const classified = useMemo(() => {
    if (!loaded) return null
    return classifyImport(loaded.rows, {
      nomeCol: loaded.nomeCol,
      telefoneCol: loaded.telefoneCol,
      header: loaded.header,
      existingPhones: mode === 'append' ? existing.map((person) => person.telefone) : [],
    })
  }, [loaded, mode, existing])

  const width = loaded?.rows.reduce((max, row) => Math.max(max, row.length), 0) ?? 0
  const sameColumn = Boolean(loaded && loaded.nomeCol === loaded.telefoneCol)
  const tooMany = (classified?.accepted.length ?? 0) > MAX_PEOPLE
  const canImport = Boolean(classified && classified.accepted.length > 0 && !sameColumn && !tooMany)

  return (
    <Modal
      open={open}
      wide={Boolean(loaded)}
      onOpenChange={onOpenChange}
      title="Importar lista"
      description="CSV, Excel ou uma colagem da planilha. Escolha qual coluna é o nome e qual é o WhatsApp."
    >
      <div className="stack" style={{ gap: '0.8rem' }}>
        <div className="btn-row">
          <label className="btn btn-outline" htmlFor={fileId}>
            Escolher arquivo
            <input
              id={fileId}
              type="file"
              accept=".csv,.txt,.tsv,.xlsx,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void onFile(file)
              }}
            />
          </label>
        </div>
        <label className="lbl" htmlFor={pasteId}>
          Ou cole da planilha
          <textarea id={pasteId} className="area" value={paste} placeholder={'Nome\tTelefone\nMarina\t11988887777'} onChange={(event) => setPaste(event.target.value)} />
        </label>
        <div>
          <Button variant="outline" onClick={onPaste} disabled={!paste.trim()}>
            Ler colagem
          </Button>
        </div>

        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}

        {loaded && classified ? (
          <>
            {loaded.sheetNames.length > 1 ? (
              <label className="lbl">
                Aba
                <select className="field" value={loaded.sheet} onChange={(event) => chooseSheet(event.target.value)}>
                  {loaded.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="fields">
              <label className="lbl">
                Coluna do nome
                <select
                  className="field"
                  value={loaded.nomeCol}
                  onChange={(event) => setLoaded({ ...loaded, nomeCol: Number(event.target.value) })}
                >
                  {columnOptions(width, loaded)}
                </select>
              </label>
              <label className="lbl">
                Coluna do telefone
                <select
                  className="field"
                  value={loaded.telefoneCol}
                  onChange={(event) => setLoaded({ ...loaded, telefoneCol: Number(event.target.value) })}
                >
                  {columnOptions(width, loaded)}
                </select>
              </label>
            </div>
            <label className="small" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={loaded.header}
                onChange={(event) => setLoaded({ ...loaded, header: event.target.checked })}
              />
              Primeira linha é cabeçalho
            </label>
            {sameColumn ? (
              <p className="error-banner" role="alert">
                Nome e telefone precisam ser colunas diferentes.
              </p>
            ) : null}

            <div className="table-wrap preview-table">
              <table className="reveal">
                <thead>
                  <tr>
                    {Array.from({ length: width }, (_, index) => (
                      <th key={index} className={index === loaded.nomeCol || index === loaded.telefoneCol ? 'picked' : undefined}>
                        {columnLetter(index)}
                        {loaded.header && loaded.rows[0]?.[index] ? ` · ${loaded.rows[0][index]}` : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loaded.rows.slice(loaded.header ? 1 : 0, (loaded.header ? 1 : 0) + PREVIEW).map((row, index) => (
                    <tr key={index}>
                      {Array.from({ length: width }, (_, column) => (
                        <td key={column} className={column === loaded.nomeCol || column === loaded.telefoneCol ? 'picked' : undefined}>
                          {row[column] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small" style={{ margin: 0 }}>
              {classified.accepted.length} válidas · {classified.invalidos} inválidas · {classified.duplicados}{' '}
              repetidas · {classified.vazios} vazias ignoradas
              {loaded.rows.length > PREVIEW + (loaded.header ? 1 : 0) ? ' · prévia das primeiras linhas' : ''}
            </p>
            {classified.issues.length > 0 ? (
              <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {classified.issues.slice(0, PREVIEW).map((issue) => (
                  <li key={`${issue.line}-${issue.status}`}>
                    Linha {issue.line}: {issue.motivo}
                    {issue.nome ? ` (${issue.nome})` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {tooMany ? (
              <p className="error-banner" role="alert">
                Há mais de {MAX_PEOPLE} pessoas válidas. Divida a lista.
              </p>
            ) : null}

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 650, marginBottom: '0.35rem' }}>
                O que fazer com a lista atual
              </legend>
              <label className="small" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                Substituir a lista atual
              </label>
              <label className="small" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                <input type="radio" name="import-mode" checked={mode === 'append'} onChange={() => setMode('append')} />
                Acrescentar à lista atual
              </label>
            </fieldset>

            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!canImport}
                onClick={() => {
                  if (!classified || !canImport) return
                  onApply(classified.accepted, mode, loaded.extras)
                  onOpenChange(false)
                }}
              >
                Importar {classified.accepted.length}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}

function columnOptions(width: number, loaded: Loaded) {
  return Array.from({ length: width }, (_, index) => {
    const header = loaded.header ? loaded.rows[0]?.[index] : ''
    const label = header ? `${columnLetter(index)} — ${header}` : `Coluna ${columnLetter(index)}`
    return (
      <option key={index} value={index}>
        {label}
      </option>
    )
  })
}

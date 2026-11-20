import { FormEvent, useId, useState } from 'react'
import { LockKeyhole, Upload } from 'lucide-react'
import { formatBrazilPhone, normalizeBrazilPhone } from '../../shared/phone'
import type { ParticipantInput } from '../../shared/types'
import { ImportDialog } from './ImportDialog'
import { Button } from './ui/button'

type Props = {
  people: ParticipantInput[]
  message: string
  delay: number
  locked: boolean
  frozen: boolean
  onChange: (people: ParticipantInput[]) => void
  onImportExtras: (extras: { mensagem?: string; intervaloMs?: number }) => void
}

function initials(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('')
}

export function ParticipantsCard({
  people,
  message,
  delay,
  locked,
  frozen,
  onChange,
  onImportExtras,
}: Props) {
  const nameId = useId()
  const phoneId = useId()
  const [importOpen, setImportOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftNome, setDraftNome] = useState('')
  const [draftTelefone, setDraftTelefone] = useState('')
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const disabled = locked || frozen

  function add(event: FormEvent) {
    event.preventDefault()
    const phone = normalizeBrazilPhone(telefone)
    const cleanName = nome.trim()
    if (!cleanName) {
      setError('Diga o nome de quem vai participar.')
      return
    }
    if (!phone.ok) {
      setError(phone.error)
      return
    }
    if (people.some((person) => person.telefone === phone.e164)) {
      setError('Esse número já está na lista.')
      return
    }
    onChange([...people, { id: crypto.randomUUID(), nome: cleanName, telefone: phone.e164 }])
    setNome('')
    setTelefone('')
    setError(null)
  }

  function saveEdit(id: string) {
    const phone = normalizeBrazilPhone(draftTelefone)
    const cleanName = draftNome.trim()
    if (!cleanName) {
      setError('Diga o nome de quem vai participar.')
      return
    }
    if (!phone.ok) {
      setError(phone.error)
      return
    }
    if (people.some((person) => person.id !== id && person.telefone === phone.e164)) {
      setError('Esse número já está na lista.')
      return
    }
    onChange(people.map((person) => (person.id === id ? { ...person, nome: cleanName, telefone: phone.e164 } : person)))
    setEditing(null)
    setError(null)
  }

  function exportList() {
    const payload = {
      versao: 1,
      participantes: people,
      mensagem: message,
      intervaloMs: delay,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'participantes.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="card" aria-labelledby="titulo-participantes">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div>
          <p className="kicker">Passo 2</p>
          <h2 id="titulo-participantes">Participantes</h2>
        </div>
        <Button variant="outline" size="sm" onClick={exportList} disabled={people.length === 0}>
          Exportar lista
        </Button>
      </div>
      <p className="small muted">Nome e WhatsApp de quem entra no sorteio, inclusive você, se for participar.</p>

      {locked ? (
        <div className="lock-banner" role="note" style={{ marginTop: '0.8rem' }}>
          <LockKeyhole size={18} aria-hidden />
          <span>O cadastro abre só com um WhatsApp conectado. A lista que já estava salva continua aqui, só para leitura.</span>
        </div>
      ) : null}

      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: '0.9rem 0 0', minWidth: 0 }}>
        <form onSubmit={add} className="stack" style={{ gap: '0.7rem' }}>
          <div className="fields">
            <label className="lbl" htmlFor={nameId}>
              Nome
              <input id={nameId} className="field" value={nome} maxLength={80} placeholder="Ex.: Marina Alves" onChange={(event) => setNome(event.target.value)} />
            </label>
            <label className="lbl" htmlFor={phoneId}>
              Número de WhatsApp
              <input id={phoneId} className="field" inputMode="tel" autoComplete="tel" placeholder="(11) 98888-7777" value={telefone} onChange={(event) => setTelefone(event.target.value)} />
            </label>
          </div>
          <div className="btn-row">
            <Button type="submit">Adicionar pessoa</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={16} aria-hidden /> Importar lista
            </Button>
          </div>
        </form>

        {people.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Ninguém na lista ainda.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
            {people.map((person) => (
              <li key={person.id} className="person">
                <span className="avatar" aria-hidden>
                  {initials(person.nome)}
                </span>
                {editing === person.id ? (
                  <div className="stack" style={{ gap: '0.4rem' }}>
                    <input className="field" value={draftNome} aria-label={`Nome de ${person.nome}`} onChange={(event) => setDraftNome(event.target.value)} />
                    <input className="field" value={draftTelefone} aria-label={`WhatsApp de ${person.nome}`} onChange={(event) => setDraftTelefone(event.target.value)} />
                  </div>
                ) : (
                  <div>
                    <strong>{person.nome}</strong>
                    <span className="small muted">{formatBrazilPhone(person.telefone)}</span>
                  </div>
                )}
                <div className="person-actions">
                  {editing === person.id ? (
                    <>
                      <Button size="sm" onClick={() => saveEdit(person.id)}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(person.id)
                          setDraftNome(person.nome)
                          setDraftTelefone(formatBrazilPhone(person.telefone))
                          setPendingRemove(null)
                        }}
                      >
                        Editar
                      </Button>
                      {pendingRemove === person.id ? (
                        <Button
                          size="sm"
                          variant="seal"
                          onClick={() => {
                            onChange(people.filter((item) => item.id !== person.id))
                            setPendingRemove(null)
                          }}
                        >
                          Confirmar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setPendingRemove(person.id)}>
                          Remover
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {error ? (
        <p className="error-banner" role="alert" style={{ marginTop: '0.8rem' }}>
          {error}
        </p>
      ) : null}
      <ImportDialog
        open={importOpen && !disabled}
        existing={people}
        onOpenChange={setImportOpen}
        onApply={(imported, mode, extras) => {
          onChange(mode === 'append' ? [...people, ...imported] : imported)
          if (extras) onImportExtras(extras)
          setEditing(null)
          setError(null)
        }}
      />
      {!error && people.length > 0 ? (
        <p className="small muted" style={{ marginBottom: 0 }}>
          {people.length === 1 ? '1 pessoa na lista.' : `${people.length} pessoas na lista.`}
        </p>
      ) : null}
    </section>
  )
}

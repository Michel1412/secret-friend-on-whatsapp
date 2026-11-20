import { FormEvent, useEffect, useState } from 'react'
import { FRASE_QUEBRA_SIGILO } from '../../shared/sigilo'
import { PhraseField } from './PhraseField'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (frase: string) => Promise<void>
}

export function SigiloDialog({ open, onOpenChange, onConfirm }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setValue('')
    setError(null)
    setPasteHint(null)
    setPending(false)
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onConfirm(value)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'A frase não confere. O sigilo continua fechado.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Modal de proteção"
      description="A lista de quem tirou quem continua fechada até você digitar a frase. Colar não funciona neste campo."
    >
      <form onSubmit={submit} className="stack" style={{ gap: '0.75rem' }}>
        <p className="small" style={{ margin: 0 }}>
          Digite exatamente:
        </p>
        <p
          className="phrase-plate"
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          {FRASE_QUEBRA_SIGILO}
        </p>
        <label className="lbl">
          Frase de confirmação
          <PhraseField
            value={value}
            disabled={pending}
            onChange={setValue}
            onBlocked={() => setPasteHint('Não dá para colar. Digite a frase.')}
          />
        </label>
        {pasteHint ? <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>{pasteHint}</p> : null}
        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Maiúsculas e espaços a mais não importam. A frase errada não abre a lista.
          </p>
        )}
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="seal" type="submit" disabled={pending || value.trim().length === 0}>
            {pending ? 'Conferindo…' : 'Confirmar e revelar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

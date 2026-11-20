import { useId } from 'react'
import { templateHasVariable } from '../../shared/template'
import { Button } from './ui/button'

const PAUSES = [2000, 3000, 4000, 6000, 8000]

type Props = {
  message: string
  delay: number
  locked: boolean
  frozen: boolean
  peopleCount: number
  hasDraw: boolean
  onMessage: (value: string) => void
  onDelay: (value: number) => void
  onDraw: () => void
  onAskRedraw: () => void
}

export function MessageCard({
  message,
  delay,
  locked,
  frozen,
  peopleCount,
  hasDraw,
  onMessage,
  onDelay,
  onDraw,
  onAskRedraw,
}: Props) {
  const messageId = useId()
  const delayId = useId()
  const disabled = locked || frozen
  const ready = peopleCount >= 2 && templateHasVariable(message) && !disabled

  return (
    <section className="card" aria-labelledby="titulo-mensagem">
      <p className="kicker">Passo 3</p>
      <h2 id="titulo-mensagem">Mensagem e sorteio</h2>
      <p className="small muted">
        O nome de quem a pessoa tirou entra no lugar de <code>{'{{sorteado}}'}</code>. <code>{'{{amigo}}'}</code> também
        serve.
      </p>
      <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <label className="lbl" htmlFor={messageId} style={{ marginTop: '0.8rem' }}>
          Texto
          <textarea id={messageId} className="area" value={message} maxLength={1000} onChange={(event) => onMessage(event.target.value)} />
        </label>
        {!templateHasVariable(message) ? (
          <p className="small" style={{ color: 'var(--seal)' }}>
            Inclua {'{{sorteado}}'} ou {'{{amigo}}'} para o nome aparecer.
          </p>
        ) : null}
        <label className="lbl" htmlFor={delayId} style={{ marginTop: '0.8rem' }}>
          Pausa depois de cada pessoa
          <select
            id={delayId}
            className="field"
            value={delay}
            onChange={(event) => onDelay(Number(event.target.value))}
          >
            {PAUSES.map((pause) => (
              <option key={pause} value={pause}>
                {pause / 1000} segundos
              </option>
            ))}
          </select>
        </label>
        <p className="small muted">A pausa reduz a chance de o WhatsApp limitar o número. O padrão é 3 segundos.</p>
        {peopleCount < 2 ? <p className="small muted">É preciso pelo menos 2 pessoas para sortear.</p> : null}
        <div className="btn-row">
          <Button onClick={hasDraw ? onAskRedraw : onDraw} disabled={!ready}>
            {hasDraw ? 'Sortear de novo' : 'Sortear'}
          </Button>
        </div>
      </fieldset>
    </section>
  )
}

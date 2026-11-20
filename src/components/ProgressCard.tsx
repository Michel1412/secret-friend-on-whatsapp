import { formatBrazilPhone } from '../../shared/phone'
import type { HistoryEvent, PublicDraw, SendJobView, SendStatus } from '../../shared/types'
import { Button } from './ui/button'

const LABEL: Record<SendStatus, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  apagado: 'Apagado',
  erro: 'Erro',
}

type Props = {
  sorteio: PublicDraw | null
  envio: SendJobView
  connected: boolean
  mismatch: boolean
  verificado: boolean
  historico?: HistoryEvent[]
  onAskSend: () => void
  onAskSigilo: () => void
}

function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function ProgressCard({ sorteio, envio, connected, mismatch, verificado, historico = [], onAskSend, onAskSigilo }: Props) {
  if (!sorteio) {
    return (
      <section className="card" aria-labelledby="titulo-envio">
        <p className="kicker">Passo 4</p>
        <h2 id="titulo-envio">Envio e sigilo</h2>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Depois do sorteio, o andamento aparece aqui. A tela não mostra quem tirou quem.
        </p>
      </section>
    )
  }

  const counts = sorteio.participantes.reduce(
    (acc, person) => {
      acc[person.status] += 1
      if (person.manter) acc.manter += 1
      return acc
    },
    { pendente: 0, enviado: 0, apagado: 0, erro: 0, manter: 0 },
  )
  const unconfirmed = sorteio.participantes.filter((person) => person.status === 'enviado' && !person.manter).length
  const allDone = sorteio.participantes.every((person) => person.status === 'apagado' || person.manter)
  let sendLabel = 'Enviar via WhatsApp'
  if (envio.ativo) sendLabel = `Enviando ${envio.feitos} de ${envio.total}…`
  else if (counts.pendente === 0 && counts.erro === 0 && unconfirmed > 0) sendLabel = 'Tentar apagar de novo'
  else if (counts.apagado > 0 || counts.erro > 0 || counts.enviado > 0) sendLabel = 'Continuar envio'

  return (
    <section className="card" aria-labelledby="titulo-envio">
      <p className="kicker">Passo 4</p>
      <h2 id="titulo-envio">Envio e sigilo</h2>
      <p className="small muted">
        Sorteio guardado em {when(sorteio.criadoEm)}. Ele continua neste computador até você sortear de novo. O
        andamento diz só se a mensagem saiu — não quem foi sorteado.
      </p>
      <p className="small" role="status" style={{ marginTop: 0 }}>
        {counts.apagado} apagadas do seu WhatsApp · {unconfirmed} enviadas sem confirmação de apagar · {counts.manter}{' '}
        no próprio número · {counts.erro} com erro · {counts.pendente} pendentes
      </p>
      {mismatch ? (
        <p className="warn-banner" role="status">
          A lista mudou desde este sorteio. Sorteie de novo antes de enviar. A quebra de sigilo ainda abre o resultado
          guardado.
        </p>
      ) : null}
      {envio.erro ? (
        <p className="error-banner" role="alert">
          {envio.erro}
        </p>
      ) : null}
      {allDone ? (
        <p className="ok-banner">
          {counts.manter > 0
            ? 'Envio concluído. A mensagem do seu próprio número continua no seu WhatsApp. As outras saíram da sua conta.'
            : 'Envio concluído. As mensagens saíram do seu WhatsApp e continuam com quem recebeu.'}
        </p>
      ) : null}
      <div className="btn-row">
        <Button onClick={onAskSend} disabled={!connected || !verificado || mismatch || envio.ativo || allDone}>
          {sendLabel}
        </Button>
        <Button variant="outline" onClick={onAskSigilo}>
          Quebra de Sigilo
        </Button>
      </div>
      {!connected ? <p className="small muted">Conecte o WhatsApp de novo para enviar. A quebra de sigilo continua disponível.</p> : null}
      {connected && !verificado ? (
        <p className="small muted">O envio abre quando o WhatsApp estiver pronto (selo Verificado).</p>
      ) : null}
      <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
        {sorteio.participantes.map((person) => (
          <li key={person.id} className="progress-item">
            <div>
              <strong>{person.nome}</strong>
              <span className="small muted">{formatBrazilPhone(person.telefone)}</span>
              {person.detalhe ? <div className="small muted">{person.detalhe}</div> : null}
            </div>
            <span className={`tag ${person.manter ? 'proprio' : person.status}`}>
              {person.manter ? 'No seu número' : LABEL[person.status]}
            </span>
          </li>
        ))}
      </ul>
      {historico.length > 0 ? (
        <div className="table-wrap">
          <table className="reveal">
            <caption className="small muted">Histórico deste sorteio</caption>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Evento</th>
                <th>Destino</th>
                <th>Tentativa</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((event, index) => {
                const person = sorteio.participantes.find((item) => item.id === event.participantId)
                const stamp = event.confirmedAt || event.deletedAt || event.sentAt
                return (
                  <tr key={`${event.participantId}-${event.tentativa}-${event.tipo}-${index}`}>
                    <td>{person?.nome ?? 'Teste'}</td>
                    <td>{event.tipo}</td>
                    <td>{event.destino}</td>
                    <td>{event.tentativa}</td>
                    <td>{stamp ? when(stamp) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

import { FormEvent, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { formatBrazilPhone } from '../../shared/phone'
import type { WhatsAppSnapshot } from '../../shared/types'
import type { PassoApagar, TesteRegistro } from '../api'
import { Button } from './ui/button'

type Props = {
  wa: WhatsAppSnapshot | null
  onConnect: () => void
  onAskLogout: () => void
  busy: boolean
  testing: boolean
  verificado: boolean
  testSteps: PassoApagar[] | null
  codigoTeste: string | null
  testes: TesteRegistro[]
  onTest: (telefone: string) => void
}

function displayPhone(phone: string | null): string | null {
  if (!phone) return null
  return phone.startsWith('+55') ? formatBrazilPhone(phone) : phone
}

export function ConnectionCard({
  wa,
  onConnect,
  onAskLogout,
  busy,
  testing,
  verificado,
  testSteps,
  codigoTeste,
  testes,
  onTest,
}: Props) {
  const [testPhone, setTestPhone] = useState('')
  const status = wa?.status
  const connected = status === 'connected'
  const phone = displayPhone(wa?.phone ?? null)

  return (
    <section className="card connection" aria-labelledby="titulo-conexao">
      <p className="kicker">Passo 1</p>
      <h2 id="titulo-conexao">Conectar WhatsApp</h2>
      <p className="small muted">
        Este número envia o nome sorteado. Use um chip secundário: cliente não oficial pode ser bloqueado se
        mandar mensagem demais.
      </p>

      <div style={{ margin: '0.8rem 0' }}>
        {connected && verificado ? (
          <span className="pill ok">
            <i /> Verificado
          </span>
        ) : connected ? (
          <span className="pill wait">
            <i /> Aguardando WhatsApp
          </span>
        ) : status === 'qr' || status === 'connecting' ? (
          <span className="pill wait">
            <i /> {status === 'qr' ? 'Aguardando leitura' : 'Conectando'}
          </span>
        ) : (
          <span className="pill">
            <i /> Desconectado
          </span>
        )}
      </div>

      {connected ? (
        <div className="ok-banner">
          <Smartphone size={18} aria-hidden />
          <div>
            <strong>{phone ?? 'Número conectado'}</strong>
            {wa?.pushName ? <div className="small">{wa.pushName}</div> : null}
            <div className="small">A sessão fica salva neste computador.</div>
          </div>
        </div>
      ) : (
        <div className="qr-wrap">
          {wa?.qrDataUrl ? (
            <div className="qr-frame">
              <img src={wa.qrDataUrl} alt="QR Code para conectar o WhatsApp" width={232} height={232} />
            </div>
          ) : (
            <p className="small muted" role="status">
              {!wa ? 'Consultando a sessão…' : status === 'connecting' ? 'Preparando o QR…' : 'Clique em Gerar QR para conectar.'}
            </p>
          )}
          <ol className="small muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>No celular, abra o WhatsApp.</li>
            <li>Vá em Aparelhos conectados.</li>
            <li>Toque em Conectar um aparelho e leia o QR.</li>
          </ol>
        </div>
      )}

      {wa?.error ? (
        <p className="error-banner" role="alert" style={{ marginTop: '0.8rem' }}>
          {wa.error}
        </p>
      ) : null}

      <div className="btn-row" style={{ marginTop: '0.9rem' }}>
        {connected ? (
          <Button variant="outline" onClick={onAskLogout} disabled={busy}>
            Desconectar
          </Button>
        ) : (
          <Button onClick={onConnect} disabled={busy}>
            {wa?.qrDataUrl ? 'Atualizar QR' : 'Gerar QR'}
          </Button>
        )}
      </div>
      {connected && !verificado ? (
        <p className="warn-banner" style={{ marginTop: '0.8rem' }}>
          Aguardando o WhatsApp ficar pronto… Deixe o aplicativo aberto no celular até aparecer Verificado.
        </p>
      ) : null}
      {connected ? (
        <form
          style={{ marginTop: '0.9rem' }}
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            onTest(testPhone)
          }}
        >
          <label className="lbl">
            Testar apagar
            <input
              className="field"
              value={testPhone}
              placeholder="Vazio usa o seu número"
              onChange={(event) => setTestPhone(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={busy || testing || !verificado} style={{ marginTop: '0.5rem' }}>
            {testing ? 'Testando…' : 'Testar apagar'}
          </Button>
          {codigoTeste ? <p className="small">Código deste teste: {codigoTeste}</p> : null}
          {testSteps ? (
            <ol className="small" style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem' }}>
              {testSteps.map((step) => (
                <li key={step.passo}>
                  {step.ok ? 'ok' : 'falhou'} — {step.passo}: {step.detalhe}
                </li>
              ))}
            </ol>
          ) : null}
          {testes.length > 0 ? (
            <ul className="small" style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem' }}>
              {testes.map((teste) => (
                <li key={`${teste.em}-${teste.codigo}`}>
                  {new Date(teste.em).toLocaleString('pt-BR')} · #{teste.codigo} · {teste.destino} · envio{' '}
                  {teste.envioOk ? 'ok' : 'falhou'} · apagar {teste.apagadoOk ? 'ok' : 'não confirmado'}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : null}
    </section>
  )
}

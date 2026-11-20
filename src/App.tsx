import { useEffect, useState } from 'react'
import { impressaoDaLista } from '../shared/sigilo'
import type { HistoryEvent, ParticipantInput, PublicDraw, RevealedPair, SendJobView } from '../shared/types'
import {
  ApiError,
  connectWhatsApp,
  createDraw,
  getPerfil,
  getHistorico,
  getSession,
  getSorteio,
  getWhatsApp,
  login,
  logoutAccount,
  logoutWhatsApp,
  quebrarSigilo,
  savePerfil,
  startSend,
  testarApagar,
  type PassoApagar,
  type TesteRegistro,
  type WhatsAppView,
} from './api'
import { ConnectionCard } from './components/ConnectionCard'
import { GiftLogo } from './components/GiftLogo'
import { MessageCard } from './components/MessageCard'
import { ParticipantsCard } from './components/ParticipantsCard'
import { ProgressCard } from './components/ProgressCard'
import { RevealPanel } from './components/RevealPanel'
import { SigiloDialog } from './components/SigiloDialog'
import { Button } from './components/ui/button'
import { Modal } from './components/ui/dialog'
import { MENSAGEM_PADRAO } from '../shared/template'

type Reveal = { sorteioId: string; criadoEm: string; pares: RevealedPair[] }

function audience(names: string[]) {
  if (names.length <= 8) return names.join(', ')
  return `${names.slice(0, 8).join(', ')} e mais ${names.length - 8}`
}

export function App() {
  const [me, setMe] = useState<string | null | undefined>(undefined)
  const [profileReady, setProfileReady] = useState(false)
  const [people, setPeople] = useState<ParticipantInput[]>([])
  const [message, setMessage] = useState(MENSAGEM_PADRAO)
  const [delay, setDelay] = useState(3000)
  const [testSteps, setTestSteps] = useState<PassoApagar[] | null>(null)
  const [codigoTeste, setCodigoTeste] = useState<string | null>(null)
  const [testes, setTestes] = useState<TesteRegistro[]>([])
  const [testing, setTesting] = useState(false)
  const [wa, setWa] = useState<WhatsAppView | null>(null)
  const [sorteio, setSorteio] = useState<PublicDraw | null>(null)
  const [envio, setEnvio] = useState<SendJobView>({ ativo: false, feitos: 0, total: 0, erro: null })
  const [historico, setHistorico] = useState<HistoryEvent[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'draw' | 'logout' | 'connect' | null>(null)
  const [sigiloOpen, setSigiloOpen] = useState(false)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [confirmRedraw, setConfirmRedraw] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const connected = wa?.status === 'connected'
  const drawId = sorteio?.id ?? null

  useEffect(() => {
    let cancel = false
    void getSession()
      .then((session) => {
        if (!cancel) setMe(session.email)
      })
      .catch(() => {
        if (!cancel) setMe(null)
      })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!me) return
    let cancel = false
    setProfileReady(false)
    void getPerfil()
      .then((perfil) => {
        if (cancel) return
        setPeople(perfil.participantes)
        setMessage(perfil.mensagem)
        setDelay(perfil.intervaloMs)
        setProfileReady(true)
      })
      .catch((error) => {
        if (!cancel) setActionError(error instanceof ApiError ? error.message : 'Não consegui abrir o seu perfil.')
      })
    return () => {
      cancel = true
    }
  }, [me])

  useEffect(() => {
    if (!me || !profileReady) return
    const timer = setTimeout(() => {
      void savePerfil({ participantes: people, mensagem: message, intervaloMs: delay }).catch(() => undefined)
    }, 400)
    return () => clearTimeout(timer)
  }, [people, message, delay, me, profileReady])

  useEffect(() => {
    setReveal(null)
  }, [drawId])

  useEffect(() => {
    if (!me) return
    let cancel = false
    const pull = async () => {
      try {
        const [status, board] = await Promise.all([getWhatsApp(), getSorteio()])
        if (cancel) return
        setWa(status)
        setTestes(status.testes ?? [])
        setSorteio(board.sorteio)
        setEnvio(board.envio)
        const log = await getHistorico(board.sorteio?.id)
        if (!cancel) setHistorico(log.eventos)
        setServerError(null)
      } catch (error) {
        if (cancel) return
        if (error instanceof ApiError && error.status === 401) {
          setMe(null)
          return
        }
        setServerError('Não consegui falar com o servidor local. Se ele acabou de iniciar, espere um instante.')
      }
    }
    void pull()
    const timer = setInterval(pull, envio.ativo ? 800 : 1600)
    return () => {
      cancel = true
      clearInterval(timer)
    }
  }, [envio.ativo, me])

  async function draw() {
    setBusy('draw')
    setActionError(null)
    try {
      const next = await createDraw(people)
      setSorteio(next)
      setReveal(null)
      setConfirmRedraw(false)
      document.getElementById('titulo-envio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível sortear.')
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    setActionError(null)
    try {
      const result = await startSend(message, delay)
      setEnvio(result.envio)
      setSorteio(result.sorteio)
      setConfirmSend(false)
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível enviar.')
    }
  }

  async function logout() {
    setBusy('logout')
    setActionError(null)
    try {
      setWa(await logoutWhatsApp())
      setConfirmLogout(false)
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível desconectar.')
    } finally {
      setBusy(null)
    }
  }

  async function connect() {
    setBusy('connect')
    setActionError(null)
    try {
      setWa(await connectWhatsApp())
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível gerar o QR.')
    } finally {
      setBusy(null)
    }
  }

  async function leave() {
    await logoutAccount()
    setMe(null)
    setProfileReady(false)
    setPeople([])
    setSorteio(null)
    setReveal(null)
    setWa(null)
    setTestSteps(null)
  }

  async function runDeleteTest(telefone: string) {
    setTesting(true)
    setActionError(null)
    try {
      const result = await testarApagar(telefone)
      setTestSteps(result.passos)
      setCodigoTeste(result.codigo)
      setTestes(result.historico)
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'O teste de apagar falhou.')
    } finally {
      setTesting(false)
    }
  }

  const mismatch = Boolean(sorteio && impressaoDaLista(people) !== sorteio.impressao)
  const recipients =
    sorteio?.participantes.filter((person) => person.status !== 'apagado' && !person.manter).map((person) => person.nome) ??
    []

  if (me === undefined) {
    return (
      <div className="shell">
        <p className="small muted">Abrindo…</p>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="shell">
        <header className="header">
          <div className="brand">
            <GiftLogo />
            <h1>Papelzinho</h1>
          </div>
        </header>
        <form
          className="card"
          style={{ maxWidth: '28rem' }}
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            void login(String(data.get('email') ?? ''))
              .then((session) => setMe(session.email))
              .catch((error) => setActionError(error instanceof ApiError ? error.message : 'Não consegui entrar.'))
          }}
        >
          <p className="kicker">Entrar</p>
          <h2>Qual é o seu e-mail?</h2>
          <p className="small muted">
            Sem senha e sem confirmação. Serve só para separar a lista, o WhatsApp e o sorteio de cada pessoa neste
            computador.
          </p>
          <label className="lbl" htmlFor="email-login">
            E-mail
            <input id="email-login" className="field" name="email" type="email" autoComplete="username" required />
          </label>
          {actionError ? (
            <p className="error-banner" role="alert">
              {actionError}
            </p>
          ) : null}
          <Button type="submit" style={{ marginTop: '0.8rem' }}>
            Entrar
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <GiftLogo />
          <div>
            <h1>Papelzinho</h1>
            <p>Amigo secreto pelo WhatsApp. Cada pessoa recebe o nome que tirou, e a mensagem some do seu celular.</p>
          </div>
        </div>
        <div className="btn-row">
          <span className="small muted">{me}</span>
          <Button variant="outline" onClick={() => void leave()}>
            Sair
          </Button>
        </div>
      </header>

      {serverError ? (
        <p className="error-banner" role="alert" style={{ marginBottom: '1rem' }}>
          {serverError}
        </p>
      ) : null}
      {actionError ? (
        <p className="error-banner" role="alert" style={{ marginBottom: '1rem' }}>
          {actionError}
        </p>
      ) : null}

      <div className="layout">
        <ConnectionCard
          wa={wa}
          busy={busy !== null}
          testing={testing}
          verificado={Boolean(wa?.appStateReady)}
          testSteps={testSteps}
          codigoTeste={codigoTeste}
          testes={testes}
          onTest={(telefone) => void runDeleteTest(telefone)}
          onConnect={() => void connect()}
          onAskLogout={() => setConfirmLogout(true)}
        />
        <div className="stack work">
          <ParticipantsCard
            people={people}
            message={message}
            delay={delay}
            locked={!connected}
            frozen={envio.ativo || busy === 'draw'}
            onChange={setPeople}
            onImportExtras={(extras) => {
              if (extras.mensagem) setMessage(extras.mensagem)
              if (extras.intervaloMs) setDelay(extras.intervaloMs)
            }}
          />
          <MessageCard
            message={message}
            delay={delay}
            locked={!connected}
            frozen={envio.ativo || busy === 'draw'}
            peopleCount={people.length}
            hasDraw={Boolean(sorteio)}
            onMessage={setMessage}
            onDelay={setDelay}
            onDraw={() => void draw()}
            onAskRedraw={() => setConfirmRedraw(true)}
          />
          <ProgressCard
            sorteio={sorteio}
            envio={envio}
            connected={connected}
            verificado={Boolean(wa?.appStateReady)}
            mismatch={mismatch}
            historico={historico}
            onAskSend={() => setConfirmSend(true)}
            onAskSigilo={() => setSigiloOpen(true)}
          />
          {reveal ? (
            <RevealPanel
              sorteioId={reveal.sorteioId}
              criadoEm={reveal.criadoEm}
              pares={reveal.pares}
              onLock={() => setReveal(null)}
            />
          ) : null}
        </div>
      </div>

      <p className="footer">
        Papelzinho não usa a API oficial da Meta. “Apagar para mim” tira a mensagem da sua conta; quem recebeu continua
        vendo o nome. Não commite a pasta <code>data/</code>: ela guarda a sessão e o sorteio.
      </p>

      <SigiloDialog
        open={sigiloOpen}
        onOpenChange={setSigiloOpen}
        onConfirm={async (frase) => {
          const result = await quebrarSigilo(frase)
          setReveal(result)
          setSigiloOpen(false)
        }}
      />

      <Modal
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Enviar agora?"
        description={
          recipients.every((name) =>
            sorteio?.participantes.some((person) => person.nome === name && person.status === 'enviado'),
          ) && recipients.length > 0
            ? 'Essas mensagens já foram enviadas. Vou tentar só apagar do seu WhatsApp, sem mandar de novo.'
            : 'Cada mensagem leva só o nome que aquela pessoa tirou. Em seguida o Papelzinho pede para apagar a mensagem no seu WhatsApp. Quem recebeu continua com o texto. A lista não aparece nesta tela.'
        }
      >
        <p className="small">
          {recipients.length === 1
            ? `Pessoas neste passo: ${recipients[0]}.`
            : `Pessoas neste passo: ${recipients.length} — ${audience(recipients)}.`}
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={() => setConfirmSend(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void send()}>Enviar agora</Button>
        </div>
      </Modal>

      <Modal
        open={confirmRedraw}
        onOpenChange={setConfirmRedraw}
        title="Sortear de novo?"
        description="O resultado guardado será substituído. A quebra de sigilo passa a valer só para o sorteio novo. Mensagens já enviadas não mudam."
      >
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={() => setConfirmRedraw(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void draw()} disabled={busy === 'draw'}>
            {busy === 'draw' ? 'Sorteando…' : 'Sortear de novo'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Desconectar este WhatsApp?"
        description="A sessão deste número é apagada deste computador. O sorteio já guardado continua até você sortear de novo."
      >
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={() => setConfirmLogout(false)}>
            Cancelar
          </Button>
          <Button variant="seal" onClick={() => void logout()} disabled={busy === 'logout'}>
            {busy === 'logout' ? 'Desconectando…' : 'Desconectar'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import pino from 'pino'
import { emailAceito } from '../../shared/email.ts'
import { envioLiberado } from '../../shared/sync-gate.ts'
import { DrawError } from '../../shared/derangement.ts'
import { normalizeBrazilPhone } from '../../shared/phone.ts'
import { templateHasVariable } from '../../shared/template.ts'
import type { ParticipantInput } from '../../shared/types.ts'
import { clampSendDelay, config } from './config.ts'
import { montarSorteio, toPublicDraw, toReveal } from './draw-store.ts'
import { UserRegistry, type UserRuntime } from './registry.ts'

const logger = pino({ level: config.logLevel })
const registry = new UserRegistry(config.dataDir)
const COOKIE = 'secret-friend-on-whatsapp-email'

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next)
  }
}

function readCookie(header: string | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

function writeCookie(res: Response, email: string | null) {
  const base = `${COOKIE}=${email ? encodeURIComponent(email) : ''}; Path=/; HttpOnly; SameSite=Lax`
  res.setHeader('Set-Cookie', email ? `${base}; Max-Age=31536000` : `${base}; Max-Age=0`)
}

async function currentUser(req: Request): Promise<UserRuntime> {
  const email = emailAceito(readCookie(req.headers.cookie) ?? '')
  if (!email) throw new HttpError(401, 'Entre com um e-mail.')
  return registry.open(email)
}

function readParticipants(body: unknown): ParticipantInput[] {
  const list = (body as { participantes?: unknown } | null)?.participantes
  if (!Array.isArray(list)) throw new DrawError('Envie a lista de participantes.')
  if (list.length > 200) throw new DrawError('A lista passa de 200 pessoas.')
  return list.map((item) => {
    const person = item as Partial<ParticipantInput>
    const nome = String(person.nome ?? '').trim()
    if (!nome || nome.length > 80) throw new DrawError('Confira o nome de cada pessoa.')
    const phone = normalizeBrazilPhone(String(person.telefone ?? ''))
    if (!phone.ok) throw new DrawError(`${nome}: ${phone.error}`)
    const id = String(person.id ?? '').trim() || crypto.randomUUID()
    return { id, nome, telefone: phone.e164 }
  })
}

const app = express()
app.disable('x-powered-by')
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/sessao', (req, res) => {
  const email = emailAceito(readCookie(req.headers.cookie) ?? '')
  res.json({ email })
})

app.post(
  '/api/sessao',
  asyncRoute(async (req, res) => {
    const email = emailAceito(String((req.body as { email?: unknown } | null)?.email ?? ''))
    if (!email) throw new HttpError(400, 'Informe um e-mail.')
    await registry.open(email)
    writeCookie(res, email)
    res.json({ email })
  }),
)

app.delete(
  '/api/sessao',
  asyncRoute(async (req, res) => {
    const email = emailAceito(readCookie(req.headers.cookie) ?? '')
    if (email) await registry.release(email)
    writeCookie(res, null)
    res.json({ ok: true })
  }),
)

app.get(
  '/api/perfil',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    res.json(await user.profile.load())
  }),
)

app.put(
  '/api/perfil',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    const body = req.body as { participantes?: ParticipantInput[]; mensagem?: string; intervaloMs?: number }
    const saved = await user.profile.save({
      participantes: Array.isArray(body.participantes) ? body.participantes : [],
      mensagem: String(body.mensagem ?? ''),
      intervaloMs: Number(body.intervaloMs),
    })
    res.json(saved)
  }),
)

app.get(
  '/api/whatsapp',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    res.json({ ...user.whatsapp.snapshot, testes: await user.testes.load() })
  }),
)

app.post(
  '/api/whatsapp/connect',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    await user.whatsapp.connect(true)
    res.json(user.whatsapp.snapshot)
  }),
)

app.post(
  '/api/whatsapp/logout',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    if (user.sender.isRunning()) throw new HttpError(409, 'Espere o envio terminar para desconectar.')
    await user.whatsapp.logout()
    res.json(user.whatsapp.snapshot)
  }),
)

app.post(
  '/api/whatsapp/testar-apagar',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    if (user.whatsapp.snapshot.status !== 'connected') {
      throw new HttpError(409, 'Conecte um WhatsApp antes de testar.')
    }
    if (!envioLiberado(user.whatsapp.snapshot.appStateReady)) {
      throw new HttpError(409, 'Aguardando o WhatsApp ficar pronto. Deixe o aplicativo aberto no celular.')
    }
    const raw = String((req.body as { telefone?: unknown } | null)?.telefone ?? '').trim()
    let phone: string | null = null
    if (raw) {
      const parsed = normalizeBrazilPhone(raw)
      if (!parsed.ok) throw new HttpError(400, parsed.error)
      phone = parsed.e164
    }
    const result = await user.whatsapp.testarApagar(phone)
    const historico = await user.testes.add({
      codigo: result.codigo,
      destino: result.destino,
      em: new Date().toISOString(),
      envioOk: result.envioOk,
      apagadoOk: result.apagadoOk,
    })
    res.json({ ...result, historico })
  }),
)

app.get(
  '/api/sorteio',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    const draw = await user.draw.load()
    res.json({ sorteio: draw ? toPublicDraw(draw) : null, envio: user.sender.view() })
  }),
)

app.post(
  '/api/sorteio',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    if (user.whatsapp.snapshot.status !== 'connected') {
      throw new HttpError(409, 'Conecte um WhatsApp antes de sortear.')
    }
    if (user.sender.isRunning()) throw new HttpError(409, 'Espere o envio terminar antes de sortear de novo.')
    const draw = montarSorteio(readParticipants(req.body))
    await user.draw.save(draw)
    user.sigilo.reset()
    res.json({ sorteio: toPublicDraw(draw) })
  }),
)

app.post(
  '/api/sigilo',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    const draw = await user.draw.load()
    if (!draw) throw new HttpError(404, 'Não há sorteio guardado.')
    const result = user.sigilo.attempt(String((req.body as { frase?: unknown } | null)?.frase ?? ''))
    if (!result.ok) throw new HttpError(result.retryAfterMs ? 429 : 403, result.error)
    res.json({ sorteioId: draw.id, criadoEm: draw.criadoEm, pares: toReveal(draw) })
  }),
)

app.post(
  '/api/enviar',
  asyncRoute(async (req, res) => {
    const user = await currentUser(req)
    if (user.whatsapp.snapshot.status !== 'connected') {
      throw new HttpError(409, 'Conecte um WhatsApp antes de enviar.')
    }
    if (!envioLiberado(user.whatsapp.snapshot.appStateReady)) {
      throw new HttpError(409, 'Aguardando o WhatsApp ficar pronto. Deixe o aplicativo aberto no celular.')
    }
    if (user.sender.isRunning()) throw new HttpError(409, 'Já existe um envio em andamento.')
    const draw = await user.draw.load()
    if (!draw) throw new HttpError(404, 'Sorteie antes de enviar.')
    const mensagem = String((req.body as { mensagem?: unknown } | null)?.mensagem ?? '')
    if (!templateHasVariable(mensagem)) throw new HttpError(400, 'A mensagem precisa ter {{sorteado}} ou {{amigo}}.')
    if (mensagem.length > 1000) throw new HttpError(400, 'A mensagem está longa demais.')
    const intervaloMs = clampSendDelay((req.body as { intervaloMs?: unknown } | null)?.intervaloMs)
    user.sender.start(draw, mensagem, intervaloMs)
    res.status(202).json({ envio: user.sender.view(), sorteio: toPublicDraw(draw) })
  }),
)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Não encontrado.' })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  if (error instanceof DrawError || (error instanceof Error && error.message === 'Informe um e-mail.')) {
    res.status(400).json({ error: error.message })
    return
  }
  logger.error({ err: error instanceof Error ? error.message : 'erro' }, 'pedido falhou')
  res.status(500).json({ error: 'Erro interno.' })
})

app.listen(config.port, '0.0.0.0', () => {
  logger.info(`API em http://127.0.0.1:${config.port} — interface em http://127.0.0.1:${config.clientPort}`)
})

let encerrando: Promise<void> | null = null

function fecharSessoes(sinal: string): Promise<void> {
  if (encerrando) return encerrando
  encerrando = (async () => {
    logger.info({ sinal }, 'fechando navegadores do whatsapp')
    await registry.shutdown()
  })().catch((error: unknown) => {
    logger.warn({ message: error instanceof Error ? error.message : 'erro' }, 'falha ao fechar navegadores')
  })
  return encerrando
}

function pedirSaida(sinal: string) {
  const forcar = setTimeout(() => process.exit(0), 8_000)
  forcar.unref()
  void fecharSessoes(sinal).finally(() => process.exit(0))
}

process.once('SIGINT', () => pedirSaida('SIGINT'))
process.once('SIGTERM', () => pedirSaida('SIGTERM'))
process.once('beforeExit', () => {
  void fecharSessoes('beforeExit')
})

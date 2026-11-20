import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { emailAceito } from '../../shared/email.ts'
import { createSigiloGate } from '../../shared/sigilo.ts'
import { DrawStore } from './draw-store.ts'
import { ProfileStore } from './profile.ts'
import { Sender } from './sender.ts'
import { TestLog } from './test-log.ts'
import { WhatsAppSession } from './whatsapp.ts'

export type UserRuntime = {
  email: string
  slug: string
  dir: string
  profile: ProfileStore
  draw: DrawStore
  whatsapp: WhatsAppSession
  sender: Sender
  testes: TestLog
  sigilo: ReturnType<typeof createSigiloGate>
}

export function userSlug(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 32)
}

export type SessionFactory = (dataPath: string, clientId: string) => WhatsAppSession

export class UserRegistry {
  private readonly users = new Map<string, UserRuntime>()

  constructor(
    private readonly root: string,
    private readonly createSession: SessionFactory = (dataPath, clientId) => new WhatsAppSession(dataPath, clientId),
  ) {}

  pathFor(email: string): string {
    return path.join(this.root, 'users', userSlug(email))
  }

  async open(rawEmail: string): Promise<UserRuntime> {
    const email = emailAceito(rawEmail)
    if (!email) throw new Error('Informe um e-mail.')
    const slug = userSlug(email)
    const existing = this.users.get(slug)
    if (existing) return existing
    const dir = this.pathFor(email)
    await mkdir(path.join(dir, 'wwebjs'), { recursive: true })
    const profile = new ProfileStore(path.join(dir, 'perfil.json'), email)
    const draw = new DrawStore(path.join(dir, 'sorteio.json'))
    const whatsapp = this.createSession(path.join(dir, 'wwebjs'), slug)
    const sender = new Sender(draw, whatsapp)
    const testes = new TestLog(path.join(dir, 'testes.json'))
    const runtime: UserRuntime = {
      email,
      slug,
      dir,
      profile,
      draw,
      whatsapp,
      sender,
      testes,
      sigilo: createSigiloGate(),
    }
    this.users.set(slug, runtime)
    return runtime
  }

  async release(rawEmail: string): Promise<void> {
    const email = emailAceito(rawEmail)
    if (!email) return
    const runtime = this.users.get(userSlug(email))
    if (!runtime) return
    this.users.delete(runtime.slug)
    await runtime.whatsapp.destroy()
  }

  async shutdown(): Promise<void> {
    const open = [...this.users.values()]
    this.users.clear()
    await Promise.all(open.map((runtime) => runtime.whatsapp.destroy()))
  }
}

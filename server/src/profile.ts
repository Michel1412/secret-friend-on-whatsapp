import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MENSAGEM_PADRAO } from '../../shared/template.ts'
import { normalizeBrazilPhone } from '../../shared/phone.ts'
import type { ParticipantInput } from '../../shared/types.ts'

export type Profile = {
  email: string
  participantes: ParticipantInput[]
  mensagem: string
  intervaloMs: number
}

const PAUSES = new Set([2000, 3000, 4000, 6000, 8000])

export class ProfileStore {
  constructor(
    private readonly filePath: string,
    private readonly email: string,
  ) {}

  async load(): Promise<Profile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<Profile>
      return {
        email: this.email,
        participantes: Array.isArray(parsed.participantes) ? parsed.participantes : [],
        mensagem: typeof parsed.mensagem === 'string' && parsed.mensagem.trim() ? parsed.mensagem : MENSAGEM_PADRAO,
        intervaloMs: PAUSES.has(Number(parsed.intervaloMs)) ? Number(parsed.intervaloMs) : 3000,
      }
    } catch {
      return {
        email: this.email,
        participantes: [],
        mensagem: MENSAGEM_PADRAO,
        intervaloMs: 3000,
      }
    }
  }

  async save(input: { participantes: ParticipantInput[]; mensagem: string; intervaloMs: number }): Promise<Profile> {
    const participantes: ParticipantInput[] = []
    const seen = new Set<string>()
    for (const person of input.participantes) {
      const nome = String(person.nome ?? '').trim()
      const phone = normalizeBrazilPhone(String(person.telefone ?? ''))
      if (!nome || nome.length > 80 || !phone.ok || seen.has(phone.e164)) continue
      seen.add(phone.e164)
      participantes.push({
        id: String(person.id || crypto.randomUUID()),
        nome,
        telefone: phone.e164,
      })
    }
    const profile: Profile = {
      email: this.email,
      participantes: participantes.slice(0, 200),
      mensagem: input.mensagem.slice(0, 1000),
      intervaloMs: PAUSES.has(input.intervaloMs) ? input.intervaloMs : 3000,
    }
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, JSON.stringify(profile), 'utf8')
    await rename(temporary, this.filePath)
    return profile
  }
}

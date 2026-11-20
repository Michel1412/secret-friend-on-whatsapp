import { randomInt } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { drawDerangement, DrawError } from '../../shared/derangement.ts'
import { impressaoDaLista } from '../../shared/sigilo.ts'
import type { ParticipantInput, PublicDraw, RevealedPair, SendStatus } from '../../shared/types.ts'

export type StoredMessage = {
  remoteJid: string
  lid?: string | null
  id: string
  timestamp: number
}

export type StoredParticipant = {
  id: string
  nome: string
  telefone: string
  sorteadoId: string
  sorteadoNome: string
  sorteadoTelefone: string
  status: SendStatus
  detalhe: string | null
  mensagem: StoredMessage | null
  /** True when this participant is the connected WhatsApp number. */
  manter?: boolean
  tentativasApagar?: number
}

export type StoredDraw = {
  versao: 1
  id: string
  criadoEm: string
  impressao: string
  participantes: StoredParticipant[]
}

export function cryptoRng(): number {
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000
}

export function montarSorteio(
  people: readonly ParticipantInput[],
  rng: () => number = cryptoRng,
): StoredDraw {
  if (people.length > 200) throw new DrawError('A lista passa de 200 pessoas.')
  const phones = new Set<string>()
  for (const person of people) {
    const nome = person.nome.trim()
    if (!nome) throw new DrawError('Toda pessoa precisa de um nome.')
    if (!person.telefone.startsWith('+')) {
      throw new DrawError('Telefone precisa estar no formato internacional.')
    }
    if (phones.has(person.telefone)) throw new DrawError('Há telefones repetidos na lista.')
    phones.add(person.telefone)
  }

  const pairs = drawDerangement(people, rng)
  const byId = new Map(people.map((person) => [person.id, person]))
  const participantes: StoredParticipant[] = pairs.map((pair) => {
    const giver = byId.get(pair.giverId)
    const receiver = byId.get(pair.receiverId)
    if (!giver || !receiver) throw new DrawError('Não foi possível montar o sorteio.')
    return {
      id: giver.id,
      nome: giver.nome.trim(),
      telefone: giver.telefone,
      sorteadoId: receiver.id,
      sorteadoNome: receiver.nome.trim(),
      sorteadoTelefone: receiver.telefone,
      status: 'pendente',
      detalhe: null,
      mensagem: null,
    }
  })

  return {
    versao: 1,
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    impressao: impressaoDaLista(
      participantes.map((person) => ({
        id: person.id,
        nome: person.nome,
        telefone: person.telefone,
      })),
    ),
    participantes,
  }
}

export function toPublicDraw(draw: StoredDraw): PublicDraw {
  return {
    id: draw.id,
    criadoEm: draw.criadoEm,
    impressao: draw.impressao,
    participantes: draw.participantes.map((person) => ({
      id: person.id,
      nome: person.nome,
      telefone: person.telefone,
      status: person.status,
      detalhe: person.detalhe,
      manter: person.manter === true,
    })),
  }
}

export function toReveal(draw: StoredDraw): RevealedPair[] {
  return draw.participantes.map((person) => ({
    nome: person.nome,
    telefone: person.telefone,
    sorteado: person.sorteadoNome,
    telefoneSorteado: person.sorteadoTelefone,
  }))
}

export class DrawStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<StoredDraw | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as StoredDraw
      if (parsed?.versao !== 1 || !Array.isArray(parsed.participantes)) return null
      return parsed
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      return null
    }
  }

  async save(draw: StoredDraw): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, JSON.stringify(draw), 'utf8')
    await rename(temporary, this.filePath)
  }
}

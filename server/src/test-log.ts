import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type TesteRegistro = {
  codigo: string
  destino: string
  em: string
  envioOk: boolean
  apagadoOk: boolean
}

const LIMITE = 8

export class TestLog {
  constructor(private readonly filePath: string) {}

  async load(): Promise<TesteRegistro[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as TesteRegistro[]
      return Array.isArray(parsed) ? parsed.slice(0, LIMITE) : []
    } catch {
      return []
    }
  }

  async add(entry: TesteRegistro): Promise<TesteRegistro[]> {
    const next = [entry, ...(await this.load())].slice(0, LIMITE)
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, JSON.stringify(next), 'utf8')
    await rename(temporary, this.filePath)
    return next
  }
}

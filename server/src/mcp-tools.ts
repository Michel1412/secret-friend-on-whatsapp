import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { classifyImport, parseDelimitedText } from '../../shared/import-table.ts'
import { readWorkbook } from '../../shared/sheet.ts'
import type { HistoryEvent } from '../../shared/types.ts'
import type { PapelApi } from './mcp-api.ts'

type ToolResult = {
  content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[]
  isError?: boolean
}

function text(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function fail(error: unknown): ToolResult {
  return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Falhou.' }] }
}

async function requireVerified(api: PapelApi) {
  const status = await api.whatsapp()
  if (status.status !== 'connected' || !status.appStateReady) {
    throw new Error('O WhatsApp ainda não está Verificado. Deixe o aplicativo aberto no celular.')
  }
  return status
}

export function registerPapelTools(server: McpServer, api: PapelApi) {
  server.registerTool(
    'get_status',
    {
      description: 'Read the WhatsApp connection and whether the Verificado gate is open. Does not start the browser.',
      inputSchema: {},
    },
    async () => {
      try {
        const status = await api.whatsapp()
        const etapa = status.etapa ? ` Etapa: ${status.etapa}` : ''
        return text(
          `Conexão: ${status.status}. Verificado: ${status.appStateReady ? 'sim' : 'não'}. Número: ${status.phone ?? 'nenhum'}. ${status.error ?? ''}${etapa}`.trim(),
        )
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'get_qr_code',
    {
      description: 'Return the WhatsApp QR as an image and a data URL. Triggers Gerar QR when one is not already on screen.',
      inputSchema: {},
    },
    async () => {
      try {
        let status = await api.whatsapp()
        if (!status.qrDataUrl && status.status !== 'connected') status = await api.connect()
        for (let i = 0; i < 8 && !status.qrDataUrl && status.status === 'connecting' && !status.error; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          status = await api.whatsapp()
        }
        if (!status.qrDataUrl) {
          const etapa = status.etapa ? ` ${status.etapa}` : ''
          return text(`Não há QR agora.${etapa} Se o status for connected, o número já está pareado.`)
        }
        const match = /^data:(.+);base64,(.+)$/.exec(status.qrDataUrl)
        return {
          content: [
            { type: 'text', text: `QR pronto. Data URL: ${status.qrDataUrl}` },
            { type: 'image', data: match?.[2] ?? '', mimeType: match?.[1] ?? 'image/png' },
          ],
        }
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'test_send_and_delete',
    {
      description: 'Run the 8-digit Testar apagar flow. Refuses unless Verificado. Does not return message text.',
      inputSchema: { telefone: z.string().optional() },
    },
    async ({ telefone }) => {
      try {
        await requireVerified(api)
        const result = await api.testar(telefone)
        return text(
          `Teste ${result.codigo}. Destino ${result.destino}. Envio ${result.envioOk ? 'ok' : 'falhou'}. Apagar ${result.apagadoOk ? 'ok' : 'não confirmado'}.`,
        )
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'import_list',
    {
      description: 'Import participants from a CSV/XLSX file path or inline rows. Choose name and phone columns. Does not draw pairs.',
      inputSchema: {
        caminho: z.string().optional(),
        linhas: z.array(z.array(z.string())).optional(),
        nomeCol: z.number().int().nonnegative().default(0),
        telefoneCol: z.number().int().nonnegative().default(1),
        cabecalho: z.boolean().default(true),
        modo: z.enum(['substituir', 'acrescentar']).default('substituir'),
      },
    },
    async (args) => {
      try {
        const rows = args.linhas ?? (await rowsFromFile(args.caminho ?? ''))
        const classified = classifyImport(rows, {
          nomeCol: args.nomeCol,
          telefoneCol: args.telefoneCol,
          header: args.cabecalho,
        })
        const current = await api.perfil()
        const participantes =
          args.modo === 'acrescentar' ? [...current.participantes, ...classified.accepted] : classified.accepted
        await api.savePerfil({ participantes, mensagem: current.mensagem, intervaloMs: current.intervaloMs })
        return text(`Importadas ${classified.accepted.length} pessoas. Inválidas: ${classified.invalidos}.`)
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'export_list',
    {
      description: 'Export the participant list as CSV or XLSX. Never includes draw pairs.',
      inputSchema: { formato: z.enum(['csv', 'xlsx']).default('csv') },
    },
    async ({ formato }) => {
      try {
        const perfil = await api.perfil()
        const rows = [['Nome', 'Telefone'], ...perfil.participantes.map((person) => [person.nome, person.telefone])]
        if (formato === 'xlsx') {
          const book = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Lista')
          const data = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string
          return text(`Planilha sem pares, em base64:\n${data}`)
        }
        const csv = rows.map((row) => row.join(';')).join('\n')
        return text(csv)
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'draw',
    {
      description: 'Run the derangement for the saved participant list. Requires a connected WhatsApp. Does not print pairs.',
      inputSchema: {},
    },
    async () => {
      try {
        const perfil = await api.perfil()
        const result = await api.criarSorteio(perfil.participantes)
        return text(`Sorteio ${result.sorteio.id} guardado para ${result.sorteio.participantes.length} pessoas. Os pares não saem neste tool.`)
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'start_send',
    {
      description: 'Start sending the template. Refuses unless the Verificado gate is open.',
      inputSchema: {
        mensagem: z.string(),
        intervaloMs: z.number().int().default(3000),
      },
    },
    async ({ mensagem, intervaloMs }) => {
      try {
        await requireVerified(api)
        const result = await api.enviar(mensagem, intervaloMs)
        return text(`Envio iniciado: ${result.envio.feitos} de ${result.envio.total}.`)
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'resend',
    {
      description: 'Resend pending members, or only the given participant ids. Refuses unless Verificado. Skips rows already deleted for me.',
      inputSchema: { ids: z.array(z.string()).optional(), intervaloMs: z.number().int().default(3000) },
    },
    async ({ ids, intervaloMs }) => {
      try {
        await requireVerified(api)
        const board = await api.sorteio()
        if (!board.sorteio) throw new Error('Não há sorteio guardado.')
        const result = await api.enviar(board.sorteio ? await currentTemplate(api) : '', intervaloMs, ids)
        return text(`Reenvio iniciado: ${result.envio.feitos} de ${result.envio.total}.`)
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'get_members_status',
    {
      description: 'Status of every member right now, with timestamps taken from the send history. Does not reveal pairs.',
      inputSchema: {},
    },
    async () => {
      try {
        const board = await api.sorteio()
        if (!board.sorteio) return text('Não há sorteio guardado.')
        const log = await api.historico(board.sorteio.id)
        const lines = board.sorteio.participantes.map((person) => {
          const events = log.eventos.filter((event) => event.participantId === person.id)
          const last = events.at(-1)
          return {
            id: person.id,
            nome: person.nome,
            status: person.status,
            manter: person.manter,
            sentAt: last?.sentAt ?? null,
            confirmedAt: last?.confirmedAt ?? null,
            messageId: last?.messageId ?? null,
          }
        })
        return text(lines)
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'get_history',
    {
      description: 'Read the append-only send history. Optional draw id filter. No message text and no drawn names.',
      inputSchema: { sorteioId: z.string().optional() },
    },
    async ({ sorteioId }) => {
      try {
        const log = await api.historico(sorteioId)
        return text(log.eventos.map(publicEvent))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'break_secrecy',
    {
      description:
        'DESTRUCTIVE. Reveals who drew whom. Requires the exact phrase "quero quebrar o sigilo" as the argument. Uses the same lockout gate as the app (5 wrong tries, then 20 seconds). Confirm with the user before calling.',
      inputSchema: { frase: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ frase }) => {
      try {
        const result = await api.sigilo(frase)
        return text(result.pares)
      } catch (error) {
        return fail(error)
      }
    },
  )
}

async function currentTemplate(api: PapelApi) {
  const perfil = await api.perfil()
  return perfil.mensagem
}

async function rowsFromFile(caminho: string): Promise<string[][]> {
  if (!caminho) throw new Error('Informe um caminho ou linhas.')
  if (caminho.toLowerCase().endsWith('.xlsx')) {
    const bytes = await readFile(caminho)
    const book = readWorkbook(bytes)
    const name = book.sheetNames[0]
    if (!name) throw new Error('A planilha não tem abas.')
    return book.sheets[name] ?? []
  }
  return parseDelimitedText(await readFile(caminho, 'utf8'))
}

function publicEvent(event: HistoryEvent) {
  return {
    participantId: event.participantId,
    destino: event.destino,
    tipo: event.tipo,
    tentativa: event.tentativa,
    sentAt: event.sentAt,
    deletedAt: event.deletedAt,
    confirmedAt: event.confirmedAt,
    erro: event.erro,
    messageId: event.messageId,
    sorteioId: event.sorteioId,
  }
}

export function createPapelServer(api: PapelApi) {
  const server = new McpServer({ name: 'secret-friend-on-whatsapp', version: '1.0.0' })
  registerPapelTools(server, api)
  return server
}

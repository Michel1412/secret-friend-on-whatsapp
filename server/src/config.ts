import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
loadEnv({ path: path.join(root, '.env') })

function integer(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** Shown in WhatsApp → Aparelhos conectados (whatsapp-web.js deviceName / browserName). */
export const deviceName = 'Papelzinho - ZAP'
export const browserName = 'Chrome'

export const config = {
  root,
  port: integer('PORT', 38471, 1, 65535),
  clientPort: integer('CLIENT_PORT', 38472, 1, 65535),
  dataDir: path.resolve(root, process.env.DATA_DIR || 'data'),
  authDir: path.resolve(root, process.env.WHATSAPP_AUTH_DIR || 'data/auth'),
  drawFile: path.resolve(root, process.env.DRAW_FILE || 'data/sorteio.json'),
  sendDelayMs: integer('SEND_DELAY_MS', 3000, 2000, 15000),
  deleteDelayMs: integer('DELETE_FOR_ME_DELAY_MS', 1500, 500, 10000),
  ackTimeoutMs: integer('ACK_TIMEOUT_MS', 6000, 1000, 30000),
  deleteConfirmMs: integer('DELETE_CONFIRM_TIMEOUT_MS', 8000, 1000, 30000),
  logLevel: process.env.LOG_LEVEL || 'warn',
}

export function clampSendDelay(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return config.sendDelayMs
  return Math.min(15000, Math.max(2000, Math.round(parsed)))
}

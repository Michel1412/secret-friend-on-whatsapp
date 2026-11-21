import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { isRuntimePath, runtimeIgnoreGlobs } from './shared/runtime-ignore'

const VITE_FS_DENY = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', ...runtimeIgnoreGlobs('data')]

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '38471'
  const clientPort = Number(env.CLIENT_PORT || 38472)
  const dataDir = env.DATA_DIR || 'data'
  const ignoreGlobs = runtimeIgnoreGlobs(dataDir)
  const dataRoot = path.resolve(process.cwd(), dataDir)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Only the app entry. Without this, Vite globs every *.html, including Edge profile pages under data/.
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      host: '0.0.0.0',
      port: clientPort,
      strictPort: true,
      fs: {
        deny: VITE_FS_DENY,
      },
      watch: {
        ignored: [
          ...ignoreGlobs,
          (watched: string) => isRuntimePath(watched, dataRoot),
        ],
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})

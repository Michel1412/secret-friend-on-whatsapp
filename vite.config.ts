import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { isRuntimePath, runtimeFsDeny, runtimeIgnoreGlobs } from './shared/runtime-ignore'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const apiPort = env.PORT || '38471'
  const clientPort = Number(env.CLIENT_PORT || 38472)
  const dataDir = env.DATA_DIR || 'data'
  const ignoreGlobs = runtimeIgnoreGlobs(dataDir)
  const dataRoot = path.resolve(projectRoot, dataDir)

  return {
    root: projectRoot,
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
        // Anchored to the project root. runtimeIgnoreGlobs() is for the watcher
        // and includes dist/ and coverage/, which would also hide Vite's own client.
        deny: runtimeFsDeny(projectRoot, dataDir),
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

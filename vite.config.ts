import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '38471'
  const clientPort = Number(env.CLIENT_PORT || 38472)
  const dataDir = (env.DATA_DIR || 'data').replace(/\\/g, '/').replace(/^\.\/|\/$/g, '')
  const watchIgnored = ['**/data/**', '**/.wwebjs_auth/**', '**/.wwebjs_cache/**']
  if (dataDir && dataDir !== 'data' && !dataDir.includes(':')) {
    watchIgnored.push(`**/${dataDir}/**`)
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: clientPort,
      strictPort: true,
      watch: {
        ignored: watchIgnored,
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

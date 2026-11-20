import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['shared/**/*.ts', 'server/src/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'src/main.tsx', 'src/vite-env.d.ts'],
      thresholds: {
        lines: 85,
        branches: 74,
        'shared/**/*.ts': { lines: 90, branches: 78 },
        'server/src/**/*.ts': { lines: 90, branches: 75 },
        'src/**/*.{ts,tsx}': { lines: 80, branches: 68 },
      },
    },
  },
})

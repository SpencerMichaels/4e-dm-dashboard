import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@kit': resolve(__dirname, 'vendor/4e-kit/src'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@player': resolve(__dirname, 'src/player'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})

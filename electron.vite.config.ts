import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts')
      }
    },
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          player: resolve(__dirname, 'src/preload/player.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/',
    resolve: {
      alias: {
        '@common': resolve('src/common'),
        '@renderer': resolve('src/renderer'),
        '@player': resolve('src/player')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          player: resolve(__dirname, 'src/player/index.html')
        }
      }
    }
  }
})

import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // The MCP SDK is bundled: only the authoring CLI uses it, and the installed app ships no node_modules for it.
    plugins: [externalizeDepsPlugin({ exclude: ['@modelcontextprotocol/sdk'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // The authoring CLI and MCP server, run as `4e-dm-dashboard-mcp` (default.nix) with ELECTRON_RUN_AS_NODE.
          'authoring-cli': resolve(__dirname, 'tools/authoring/cli.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@common': resolve('src/common'),
        '@kit': resolve('vendor/4e-kit/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@common': resolve('src/common'),
        '@kit': resolve('vendor/4e-kit/src')
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
        '@kit': resolve('vendor/4e-kit/src'),
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

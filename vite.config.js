import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version)
  },
  plugins: [react()],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`
      }
    }
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // http-proxy only uses the origin from target (ignores any path).
        // The rewrite prepends the full Firebase emulator prefix so Express
        // inside the emulator receives the correct /api/* path.
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        rewrite: (path) => `/cold-email-agent-f50ea/us-central1/api${path}`,
      },
    },
  },
})



import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export function localViteServerConfig(env = {}) {
  return {
    host: env.MILLER_VITE_HOST || '127.0.0.1',
    port: Number(env.MILLER_VITE_PORT || 5173),
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false } },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: localViteServerConfig(env),
  }
})

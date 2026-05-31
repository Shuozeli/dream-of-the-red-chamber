import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const tailscaleIp = process.env.TAILSCALE_IP

// Dev defaults to `/` so localhost just works. Production builds default
// to `/hongloumeng/` (GitHub Pages subpath). Override via BASE_URL env var
// for root deploys or custom domains.
//
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base:
    process.env.BASE_URL ??
    (command === 'build' ? '/dream-of-the-red-chamber/' : '/'),
  server: {
    host: tailscaleIp || '0.0.0.0',
    port: 5173,
    // Personal tool on a private tailnet — skip Vite's Host-header allowlist.
    allowedHosts: true,
  },
  // duckdb-wasm needs its worker as a real Worker(); make sure Vite doesn't
  // try to bundle its WASM transitively (we load WASM via the official bundle).
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  worker: { format: 'es' },
}))

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Trust any hostname on the LAN (mini, mini.local, IP, etc). This is a
    // single-user, no-auth dev tool meant to be reached from other devices
    // on a home network; see README for the tradeoff.
    allowedHosts: true,
  },
})

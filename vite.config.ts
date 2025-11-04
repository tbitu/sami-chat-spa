import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow this specific external host (ngrok) to connect to the Vite dev server
    // See: https://vitejs.dev/config/server-options.html#server-allowedhosts
    allowedHosts: [
      'sturgeon-evolving-severely.ngrok-free.app',
    ],
  },
})

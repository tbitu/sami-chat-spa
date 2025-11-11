import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Use '/' during development (vite dev server) so the client doesn't ping /chat/
  // Preserve '/chat' as the production base so the app can be served under that path when built.
  base: command === 'serve' ? '/' : '/chat',
  plugins: [react()],
  server: {
    // Allow this specific external host (ngrok) to connect to the Vite dev server
    // See: https://vitejs.dev/config/server-options.html#server-allowedhosts
    allowedHosts: [
      'sturgeon-evolving-severely.ngrok-free.app',
    ],
  },
}))

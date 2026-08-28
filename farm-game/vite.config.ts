import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Tutti gli sprite sono piccoli illustrazioni di gioco: inlinarli come
    // base64 evita richieste separate e semplifica il deploy come pagina singola.
    assetsInlineLimit: 300 * 1024,
  },
})

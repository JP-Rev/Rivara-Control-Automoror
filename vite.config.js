import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo el front corre en el 5173 y la API en el 3010, asi que /api se
// redirige. En produccion no hay proxy: el mismo Express sirve las dos cosas.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3010', changeOrigin: true },
    },
  },
})

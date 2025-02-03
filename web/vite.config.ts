import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5556',
        changeOrigin: true,
      },
      '/img': {
        target: 'http://localhost:5556',
        changeOrigin: true,
      }
    }
  }
})

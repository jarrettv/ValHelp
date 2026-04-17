import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from './scripts/sitemap-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sitemapPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5556',
        changeOrigin: true,
      }
    }
  }
})

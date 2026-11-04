import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from './scripts/sitemap-plugin'
import { poiIconsPlugin } from './scripts/poi-icons-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sitemapPlugin(), poiIconsPlugin()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:5556',
        changeOrigin: true,
      }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

function eventPage() {
  const rewrite = (request, _response, next) => {
    const pathname = request.url?.split('?')[0]
    if (pathname === '/event' || pathname?.startsWith('/event/')) {
      request.url = '/admin/index.html'
    }
    next()
  }
  return {
    name: 'event-page',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  base: '/admin/',
  plugins: [eventPage(), react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
      },
    },
  },
  preview: {
    host: '0.0.0.0',
  },
})
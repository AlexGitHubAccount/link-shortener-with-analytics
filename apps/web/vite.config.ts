import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy API calls to backend during dev
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Remove `/api` prefix when forwarding to backend
        // e.g. /api/health → http://localhost:4000/health
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-router-dom',
      'zustand',
      'recharts',
    ],
  },
})

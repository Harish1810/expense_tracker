import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/extract': 'http://localhost:5000',
      '/sync': 'http://localhost:5000',
      '/check_status': 'http://localhost:5000',
      '/categories': 'http://localhost:5000',
      '/last_sync': 'http://localhost:5000',
    }
  }
})

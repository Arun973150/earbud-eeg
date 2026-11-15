import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the Express server (port 3000) provides the API and EEG files.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/eeg_data': 'http://localhost:3000',
    },
  },
})

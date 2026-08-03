import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the built demo also opens straight from the file system
  // or from a sub-path on static hosting (GitHub Pages, Netlify drop, etc.).
  base: './',
  server: { host: true, port: 5173 },
})

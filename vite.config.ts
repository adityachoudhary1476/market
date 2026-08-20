import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Phase 3B — strict env exposure: besides VITE_*, expose exactly ONE Finova
  // variable to the browser: FINOVA_ANALYST_API_URL (a public endpoint, not a
  // secret). Every FINOVA_LLM_* variable stays SERVER-ONLY by construction —
  // Vite will never inline it into client code because the prefix does not
  // match.
  envPrefix: ['VITE_', 'FINOVA_ANALYST_API_URL'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})

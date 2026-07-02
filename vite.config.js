import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Mock mode is ON by default. To use a real backend, set VITE_USE_MOCK=false
  // in .env and fill the VITE_FIREBASE_* values — no code changes needed.
  const useMock = env.VITE_USE_MOCK !== 'false'
  const r = (p) => fileURLToPath(new URL(p, import.meta.url))

  return {
    plugins: [react()],
    resolve: {
      alias: useMock
        ? {
            'firebase/app': r('./src/mock/firebase/app.js'),
            'firebase/firestore': r('./src/mock/firebase/firestore.js'),
            'firebase/auth': r('./src/mock/firebase/auth.js'),
            'firebase/storage': r('./src/mock/firebase/storage.js'),
          }
        : {},
    },
    server: {
      port: 3000,
      open: false,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
    },
  }
})

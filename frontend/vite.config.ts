import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // GitHub Pages serves the app from /<repo>/, so build with VITE_BASE=/AI-tools/.
    base: env.VITE_BASE || '/',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.VITE_API_TARGET || 'http://localhost:8080'
      }
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': env.VITE_API_TARGET || 'http://localhost:8080'
      }
    }
  };
});

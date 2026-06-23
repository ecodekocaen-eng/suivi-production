import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, le serveur Vite (port 5173) relaie les appels /api
// vers le backend Express. On reste ainsi en "même origine" : pas de souci
// de CORS, et le cookie JWT httpOnly fonctionne directement.
//
// Si votre backend tourne sur un autre port que 4000, définissez la variable
// d'environnement VITE_API_TARGET (ex : VITE_API_TARGET=http://localhost:4100).
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});

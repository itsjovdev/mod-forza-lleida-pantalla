import { defineConfig } from 'vite';

// El servidor de fotos del club no envia CORS, i WebGL no pot fer servir imatges d'un altre origen
// sense CORS. Les servim a través del mateix origen: aquí amb el proxy de Vite, a Vercel amb vercel.json.
const FZ_STORAGE = 'https://fzlleida.dev6.bigbangfood.es';

// base relativa: el build (dist/) funciona servit des de qualsevol ruta
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: { proxy: { '/fz-storage': { target: FZ_STORAGE, changeOrigin: true, rewrite: (p) => p.replace(/^\/fz-storage/, '/storage') } } },
  preview: { proxy: { '/fz-storage': { target: FZ_STORAGE, changeOrigin: true, rewrite: (p) => p.replace(/^\/fz-storage/, '/storage') } } },
});

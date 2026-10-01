import { defineConfig, loadEnv } from 'vite';

// En local, /api/acb fa el mateix que la funció de Vercel (api/acb.js): afegeix el token
// (ACB_TOKEN de .env.local) i reenvia a l'ACB Open API Live.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const acbProxy = {
    '/api/acb': {
      target: 'https://api2.acb.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api\/acb\//, '/api/v1/openapilive/'),
      headers: { Authorization: env.ACB_TOKEN ?? '' },
    },
  };
  return {
    base: './',
    build: { target: 'es2022' },
    server: { proxy: acbProxy },
    preview: { proxy: acbProxy },
  };
});

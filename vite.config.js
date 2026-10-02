import { defineConfig, loadEnv } from 'vite';
import { getScreenData } from './api/_lib/screen.js';

// En local, /api/screen fa el mateix que la funció de Vercel (api/screen.js),
// amb el token de .env.local (ACB_TOKEN).
function screenApi(token) {
  const handler = async (req, res) => {
    const q = new URL(req.url, 'http://x').searchParams;
    try {
      const data = await getScreenData({ token, match: q.get('match'), part: q.get('part') === 'final' ? 'final' : 'first' });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  };
  return {
    name: 'screen-api',
    configureServer(server) { server.middlewares.use('/api/screen', handler); },
    configurePreviewServer(server) { server.middlewares.use('/api/screen', handler); },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: '/',
    build: {
      target: 'es2022',
      // Dues pàgines: / (primer temps) i /final (final del partit)
      rollupOptions: { input: { main: 'index.html', final: 'final/index.html' } },
    },
    plugins: [screenApi(env.ACB_TOKEN)],
  };
});

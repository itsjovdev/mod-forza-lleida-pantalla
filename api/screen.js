// GET /api/screen[?match=105382] → { matchId, game, mvp } (JSON petit, en caché a la CDN de Vercel)
import { getScreenData } from './_lib/screen.js';

export default async function handler(req, res) {
  try {
    const data = await getScreenData({ token: process.env.ACB_TOKEN, match: req.query.match });
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    res.status(200).json(data);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: err.message });
  }
}

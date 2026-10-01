// Proxy de Vercel cap a l'ACB Open API Live: el token queda al servidor (variable ACB_TOKEN).
// /api/acb/Matches?idTeam=4465  ->  https://api2.acb.com/api/v1/openapilive/Matches?idTeam=4465
const BASE = 'https://api2.acb.com/api/v1/openapilive/';
const ALLOWED = new Set(['Matches', 'Matches/match', 'Boxscore/playermatchstatistics']);

export default async function handler(req, res) {
  const { p, ...query } = req.query;
  const path = Array.isArray(p) ? p.join('/') : p;
  if (!ALLOWED.has(path)) return res.status(404).json({ error: 'Not found' });
  if (!process.env.ACB_TOKEN) return res.status(500).json({ error: 'Falta ACB_TOKEN' });

  const upstream = await fetch(BASE + path + '?' + new URLSearchParams(query), {
    headers: { Authorization: process.env.ACB_TOKEN, accept: 'application/json' },
  });
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(upstream.status).send(await upstream.text());
}

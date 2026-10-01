// Lògica compartida (funció de Vercel api/screen.js i servidor de Vite en local):
// consulta l'ACB Open API Live i retorna només el que pinten les pantalles.
const BASE = 'https://api2.acb.com/api/v1/openapilive/';
export const TEAM_ID = 4465; // iLERNA Lleida
const PHOTO_BODY = (idLicense) =>
  `https://fzlleida.dev6.bigbangfood.es/storage/players/men/photo_body/${idLicense}.webp`;

const CACHE_MS = 8000;
const cache = new Map(); // memòria de la instància: evita repetir crides si arriben moltes peticions

async function acb(token, path, query) {
  const res = await fetch(BASE + path + '?' + new URLSearchParams(query), {
    headers: { Authorization: token, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ACB ${path}: HTTP ${res.status}`);
  return res.json();
}

function teamInfo(team) {
  const media = team?.media?.length ? team.media : team?.club?.media ?? [];
  const pick = (type) => media.find((m) => m.type === type)?.url;
  return { name: team?.team_actual_short_name ?? '', logo: pick('logo_negativo') ?? pick('logo') ?? null };
}

// Partit en directe; si no n'hi ha, l'últim finalitzat; si no, el proper.
function pickMatch(list) {
  const byDate = [...list].sort((a, b) => b.date - a.date);
  return (
    byDate.find((m) => m.live && !m.finalized) ??
    byDate.find((m) => m.finalized) ??
    [...byDate].reverse().find((m) => !m.finalized)
  );
}

function statusLabel(m) {
  if (m.finalized) return 'FINAL';
  if (!m.live) return 'PRÒXIM PARTIT';
  if (m.period === 2 && !m.crono) return 'MEDIA PARTE';
  if (m.period > 4) return 'PRÒRROGA';
  return `${m.period}r QUART`;
}

// MVP = jugador del Lleida amb més "val" (en cas d'empat, més punts)
function buildMvp(rows) {
  const players = rows.filter((r) => r.license && r.id_team === TEAM_ID);
  if (!players.length) return null;
  const best = players.reduce((a, b) => (b.val > a.val || (b.val === a.val && b.points > a.points) ? b : a));
  const [first, ...rest] = (best.license.licenseStr15 || best.license.licenseStr).trim().split(/\s+/);
  const made = best['2pt_success'] + best['3pt_success'];
  const tried = best['2pt_tried'] + best['3pt_tried'];
  return {
    first,
    last: rest.join(' '),
    val: best.val,
    pts: String(best.points),
    ast: String(best.asis),
    reb: String(best.total_rebound),
    fg: tried ? `${((made / tried) * 100).toFixed(1)}%` : '0%',
    photo: PHOTO_BODY(best.id_license),
    photoFallback: best.license.media?.find((m) => m.type === 'foto_cuerpo')?.url ?? null,
  };
}

export async function getScreenData({ token, match }) {
  if (!token) throw new Error('Falta ACB_TOKEN');
  const key = match || 'auto';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const list = await acb(token, 'Matches', { idTeam: TEAM_ID });
  const m = match ? list.find((x) => String(x.id) === String(match)) : pickMatch(list);
  if (!m) throw new Error("No s'ha trobat cap partit");

  const lleidaLocal = m.id_team_local === TEAM_ID;
  const rows = await acb(token, 'Boxscore/playermatchstatistics', {
    idCompetition: m.id_competition, idEdition: m.id_edition, idMatch: m.id, idTeam: TEAM_ID,
  });

  const data = {
    matchId: m.id,
    game: {
      label: statusLabel(m),
      lleida: teamInfo(lleidaLocal ? m.local_team : m.visitor_team),
      rival: teamInfo(lleidaLocal ? m.visitor_team : m.local_team),
      lleidaPts: lleidaLocal ? m.score_local : m.score_visitor,
      rivalPts: lleidaLocal ? m.score_visitor : m.score_local,
    },
    mvp: buildMvp(rows),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

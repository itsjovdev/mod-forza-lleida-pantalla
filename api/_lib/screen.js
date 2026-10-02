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

// Dia (a Lleida) d'una data en segons Unix
const day = (sec) => new Date(sec * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

// Quin partit es mostra: el que s'està jugant; si no, el d'avui (encara no començat
// o ja acabat); si no, l'últim acabat; si no, el proper.
function pickMatch(list) {
  const byDate = [...list].sort((a, b) => b.date - a.date);
  const today = day(Date.now() / 1000);
  return (
    byDate.find((m) => m.live && !m.finalized) ??
    byDate.find((m) => day(m.date) === today) ??
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

const STAT_KEYS = ['points', 'asis', 'total_rebound', 'val', '2pt_success', '2pt_tried', '3pt_success', '3pt_tried'];

// Suma les estadístiques de diversos períodes per jugador (p. ex. 1r + 2n quart = primer temps)
function sumPeriods(periodRows) {
  const byPlayer = new Map();
  for (const rows of periodRows) {
    for (const r of rows) {
      if (!r.license || r.id_team !== TEAM_ID) continue;
      const acc = byPlayer.get(r.id_license);
      if (!acc) { byPlayer.set(r.id_license, { ...r }); continue; }
      for (const k of STAT_KEYS) acc[k] = (acc[k] ?? 0) + (r[k] ?? 0);
    }
  }
  return [...byPlayer.values()];
}

// MVP = jugador del Lleida amb més "val" (en cas d'empat, més punts)
function buildMvp(players) {
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

// part = 'first' → només 1r i 2n quart (dades del descans, encara que el partit continuï)
// part = 'final' → partit sencer
export async function getScreenData({ token, match, part = 'first' }) {
  if (!token) throw new Error('Falta ACB_TOKEN');
  const key = `${part}:${match || 'auto'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const list = await acb(token, 'Matches', { idTeam: TEAM_ID });
  const m = match ? list.find((x) => String(x.id) === String(match)) : pickMatch(list);
  if (!m) throw new Error("No s'ha trobat cap partit");

  const lleidaLocal = m.id_team_local === TEAM_ID;
  const box = (period) => acb(token, 'Boxscore/playermatchstatistics', {
    idCompetition: m.id_competition, idEdition: m.id_edition, idMatch: m.id, idTeam: TEAM_ID,
    ...(period ? { period } : {}),
  });

  let lleidaPts = lleidaLocal ? m.score_local : m.score_visitor;
  let rivalPts = lleidaLocal ? m.score_visitor : m.score_local;
  let players;

  if (part === 'first') {
    // Estadístiques i marcador només dels quarts 1 i 2
    const [q1, q2, detail] = await Promise.all([box(1), box(2), acb(token, 'Matches/match', { idMatch: m.id })]);
    players = sumPeriods([q1, q2]);
    const quarters = (detail.period_marker ?? []).filter((q) => q.quarter <= 2);
    if (quarters.length) {
      const local = quarters.reduce((n, q) => n + q.local_points, 0);
      const visitor = quarters.reduce((n, q) => n + q.visitor_points, 0);
      lleidaPts = lleidaLocal ? local : visitor;
      rivalPts = lleidaLocal ? visitor : local;
    }
  } else {
    players = sumPeriods([await box()]);
  }

  const data = {
    matchId: m.id,
    part,
    status: statusLabel(m),
    game: {
      lleida: teamInfo(lleidaLocal ? m.local_team : m.visitor_team),
      rival: teamInfo(lleidaLocal ? m.visitor_team : m.local_team),
      lleidaPts: lleidaPts ?? 0,
      rivalPts: rivalPts ?? 0,
    },
    mvp: buildMvp(players),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

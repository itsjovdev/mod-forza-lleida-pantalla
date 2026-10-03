// Lògica compartida (funció de Vercel api/screen.js i servidor de Vite en local):
// consulta l'ACB Open API Live i retorna només el que pinten les pantalles.
const BASE = 'https://api2.acb.com/api/v1/openapilive/';
export const TEAM_ID = 4477; // PROVA TEMPORAL: Unicaja (Unicaja–CB Canarias). Tornar a 4465 (iLERNA Lleida) abans del directe
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
  return { name: team?.team_actual_short_name ?? '', logo: pick('logo') ?? pick('logo_negativo') ?? null }; // logo normal (amb colors); el negatiu només si no n'hi ha
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
  if (m.period === 2 && !m.crono) return 'DESCANS';
  if (m.period > 4) return 'PRÒRROGA';
  return `${m.period}r QUART`;
}

const STAT_KEYS = ['points', 'asis', 'total_rebound', 'val', '2pt_success', '2pt_tried', '3pt_success', '3pt_tried', '1pt_success', '1pt_tried'];

// Suma les estadístiques de diversos períodes per jugador (p. ex. 1r + 2n quart = primer temps)
function sumPeriods(periodRows, teamId) {
  const byPlayer = new Map();
  for (const rows of periodRows) {
    for (const r of rows) {
      if (!r.license || r.id_team !== teamId) continue;
      const acc = byPlayer.get(r.id_license);
      if (!acc) { byPlayer.set(r.id_license, { ...r }); continue; }
      for (const k of STAT_KEYS) acc[k] = (acc[k] ?? 0) + (r[k] ?? 0);
    }
  }
  return [...byPlayer.values()];
}

// Estadístiques d'equip (suma dels períodes demanats) → { lleida, rival } amb el que pinta la taula del marcador
const TEAM_KEYS = ['2pt_success', '2pt_tried', '3pt_success', '3pt_tried', '1pt_success', '1pt_tried',
  'total_rebound', 'offensive_rebound', 'defensive_rebound', 'asis'];

function buildTeamStats(periodRows, teamId) {
  const byTeam = new Map();
  for (const rows of periodRows) {
    for (const r of rows) {
      const acc = byTeam.get(r.id_team) ?? Object.fromEntries(TEAM_KEYS.map((k) => [k, 0]));
      for (const k of TEAM_KEYS) acc[k] += r[k] ?? 0;
      byTeam.set(r.id_team, acc);
    }
  }
  const shape = (a) => a && ({
    fg: [a['2pt_success'] + a['3pt_success'], a['2pt_tried'] + a['3pt_tried']],
    p2: [a['2pt_success'], a['2pt_tried']],
    p3: [a['3pt_success'], a['3pt_tried']],
    ft: [a['1pt_success'], a['1pt_tried']],
    reb: a.total_rebound, oreb: a.offensive_rebound, dreb: a.defensive_rebound, ast: a.asis,
  });
  const lleida = shape(byTeam.get(teamId));
  const rival = shape([...byTeam.entries()].find(([id]) => id !== teamId)?.[1]);
  return lleida && rival ? { lleida, rival } : null;
}

// MVP = jugador del Lleida amb més "val" (en cas d'empat, més punts)
function buildMvp(players, teamId) {
  if (!players.length) return null;
  const best = players.reduce((a, b) => (b.val > a.val || (b.val === a.val && b.points > a.points) ? b : a));
  const [first, ...rest] = (best.license.licenseStr15 || best.license.licenseStr).trim().split(/\s+/);
  const made = best['2pt_success'] + best['3pt_success'];
  const tried = best['2pt_tried'] + best['3pt_tried'];
  return {
    idLicense: best.id_license,
    fgMade: made,
    fgTried: tried,
    p2Made: best['2pt_success'],
    p2Tried: best['2pt_tried'],
    p3Made: best['3pt_success'],
    p3Tried: best['3pt_tried'],
    ftMade: best['1pt_success'],
    ftTried: best['1pt_tried'],
    first,
    last: rest.join(' '),
    val: best.val,
    pts: String(best.points),
    ast: String(best.asis),
    reb: String(best.total_rebound),
    fg: tried ? `${((made / tried) * 100).toFixed(1)}%` : '0%',
    // La foto de cos sencer del club (Lleida) només existeix per als seus jugadors; la resta, la foto de la ACB
    photo: teamId === TEAM_ID ? PHOTO_BODY(best.id_license) : (best.license.media?.find((m) => m.type === 'foto_cuerpo')?.url ?? PHOTO_BODY(best.id_license)),
    photoFallback: best.license.media?.find((m) => m.type === 'foto_cuerpo')?.url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mapa de tirs. PlayByPlay/shotsbreakdown dóna posX/posY en mm respecte a l'cèrcol
// (posX = distància a l'cèrcol, posY = lateral). Es passa a metres de pista (mitja pista
// 15 × 14 m, cèrcol a y = 1,575 m): x = 7,5 + posY/1000 · y = 1,575 + posX/1000.
// Tirs lliures i esmaixades (mate) venen a (0,0): no es poden dibuixar.
// ---------------------------------------------------------------------------
const FG_TYPES = { 93: [2, true], 94: [3, true], 97: [2, false], 98: [3, false] };
const COURT_W = 15;
const COURT_H = 14;
const HOOP_Y = 1.575;

// Zones ressaltables (en metres de pista). Només s'escull una si té mínim 3 intents.
const ZONES = {
  paint: { x0: 7.5 - 2.45, x1: 7.5 + 2.45, y0: 0, y1: 5.8 },
  corner_l: { x0: 7.5 - 7.5, x1: 7.5 - 6.6, y0: 0, y1: 2.99 },
  corner_r: { x0: 7.5 + 6.6, x1: 7.5 + 7.5, y0: 0, y1: 2.99 },
};
const inZone = (z, s) => s.x >= z.x0 && s.x <= z.x1 && s.y >= z.y0 && s.y <= z.y1;

function bestZone(shots) {
  let best = null;
  for (const [name, z] of Object.entries(ZONES)) {
    const inside = shots.filter((s) => inZone(z, s));
    const made = inside.filter((s) => s.made).length;
    if (inside.length < 3) continue;
    if (!best || made > best.made || (made === best.made && made / inside.length > best.made / best.tried)) {
      best = { zone: name, ...z, made, tried: inside.length };
    }
  }
  return best;
}

function buildShotMap(rows, mvp) {
  if (!mvp) return null;
  const mine = rows.filter((r) => r.id_license === mvp.idLicense && FG_TYPES[r.id_playbyplaytype]);
  const shots = mine
    .filter((r) => r.posX || r.posY)
    .map((r) => {
      const [pts, made] = FG_TYPES[r.id_playbyplaytype];
      return { x: +(7.5 + r.posY / 1000).toFixed(2), y: +(HOOP_Y + r.posX / 1000).toFixed(2), made, pts, period: r.period, crono: r.crono };
    })
    // Mitja pista del tir: es descarta qualsevol tir des de fora d'aquesta zona
    .filter((s) => s.x >= 0 && s.x <= COURT_W && s.y >= 0 && s.y <= COURT_H)
    // crono és el temps que queda del període → cronològic = període ↑, crono ↓
    .sort((a, b) => a.period - b.period || b.crono.localeCompare(a.crono));
  if (!shots.length) return null;
  return {
    dorsal: mine.find((r) => r.shirt_number)?.shirt_number ?? '',
    shots,
    hidden: mine.length - shots.length, // tirs sense coordenades (mates, etc.)
    zone: bestZone(shots),
  };
}

// part = 'first' → només 1r i 2n quart (dades del descans, encara que el partit continuï)
// part = 'final' → partit sencer
export async function getScreenData({ token, match, part = 'first', team }) {
  const teamId = Number(team) || TEAM_ID;
  if (!token) throw new Error('Falta ACB_TOKEN');
  const key = `${teamId}:${part}:${match || 'auto'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const list = await acb(token, 'Matches', { idTeam: teamId });
  const m = match ? list.find((x) => String(x.id) === String(match)) : pickMatch(list);
  if (!m) throw new Error("No s'ha trobat cap partit");

  const lleidaLocal = m.id_team_local === teamId;
  const box = (period) => acb(token, 'Boxscore/playermatchstatistics', {
    idCompetition: m.id_competition, idEdition: m.id_edition, idMatch: m.id, idTeam: teamId,
    ...(period ? { period } : {}),
  });

  let lleidaPts = lleidaLocal ? m.score_local : m.score_visitor;
  let rivalPts = lleidaLocal ? m.score_visitor : m.score_local;
  let players;
  let shotRows = [];
  let teamRows = [];
  const teamBox = (period) => acb(token, 'Boxscore/teammatchstatistics', {
    idCompetition: m.id_competition, idEdition: m.id_edition, idMatch: m.id, ...(period ? { period } : {}),
  }).catch(() => []);
  const shotsRows = (period) => acb(token, 'PlayByPlay/shotsbreakdown', { idMatch: m.id, ...(period ? { period } : {}) });

  if (part === 'first') {
    // Estadístiques i marcador només dels quarts 1 i 2
    const [q1, q2, detail, s1, s2, t1, t2] = await Promise.all([
      box(1), box(2), acb(token, 'Matches/match', { idMatch: m.id }),
      shotsRows(1).catch(() => []), shotsRows(2).catch(() => []),
      teamBox(1), teamBox(2),
    ]);
    shotRows = [...s1, ...s2];
    teamRows = [t1, t2];
    players = sumPeriods([q1, q2], teamId);
    const quarters = (detail.period_marker ?? []).filter((q) => q.quarter <= 2);
    if (quarters.length) {
      const local = quarters.reduce((n, q) => n + q.local_points, 0);
      const visitor = quarters.reduce((n, q) => n + q.visitor_points, 0);
      lleidaPts = lleidaLocal ? local : visitor;
      rivalPts = lleidaLocal ? visitor : local;
    }
  } else {
    const [all, team, shots] = await Promise.all([box(), teamBox(), shotsRows().catch(() => [])]);
    players = sumPeriods([all], teamId);
    teamRows = [team];
    shotRows = shots; // tot el partit
  }

  const mvp = buildMvp(players, teamId);
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
    mvp,
    teamStats: buildTeamStats(teamRows, teamId),
    shotmap: buildShotMap(shotRows, mvp),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

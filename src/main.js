// ---------------------------------------------------------------------------
// Cub LED Força Lleida · 4608 × 640 px · seqüència de 3 pantalles de 10 s:
//   1) Logo MOD (estàtic)   2) Marcador del partit   3) Jugador més valorat
// Dades: ACB Open API Live via /api/acb (proxy amb el token al servidor).
// ---------------------------------------------------------------------------
const W = 4608;
const H = 640;

const FACES = [
  { name: 'Cara B', x0: 256, w: 640 },
  { name: 'Cara C', x0: 1152, w: 1152 },
  { name: 'Cara D', x0: 2560, w: 640 },
  { name: 'Cara A', x0: 3456, w: 1152 },
];
const CORNERS = [0, 896, 2304, 3200]; // 256 px cadascuna

const TEAM_ID = 4465; // iLERNA Lleida
const PHOTO_BODY = (idLicense) =>
  `https://fzlleida.dev6.bigbangfood.es/storage/players/men/photo_body/${idLicense}.webp`;
const MOD_LOGO = import.meta.env.BASE_URL + 'logo_mod_white.svg';

// Paràmetres per URL: ?scene=1|2|3 (fixa una pantalla)  ?match=105382  ?label=MEDIA%20PARTE
//                     ?seconds=10 (durada de cada pantalla)  ?guides=1  ?refresh=20
const params = new URLSearchParams(location.search);
const PINNED = Number(params.get('scene')) || 0;
const SCENE_SECONDS = Number(params.get('seconds')) || 10;
const REFRESH_SECONDS = Number(params.get('refresh')) || 20;

const stage = document.getElementById('stage');
const scenes = ['scene-logo', 'scene-score', 'scene-mvp'].map((id) => document.getElementById(id));

// ---------------------------------------------------------------------------
// Utilitats
// ---------------------------------------------------------------------------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const { style, ...rest } = props;
  Object.assign(node, rest);
  if (style) Object.assign(node.style, style);
  for (const c of children) if (c != null) node.append(c);
  return node;
}
const px = (n) => `${n}px`;

function zone(cls, x, w) {
  return el('div', { className: cls, style: { left: px(x), width: px(w) } });
}

// Patró de quadrats determinista per a cada cantonada
function pixelPattern(seed, rows, density) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const grid = el('div', { className: 'pixels' });
  for (let i = 0; i < rows * 6; i++) grid.append(el('i', { className: rnd() < density ? 'on' : '' }));
  return grid;
}

function presentedBy() {
  return el('div', { className: 'presented' }, 'Presentat per:', el('img', { src: MOD_LOGO, alt: 'MOD' }));
}

// Redueix la mida de lletra fins que el text càpiga a l'amplada donada
function fitText(node, maxWidth, minSize = 20) {
  let size = parseFloat(node.style.fontSize);
  while (node.scrollWidth > maxWidth && size > minSize) {
    size -= 2;
    node.style.fontSize = px(size);
  }
}

// ---------------------------------------------------------------------------
// Escena 1: logo MOD a cada cara, quadrats a tota l'alçada de les cantonades
// ---------------------------------------------------------------------------
function renderLogoScene() {
  const root = scenes[0];
  root.replaceChildren();
  CORNERS.forEach((x, i) => {
    const c = zone('corner', x, 256);
    c.append(pixelPattern(i + 1, 15, 0.5));
    root.append(c);
  });
  for (const f of FACES) {
    const face = zone('face', f.x0, f.w);
    face.append(el('img', { src: MOD_LOGO, alt: 'MOD', style: { width: px(f.w === 640 ? 360 : 490) } }));
    root.append(face);
  }
}

// Cantonades de les escenes 2 i 3: quadrats a dalt + "Presentat per: MOD" a baix
function cornersWithSponsor(root) {
  CORNERS.forEach((x, i) => {
    const c = zone('corner', x, 256);
    c.append(pixelPattern(i + 11, 7, 0.5), presentedBy());
    root.append(c);
  });
}

// ---------------------------------------------------------------------------
// Escena 2: marcador
// ---------------------------------------------------------------------------
function renderScoreScene(game) {
  const root = scenes[1];
  root.replaceChildren();
  cornersWithSponsor(root);

  const lleidaFirst = { team: game?.lleida, pts: game?.lleidaPts };
  const rivalFirst = { team: game?.rival, pts: game?.rivalPts };
  const maxDigits = Math.max(String(game?.lleidaPts ?? 0).length, String(game?.rivalPts ?? 0).length);

  FACES.forEach((f, i) => {
    const short = f.w === 640;
    // Com al disseny: a les cares B i D primer Lleida, a C i A primer el rival
    const [left, right] = i % 2 === 0 ? [lleidaFirst, rivalFirst] : [rivalFirst, lleidaFirst];
    const logoSize = short ? 190 : 300;
    const margin = short ? 6 : 30;
    let fontSize = short ? 200 : 270;
    if (maxDigits >= 3) fontSize = Math.round(fontSize * 0.72); // marcadors de 3 xifres (100+)

    const face = zone('face score-face', f.x0, f.w);
    face.append(el('div', { className: 'label', textContent: game?.label ?? '' }));
    for (const [side, t] of [['left', left], ['right', right]]) {
      if (!t.team?.logo) continue;
      face.append(el('img', {
        className: 'team-logo', src: t.team.logo, alt: t.team.name,
        style: { width: px(logoSize), height: px(logoSize), [side]: px(margin) },
      }));
    }
    const pad = (n) => String(n ?? 0).padStart(2, '0');
    face.append(el('div', { className: 'row', style: { fontSize: px(fontSize) } },
      el('span', { className: 'pts', textContent: pad(left.pts) }),
      el('span', { className: 'vs' }, el('span', { textContent: 'v' })),
      el('span', { className: 'pts', textContent: pad(right.pts) }),
    ));
    root.append(face);
  });
}

// ---------------------------------------------------------------------------
// Escena 3: jugador més valorat (MVP = més "val" del Lleida)
// ---------------------------------------------------------------------------
function renderMvpScene(mvp) {
  const root = scenes[2];
  root.replaceChildren();
  cornersWithSponsor(root);
  if (!mvp) return;

  for (const f of FACES) {
    const short = f.w === 640;
    const face = zone(`face mvp-face ${short ? 'short' : 'long'}`, f.x0, f.w);
    const textLeft = short ? 30 : 60;
    const textMax = short ? 330 : 620;
    const nameSize = short ? 72 : 120;

    const first = el('div', { className: 'name', textContent: mvp.first, style: { fontSize: px(nameSize) } });
    const last = el('div', { className: 'name', textContent: mvp.last, style: { fontSize: px(nameSize), marginTop: '0' } });
    face.append(el('div', { className: 'text', style: { left: px(textLeft), width: px(textMax) } },
      el('div', { className: 'kicker', textContent: 'JUGADOR MÉS VALORAT', style: { fontSize: px(short ? 24 : 32) } }),
      first, last,
    ));

    const stats = el('div', { className: 'stats', style: { left: px(textLeft), bottom: px(short ? 30 : 40), fontSize: px(short ? 52 : 76) } });
    for (const [k, v] of [['PTS', mvp.pts], ['AST', mvp.ast], ['REB', mvp.reb], ['FG%', mvp.fg]]) {
      stats.append(el('div', { className: 'stat' }, el('div', { className: 'k', textContent: k }), el('div', { className: 'v', textContent: v })));
    }
    face.append(stats);

    const photoW = short ? 380 : 470;
    const photo = el('img', {
      className: 'photo', src: mvp.photo, alt: mvp.first + ' ' + mvp.last,
      style: { width: px(photoW), height: px(Math.round(photoW * 1964 / 1035)), right: px(short ? -30 : 40) },
    });
    if (mvp.photoFallback) photo.addEventListener('error', () => { photo.src = mvp.photoFallback; }, { once: true });
    face.append(photo);
    root.append(face);

    // Ajusta noms llargs (p. ex. SAINT-SUPERY) a l'amplada de la columna
    requestAnimationFrame(() => { fitText(first, textMax); fitText(last, textMax); });
  }
}

// ---------------------------------------------------------------------------
// Dades de l'API
// ---------------------------------------------------------------------------
async function api(path, query) {
  const res = await fetch(`/api/acb/${path}?${new URLSearchParams(query)}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function teamInfo(team) {
  const media = team?.media?.length ? team.media : team?.club?.media ?? [];
  const pick = (type) => media.find((m) => m.type === type)?.url;
  return { name: team?.team_actual_short_name ?? '', logo: pick('logo_negativo') ?? pick('logo') };
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

function buildMvp(rows) {
  const players = rows.filter((r) => r.license && r.id_team === TEAM_ID);
  if (!players.length) return null;
  const best = players.reduce((a, b) => (b.val > a.val || (b.val === a.val && b.points > a.points) ? b : a));
  const [first, ...rest] = (best.license.licenseStr15 || best.license.licenseStr).trim().split(/\s+/);
  const made = best['2pt_success'] + best['3pt_success'];
  const tried = best['2pt_tried'] + best['3pt_tried'];
  return {
    first, last: rest.join(' '),
    pts: String(best.points), ast: String(best.asis), reb: String(best.total_rebound),
    fg: tried ? `${(Math.round((made / tried) * 1000) / 10).toFixed(1)}%` : '0%',
    photo: PHOTO_BODY(best.id_license),
    photoFallback: best.license.media?.find((m) => m.type === 'foto_cuerpo')?.url,
  };
}

let lastKey = '';
async function refresh() {
  try {
    const list = await api('Matches', { idTeam: TEAM_ID });
    const m = params.get('match') ? list.find((x) => String(x.id) === params.get('match')) : pickMatch(list);
    if (!m) throw new Error('No s\'ha trobat cap partit');

    const lleidaLocal = m.id_team_local === TEAM_ID;
    const game = {
      label: params.get('label') ?? statusLabel(m),
      lleida: teamInfo(lleidaLocal ? m.local_team : m.visitor_team),
      rival: teamInfo(lleidaLocal ? m.visitor_team : m.local_team),
      lleidaPts: lleidaLocal ? m.score_local : m.score_visitor,
      rivalPts: lleidaLocal ? m.score_visitor : m.score_local,
    };
    const rows = await api('Boxscore/playermatchstatistics', {
      idCompetition: m.id_competition, idEdition: m.id_edition, idMatch: m.id, idTeam: TEAM_ID,
    });
    const mvp = buildMvp(rows);

    // Només es redibuixa si han canviat les dades
    const key = JSON.stringify([game, mvp]);
    if (key !== lastKey) {
      lastKey = key;
      renderScoreScene(game);
      renderMvpScene(mvp);
    }
  } catch (err) {
    console.error('[cub] Error carregant dades:', err);
  }
}

// ---------------------------------------------------------------------------
// Escala, guies i seqüència
// ---------------------------------------------------------------------------
function fit() { stage.style.transform = `scale(${window.innerWidth / W})`; }
window.addEventListener('resize', fit);
fit();

if (params.get('guides') === '1') {
  const g = document.getElementById('guides');
  g.classList.add('on');
  for (const { x, label } of [...CORNERS.map((x, i) => ({ x, label: `Cantonada ${i + 1}` })), ...FACES.map((f) => ({ x: f.x0, label: f.name }))]) {
    g.append(el('div', { textContent: `${label} · x=${x}`, style: { left: px(x) } }));
  }
}

function showScene(i) { scenes.forEach((s, k) => s.classList.toggle('on', k === i)); }

renderLogoScene();
renderScoreScene(null);
renderMvpScene(null);
document.fonts.ready.then(() => { lastKey = ''; refresh(); });
setInterval(refresh, REFRESH_SECONDS * 1000);

const start = performance.now();
function tick() {
  const i = PINNED ? PINNED - 1 : Math.floor((performance.now() - start) / 1000 / SCENE_SECONDS) % scenes.length;
  showScene(i);
}
tick();
setInterval(tick, 100);

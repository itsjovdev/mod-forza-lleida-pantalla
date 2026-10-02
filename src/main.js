import { buildShotsFace } from './shots.js';

// ---------------------------------------------------------------------------
// Cub LED Força Lleida · 4608 × 640 px · seqüència de pantalles de 10 s:
//   1) Logo MOD (estàtic)   2) Marcador   3) Jugador més valorat   4) Tirs del jugador més valorat (només a /)
// Dades: /api/screen (funció de Vercel que consulta l'ACB Open API Live amb el token al servidor).
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

const MOD_LOGO = import.meta.env.BASE_URL + 'logo_mod_white.svg';

// Paràmetres per URL: ?anim=1 (quadrats animats)  ?scene=1|2|3 (fixa una pantalla)  ?match=105382  ?team=4473 (proves amb un altre equip)  ?mirror=1 (mapa de tirs emmirallat)  ?label=MITJA%20PART (canvia el títol)
//                     ?seconds=10 (durada de cada pantalla)  ?guides=1  ?refresh=20
const params = new URLSearchParams(location.search);
const PINNED = Number(params.get('scene')) || 0;
const SCENE_SECONDS = Number(params.get('seconds')) || 10;
// Cada enllaç té el seu títol fix: /  → primer temps · /final → final del partit
const PART = document.body.dataset.part || 'first';
const HALF_LABEL = PART === 'final' ? 'FINAL' : 'PRIMER TEMPS';
const REFRESH_SECONDS = Number(params.get('refresh')) || 20;

const stage = document.getElementById('stage');
const scenes = ['scene-logo', 'scene-score', 'scene-mvp'].map((id) => document.getElementById(id));
// Pantalla de tirs del MVP (primer temps a /, partit sencer a /final), l'última de la seqüència
const shotsScene = document.getElementById('scene-shots');
const MIN_SHOTS = Number(params.get('minshots')) || 5; // amb menys tirs amb coordenades, la pantalla se salta
let shotsAnim = []; // update(t) de cada cara de la pantalla de tirs
// ?mirror=1 → mapa de tirs emmirallat (esquerra ↔ dreta), per si la convenció de posY de l'API fos la contrària
const MIRROR = params.get('mirror') === '1';
function mirrorShotmap(sm) {
  const flip = (x) => +(15 - x).toFixed(2);
  const swap = { corner_l: 'corner_r', corner_r: 'corner_l' };
  return {
    ...sm,
    shots: sm.shots.map((s) => ({ ...s, x: flip(s.x) })),
    zone: sm.zone && { ...sm.zone, zone: swap[sm.zone.zone] ?? sm.zone.zone, x0: flip(sm.zone.x1), x1: flip(sm.zone.x0) },
  };
}

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

// ---------------------------------------------------------------------------
// Quadrats de les cantonades: canvas de 256 px d'ample, 6 columnes de 42,67 px
// (= 128 px / 3, encaixa amb les columnes de 128 px del LED). Les vores
// s'arrodoneixen a píxel sencer perquè no apareguin línies entre quadrats.
// Per defecte estàtics; amb ?anim=1 cada quadrat s'encén i s'apaga amb un fos suau.
// ---------------------------------------------------------------------------
const COLS = 6;
const CELL = 256 / COLS;
const FADE = 0.6; // segons que dura l'encesa / apagada d'un quadrat
const ANIMATE = params.get('anim') === '1'; // per defecte estàtic
const edge = (i) => Math.round(i * CELL);
const corners = new Set();

function pixelPattern(seed, rows, density) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const canvas = el('canvas', { className: 'pixels', width: 256, height: edge(rows) });
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const on = rnd() < density;
      cells.push({
        x: edge(c), y: edge(r), w: edge(c + 1) - edge(c), h: edge(r + 1) - edge(r),
        on, v: on ? 1 : 0, next: 0.5 + rnd() * 4,
      });
    }
  }
  const p = { canvas, ctx: canvas.getContext('2d'), cells, density };
  corners.add(p);
  drawPixels(p);
  return canvas;
}

function drawPixels(p) {
  const { ctx, canvas, cells } = p;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (const c of cells) {
    if (c.v <= 0) continue;
    ctx.globalAlpha = c.v * c.v * (3 - 2 * c.v); // smoothstep: fos suau
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }
  ctx.globalAlpha = 1;
}

function updatePixels(p, dt) {
  for (const c of p.cells) {
    c.next -= dt;
    if (c.next <= 0) {
      c.on = Math.random() < p.density; // manté aproximadament la mateixa densitat
      c.next = 1.2 + Math.random() * 3.5;
    }
    const target = c.on ? 1 : 0;
    if (c.v !== target) c.v = c.on ? Math.min(1, c.v + dt / FADE) : Math.max(0, c.v - dt / FADE);
  }
}

let lastFrame = performance.now();
function animatePixels(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  for (const p of corners) {
    if (!p.canvas.isConnected) { corners.delete(p); continue; }
    if (!p.canvas.closest('.scene.on')) continue; // només es dibuixa la pantalla visible
    updatePixels(p, dt);
    drawPixels(p);
  }
  requestAnimationFrame(animatePixels);
}
if (ANIMATE) requestAnimationFrame(animatePixels);

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
// Taula d'estadístiques d'equip sota el marcador: Lleida | concepte | rival.
// En els comptadors (rebots, assistències) el valor més alt va en negreta.
// ---------------------------------------------------------------------------
const fmtShots = ([made, tried]) => `${made}/${tried} (${tried ? Math.round((made / tried) * 100) : 0}%)`;
const STAT_ROWS = [
  ['TIRS DE CAMP', 'fg', fmtShots],
  ['TIRS DE 2', 'p2', fmtShots],
  ['TIRS DE 3', 'p3', fmtShots],
  ['TIRS LLIURES', 'ft', fmtShots],
  ['REBOTS', 'reb'],
  ['REBOTS OFENSIUS', 'oreb'],
  ['REBOTS DEFENSIUS', 'dreb'],
  ['ASSISTÈNCIES', 'ast'],
];

function statsTable(stats, short) {
  const table = el('div', { className: `stats-table${short ? ' short' : ''}` });
  for (const [label, key, fmt] of STAT_ROWS) {
    const [a, b] = [stats.lleida[key], stats.rival[key]];
    const lead = fmt ? 0 : Math.sign(a - b); // negreta només als comptadors
    table.append(el('div', { className: 'stat-row' },
      el('span', { className: `l${lead > 0 ? ' best' : ''}`, textContent: fmt ? fmt(a) : String(a) }),
      el('span', { className: 'k', textContent: label }),
      el('span', { className: `r${lead < 0 ? ' best' : ''}`, textContent: fmt ? fmt(b) : String(b) }),
    ));
  }
  return table;
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

  FACES.forEach((f) => {
    const short = f.w === 640;
    // El cub és al pavelló del Lleida: a totes les cares primer Lleida (esquerra) i després el rival
    const [left, right] = [lleidaFirst, rivalFirst];
    const hasStats = !!game?.stats;
    // Amb la taula d'estadístiques, escuts i marcador pugen i es fan una mica més petits
    const logoSize = hasStats ? (short ? 120 : 180) : short ? 190 : 300;
    const margin = short ? 8 : 40;
    const centerY = hasStats ? (short ? 160 : 145) : 320;
    let fontSize = hasStats ? (short ? 120 : 170) : short ? 200 : 270;
    if (maxDigits >= 3) fontSize = Math.round(fontSize * 0.72); // marcadors de 3 xifres (100+)

    const face = zone('face score-face', f.x0, f.w);
    face.append(el('div', { className: 'label', textContent: game?.label ?? '' }));
    for (const [side, t] of [['left', left], ['right', right]]) {
      if (!t.team?.logo) continue;
      face.append(el('img', {
        className: 'team-logo', src: t.team.logo, alt: t.team.name,
        style: { width: px(logoSize), height: px(logoSize), top: px(centerY), [side]: px(margin) },
      }));
    }
    const pad = (n) => String(n ?? 0).padStart(2, '0');
    if (hasStats) face.append(statsTable(game.stats, short));
    face.append(el('div', { className: 'row', style: { fontSize: px(fontSize), top: px(centerY) } },
      el('span', { className: 'pts', textContent: pad(left.pts) }),
      el('span', { className: 'vs' }),
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
// Escena de tirs: MVP del primer temps. Cares llargues = pista, cares curtes = fitxa del jugador.
// ---------------------------------------------------------------------------
function renderShotsScene(mvp, shotmap) {
  if (!shotsScene) return;
  shotsScene.replaceChildren();
  shotsAnim = [];
  cornersWithSponsor(shotsScene);
  if (!mvp || !shotmap || shotmap.shots.length < MIN_SHOTS) return;
  for (const f of FACES) {
    const short = f.w === 640;
    const face = zone(`face shots-face ${short ? 'short' : 'long'}`, f.x0, f.w);
    const built = buildShotsFace(short, mvp, MIRROR ? mirrorShotmap(shotmap) : shotmap);
    face.append(built.node);
    shotsAnim.push(built.update);
    shotsScene.append(face);
  }
}

// ---------------------------------------------------------------------------
// Dades: una sola crida petita a /api/screen (el servidor parla amb l'ACB).
// Les últimes dades es guarden al navegador per pintar a l'instant en recarregar.
// ---------------------------------------------------------------------------
const STORE_KEY = `cub:screen:${PART}:${params.get('team') || 'default'}:` + (params.get('match') || 'auto');
let lastKey = '';

function preload(urls) {
  for (const u of urls) if (u) { const i = new Image(); i.decoding = 'async'; i.src = u; }
}

function apply(data) {
  const key = JSON.stringify(data);
  if (key === lastKey) return; // només es redibuixa si han canviat les dades
  lastKey = key;
  const game = { ...data.game, stats: data.teamStats, label: params.get('label') ?? HALF_LABEL };
  preload([game.lleida?.logo, game.rival?.logo, data.mvp?.photo]);
  renderScoreScene(game);
  renderMvpScene(data.mvp);
  renderShotsScene(data.mvp, data.shotmap);
}

async function refresh() {
  try {
    const q = new URLSearchParams({ part: PART });
    if (params.get('match')) q.set('match', params.get('match'));
    if (params.get('team')) q.set('team', params.get('team')); // proves amb un altre equip (per defecte, el Lleida)
    const res = await fetch('/api/screen?' + q);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    apply(data);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
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

// Seqüència: logo · marcador · MVP · [tirs del MVP, si n'hi ha prou]
function sequence() {
  return shotsScene && shotsAnim.length ? [...scenes, shotsScene] : [...scenes];
}
function showScene(on) { for (const s of [...scenes, shotsScene]) s?.classList.toggle('on', s === on); }

renderLogoScene();
renderScoreScene(null);
renderMvpScene(null);
renderShotsScene(null, null);
try { const cached = localStorage.getItem(STORE_KEY); if (cached) apply(JSON.parse(cached)); } catch {}
refresh();
setInterval(refresh, REFRESH_SECONDS * 1000);
// Quan arriben les fonts, reajusta els noms llargs
document.fonts.ready.then(() => { const d = lastKey; lastKey = ''; if (d) apply(JSON.parse(d)); });

const start = performance.now();
function tick() {
  const seq = sequence();
  const elapsed = (performance.now() - start) / 1000;
  const i = PINNED ? Math.min(PINNED, seq.length) - 1 : Math.floor(elapsed / SCENE_SECONDS) % seq.length;
  showScene(seq[i]);
  if (seq[i] === shotsScene) for (const update of shotsAnim) update(elapsed % SCENE_SECONDS);
}
tick();
setInterval(tick, 100);

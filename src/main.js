// ---------------------------------------------------------------------------
// Cub LED Força Lleida · 4608 × 640 px · seqüència de 3 pantalles de 10 s:
//   1) Logo MOD (estàtic)   2) Marcador del partit   3) Jugador més valorat
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

// Paràmetres per URL: ?anim=1 (quadrats animats)  ?scene=1|2|3 (fixa una pantalla)  ?match=105382  ?label=MEDIA%20PARTE
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
// Dades: una sola crida petita a /api/screen (el servidor parla amb l'ACB).
// Les últimes dades es guarden al navegador per pintar a l'instant en recarregar.
// ---------------------------------------------------------------------------
const STORE_KEY = 'cub:screen:' + (params.get('match') || 'auto');
let lastKey = '';

function preload(urls) {
  for (const u of urls) if (u) { const i = new Image(); i.decoding = 'async'; i.src = u; }
}

function apply(data) {
  const key = JSON.stringify(data);
  if (key === lastKey) return; // només es redibuixa si han canviat les dades
  lastKey = key;
  const game = { ...data.game, label: params.get('label') ?? data.game.label };
  preload([game.lleida?.logo, game.rival?.logo, data.mvp?.photo]);
  renderScoreScene(game);
  renderMvpScene(data.mvp);
}

async function refresh() {
  try {
    const q = params.get('match') ? `?match=${encodeURIComponent(params.get('match'))}` : '';
    const res = await fetch('/api/screen' + q);
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

function showScene(i) { scenes.forEach((s, k) => s.classList.toggle('on', k === i)); }

renderLogoScene();
renderScoreScene(null);
renderMvpScene(null);
try { const cached = localStorage.getItem(STORE_KEY); if (cached) apply(JSON.parse(cached)); } catch {}
refresh();
setInterval(refresh, REFRESH_SECONDS * 1000);
// Quan arriben les fonts, reajusta els noms llargs
document.fonts.ready.then(() => { const d = lastKey; lastKey = ''; if (d) apply(JSON.parse(d)); });

const start = performance.now();
function tick() {
  const i = PINNED ? PINNED - 1 : Math.floor((performance.now() - start) / 1000 / SCENE_SECONDS) % scenes.length;
  showScene(i);
}
tick();
setInterval(tick, 100);

// ---------------------------------------------------------------------------
// Pantalla "mapa de tirs" del jugador més valorat (MVP). Dibuixada en SVG, una per cara:
//  · cares llargues (1152 × 640): mitja pista amb tots els tirs + panell de dades
//  · cares curtes (640 × 640): fitxa del jugador (foto, 7/12, icones de tir, punts)
// Les coordenades dels tirs arriben ja en metres de pista (mitja pista de 15 × 14 m, cèrcol a y = 1,575).
// ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
// Només dos colors: blanc i el blau del fons del cub
const WHITE = '#fff';
const BLUE = '#12146b';
const LINE = 'rgba(255,255,255,0.5)';
const LABEL = 'rgba(255,255,255,0.7)';
const PAINT_FILL = 'rgba(255,255,255,0.08)';
const COURT_FILL = 'rgba(255,255,255,0.04)';
const FONT = "'Saira Extra Condensed', sans-serif";

// Temps (s) dins de la pantalla de 10 s
const T_FIRST = 0.9;     // apareix el primer tir
const T_STEP = 0.35;     // un tir cada 0,35 s
const T_SHOTS_MAX = 3.9; // l'entrada de tots els tirs no passa d'aquí
const T_ZONE = 5;        // s'encén la millor zona

const S = 42; // px per metre a la pista de les cares llargues
const COURT_W = 15;
const COURT_H = 14;
const HOOP_Y = 1.575;

function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of children) if (c != null) n.append(c);
  return n;
}

function text(str, attrs) {
  const t = svg('text', { 'font-family': FONT, ...attrs });
  t.textContent = str;
  return t;
}

const measureCtx = document.createElement('canvas').getContext('2d');
function textWidth(str, size, weight = 700) {
  measureCtx.font = `${weight} ${size}px ${FONT}`;
  return measureCtx.measureText(str).width;
}
// Mida de lletra màxima (fins a `size`) perquè el text càpiga a `maxWidth`
function fitSize(str, size, maxWidth, min = 24) {
  while (size > min && textWidth(str, size) > maxWidth) size -= 2;
  return size;
}

// Marca de tir: cercle (anotat) o aspa (fallat), centrada a (cx, cy)
function mark(shot, cx, cy, r, stroke) {
  if (shot.made) return svg('circle', { cx, cy, r, fill: WHITE });
  const d = r * 0.78;
  return svg('path', {
    d: `M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}`,
    stroke: WHITE, 'stroke-opacity': 0.65, 'stroke-width': stroke, 'stroke-linecap': 'round', fill: 'none',
  });
}

function courtLines() {
  const g = svg('g', { fill: 'none', stroke: LINE, 'stroke-width': 3 });
  const p = (x, y) => `${(x * S).toFixed(1)} ${(y * S).toFixed(1)}`;
  const arc = (r, x2, y2, large, sweep) => `A${r * S} ${r * S} 0 ${large} ${sweep} ${p(x2, y2)}`;
  g.append(
    svg('rect', { x: 0, y: 0, width: COURT_W * S, height: COURT_H * S }),
    svg('rect', { x: 5.05 * S, y: 0, width: 4.9 * S, height: 5.8 * S, fill: PAINT_FILL }),
    svg('path', { d: `M${p(5.7, 5.8)}${arc(1.8, 9.3, 5.8, 0, 0)}` }), // cercle de tir lliure (mitja volta cap a fora)
    svg('path', { d: `M${p(6.6, 1.2)}L${p(8.4, 1.2)}` }), // tauler
    svg('circle', { cx: 7.5 * S, cy: HOOP_Y * S, r: 0.225 * S }), // cèrcol
    svg('path', { d: `M${p(6.25, HOOP_Y)}${arc(1.25, 8.75, HOOP_Y, 0, 0)}` }), // zona de no-càrrega
    svg('path', { d: `M${p(0.9, 0)}L${p(0.9, 2.99)}${arc(6.75, 14.1, 2.99, 0, 0)}L${p(14.1, 0)}` }), // línia de 3
    svg('path', { d: `M${p(5.7, COURT_H)}${arc(1.8, 9.3, COURT_H, 0, 1)}` }), // mig cercle central
  );
  return g;
}

function fgLabel(fg, made, tried) {
  fg.replaceChildren(
    svg('tspan', { fill: WHITE }, document.createTextNode(String(made))),
    svg('tspan', { fill: '#fff' }, document.createTextNode(`/${tried}`)),
  );
}

// Panell de dades de la cara llarga (x/y en píxels de la cara)
function longPanel(mvp, sm) {
  const g = svg('g');
  g.append(svg('rect', { x: 726, y: 40, width: 80, height: 80, fill: WHITE }));
  g.append(text(String(sm.dorsal ?? ''), { x: 766, y: 40 + 40 + 56 * 0.35, 'text-anchor': 'middle', 'font-size': 56, 'font-weight': 700, fill: BLUE }));
  const name = mvp.last.toUpperCase();
  g.append(text(name, { x: 826, y: 108, 'font-size': fitSize(name, 72, 278, 56), 'font-weight': 700, fill: WHITE }));
  const fg = text('', { x: 726, y: 330, 'font-size': 140, 'font-weight': 700, fill: '#fff' });
  g.append(fg);
  g.append(text('ANOTADOS', { x: 726, y: 396, 'font-size': 48, 'font-weight': 500, fill: LABEL }));
  g.append(svg('rect', { x: 726, y: 424, width: 378, height: 4, fill: LINE }));
  const line = (num, lab, y) => {
    g.append(
      text(num, { x: 726, y, 'font-size': 72, 'font-weight': 700, fill: '#fff' }),
      text(lab, { x: 726 + textWidth(num, 72) + 16, y, 'font-size': 48, 'font-weight': 500, fill: LABEL }),
    );
  };
  line(mvp.pts, 'PUNTOS', 516);
  line(`${mvp.p3Made}/${mvp.p3Tried}`, 'TRIPLES', 604);
  return { g, fg };
}

// Cara llarga (1152 × 640): pista a l'esquerra + panell a la dreta
function buildLong(mvp, sm) {
  const root = svg('svg', { width: 1152, height: 640, viewBox: '0 0 1152 640' });
  const court = svg('g', { transform: 'translate(48 26)' });
  court.append(svg('rect', { x: 0, y: 0, width: COURT_W * S, height: COURT_H * S, fill: COURT_FILL }), courtLines());
  const marks = sm.shots.map((s) => {
    const m = mark(s, s.x * S, s.y * S, 9, 5);
    m.classList.add('shot');
    court.append(m);
    return m;
  });

  let zoneEl = null;
  if (sm.zone) {
    const z = sm.zone;
    zoneEl = svg('g', { class: 'zone' });
    zoneEl.append(svg('rect', {
      x: z.x0 * S, y: z.y0 * S, width: (z.x1 - z.x0) * S, height: (z.y1 - z.y0) * S,
      fill: WHITE, 'fill-opacity': 0.2, stroke: WHITE, 'stroke-width': 4,
    }));
    // Etiqueta just sota la zona, alineada amb la vora exterior dins la pista
    const right = z.zone === 'corner_r';
    zoneEl.append(text(`${z.made}/${z.tried}`, {
      x: right ? z.x1 * S : z.x0 * S, y: z.y1 * S + 56, 'text-anchor': right ? 'end' : 'start',
      'font-size': 56, 'font-weight': 700, fill: WHITE,
    }));
    court.append(zoneEl);
  }
  root.append(court);
  const { g, fg } = longPanel(mvp, sm);
  root.append(g);
  return { root, marks, zoneEl, fg };
}

// Cara curta (640 × 640): jugador i dades directament sobre el fons blau
function buildShort(mvp, sm) {
  const root = svg('svg', { width: 640, height: 640, viewBox: '0 0 640 640' });
  const photo = svg('image', {
    x: 20, y: 70, width: Math.round(540 * 1035 / 1964), height: 540,
    preserveAspectRatio: 'xMidYMax meet',
  });
  photo.setAttribute('href', mvp.photo);
  if (mvp.photoFallback) photo.addEventListener('error', () => photo.setAttribute('href', mvp.photoFallback), { once: true });
  root.append(photo);

  const X = 300; // columna de text
  root.append(svg('rect', { x: X, y: 62, width: 60, height: 60, fill: WHITE }));
  root.append(text(String(sm.dorsal ?? ''), { x: X + 30, y: 62 + 30 + 46 * 0.35, 'text-anchor': 'middle', 'font-size': 46, 'font-weight': 700, fill: BLUE }));
  const name = mvp.last.toUpperCase();
  root.append(text(name, { x: X + 72, y: 114, 'font-size': fitSize(name, 64, 590 - X - 72, 36), 'font-weight': 700, fill: WHITE }));
  const fg = text('', { x: X, y: 250, 'font-size': 124, 'font-weight': 700, fill: '#fff' });
  root.append(fg);

  // Icones de tir (6 per fila): mateixos símbols que a la pista
  const icons = sm.shots.slice(0, 18).map((s, i) => {
    const m = mark(s, X + 11 + (i % 6) * 46, 296 + Math.floor(i / 6) * 42, 9, 5);
    m.classList.add('shot');
    root.append(m);
    return m;
  });
  root.append(text(mvp.pts, { x: X, y: 530, 'font-size': 112, 'font-weight': 700, fill: '#fff' }));
  root.append(text('PUNTOS', { x: X, y: 584, 'font-size': 48, 'font-weight': 500, fill: LABEL }));
  return { root, marks: icons, zoneEl: null, fg };
}

// Construeix la pantalla d'una cara. update(t) fa l'animació segons els segons dins la pantalla.
export function buildShotsFace(short, mvp, sm) {
  const f = short ? buildShort(mvp, sm) : buildLong(mvp, sm);
  const n = sm.shots.length;
  const step = Math.min(T_STEP, T_SHOTS_MAX / Math.max(n, 1));
  let lastShown = -1;
  function update(t) {
    const shown = Math.max(0, Math.min(n, Math.floor((t - T_FIRST) / step) + 1));
    f.marks.forEach((m, i) => m.classList.toggle('in', i < shown));
    f.zoneEl?.classList.toggle('in', t >= Math.max(T_ZONE, T_FIRST + n * step + 0.4));
    if (shown === lastShown) return;
    lastShown = shown;
    // Els comptadors pugen amb cada tir; en acabar surt el total exacte del boxscore
    const done = shown >= n;
    fgLabel(f.fg, done ? mvp.fgMade : sm.shots.slice(0, shown).filter((s) => s.made).length, done ? mvp.fgTried : shown);
  }
  update(0);
  return { node: f.root, update };
}

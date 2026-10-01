import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Llenç del cub (fitxa tècnica): 4608 × 640 px @ 60 Hz, perímetre 360°.
// ---------------------------------------------------------------------------
const W = 4608;
const H = 640;

// Cares planes (coordenada X d'inici i amplada en px). Les cantonades no porten logo.
const FACES = [
  { name: 'Cara B', x0: 256, w: 640 },
  { name: 'Cara C', x0: 1152, w: 1152 },
  { name: 'Cara D', x0: 2560, w: 640 },
  { name: 'Cara A', x0: 3456, w: 1152 },
];
const CORNERS = [0, 896, 2304, 3200];

// Paràmetres per URL: ?theme=white  ?guides=1  ?loop=26  ?drops=70  ?t=8
const params = new URLSearchParams(location.search);
const THEME_NAME = params.get('theme') === 'white' ? 'white' : 'blue';
const LOOP = Number(params.get('loop')) || 26;
const DROPS = Number(params.get('drops')) || 70;
const FREEZE = params.has('t') ? Number(params.get('t')) : null; // ?t=8 congela un instant (proves)

const THEMES = {
  blue: {
    bg: 0x12146b,
    rain: [0x8a88ec, 0x8a88ec, 0x6f6ddc],
    head: 0xffffff,
    logo: 0xffffff,
    flash: 0x8a88ec,
    glint: 0x8a88ec,
  },
  white: {
    bg: 0xffffff,
    rain: [0x8a88ec, 0x8a88ec, 0x12146b],
    head: 0x12146b,
    logo: 0x12146b,
    flash: 0x8a88ec,
    glint: 0x8a88ec,
  },
};
const theme = THEMES[THEME_NAME];
const C = Object.fromEntries(
  Object.entries(theme).map(([k, v]) => [k, Array.isArray(v) ? v.map((h) => new THREE.Color(h)) : new THREE.Color(v)])
);

// Mida de "píxel" de l'animació (en px reals del LED).
const RAIN_CELL = 72;
const LOGO_CELL = 8;

// Línia de temps (segons dins del bucle)
const T_ASSEMBLE = 2.5; // comencen a caure els píxels del logo
const ASSEMBLE_SPREAD = 1.8; // retard màxim entre píxels
const FALL_DUR = 0.9;
const T_FORMED = T_ASSEMBLE + ASSEMBLE_SPREAD + FALL_DUR; // logo complet
const T_CRISP_IN = T_FORMED + 0.2; // fos cap al logo vectorial
const CRISP_FADE = 0.6;
const T_BREAK = 12; // el logo es desfà
// Jugador al centre de cada cara (revelat en mosaic de píxels)
const T_PLAYER_IN = 14.5;
const PLAYER_REVEAL = 1.2;
const T_PLAYER_OUT = LOOP - 3;
const MOSAIC_STEPS = [72, 36, 24, 12, 6, 3, 1];
const GRAVITY = 2400;

// PRNG determinista perquè l'animació sigui sempre igual
let seed = 1234567;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------
// Renderer: resolució nativa fixa, 1 px de llenç = 1 px del LED.
// ---------------------------------------------------------------------------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(C.bg);
stage.prepend(renderer.domElement);
document.body.style.background = '#' + C.bg.getHexString();

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);
// Treballem amb Y cap avall (com al mapa de píxels) i convertim aquí.
const Y = (yDown) => H - yDown;

const quad = new THREE.PlaneGeometry(1, 1);
const tmpColor = new THREE.Color();

function makeInstanced(count, z) {
  const mesh = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial(), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m.makeScale(0, 0, 1).setPosition(0, 0, z));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
function setCell(mesh, i, x, yDown, size, color) {
  const m = mesh.instanceMatrix.array;
  const o = i * 16;
  m[o] = size; m[o + 5] = size; m[o + 12] = x; m[o + 13] = Y(yDown);
  const c = mesh.instanceColor.array;
  c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b;
}
function hideCell(mesh, i) {
  const m = mesh.instanceMatrix.array;
  m[i * 16] = 0; m[i * 16 + 5] = 0;
}

// ---------------------------------------------------------------------------
// Pluja de píxels: quadrats de 72×72 que baixen a salts de cel·la
// (4608 / 72 = 64 columnes exactes, així la volta de 360° encaixa).
// ---------------------------------------------------------------------------
const ROWS = Math.ceil(H / RAIN_CELL);
const COLS = W / RAIN_CELL;
const SHAPES = [
  [[0, 0]],
  [[0, 0]],
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[1, 0], [0, 1], [2, 1], [1, 2]], // creu buida (com a la referència)
  [[0, 0], [1, 0], [0, 1]], // L
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [2, -1]],
];
const MAX_BLOCKS = 4;
const rainMesh = makeInstanced(DROPS * MAX_BLOCKS, 0);
const drops = [];
function resetDrop(d, initial) {
  d.shape = SHAPES[Math.floor(rand() * SHAPES.length)];
  d.col = Math.floor(rand() * COLS);
  d.row = initial ? Math.floor(rand() * (ROWS + 4)) - 3 : -3 - Math.floor(rand() * 6);
  d.step = 0.14 + rand() * 0.3; // segons per salt de cel·la
  d.acc = rand() * d.step;
  d.color = C.rain[Math.floor(rand() * C.rain.length)];
}
for (let i = 0; i < DROPS; i++) { const d = {}; resetDrop(d, true); drops.push(d); }

function updateRain(dt, intensity, waveX, waveAmt) {
  const size = RAIN_CELL;
  for (let i = 0; i < DROPS; i++) {
    const d = drops[i];
    d.acc += dt;
    while (d.acc >= d.step) { d.acc -= d.step; d.row++; }
    if (d.row > ROWS + 1) resetDrop(d, false);
    for (let k = 0; k < MAX_BLOCKS; k++) {
      const idx = i * MAX_BLOCKS + k;
      const off = d.shape[k];
      const row = off ? d.row + off[1] : -99;
      if (!off || row < 0 || row >= ROWS) { hideCell(rainMesh, idx); continue; }
      const col = (d.col + off[0]) % COLS;
      const x = col * RAIN_CELL + RAIN_CELL / 2;
      // Ona de llum que dona la volta completa al cub (x=4607 toca x=0)
      let boost = 0;
      if (waveAmt > 0) {
        let dx = Math.abs(x - waveX); dx = Math.min(dx, W - dx);
        boost = waveAmt * Math.exp(-(dx * dx) / (2 * 220 * 220));
      }
      tmpColor.copy(d.color).lerp(C.head, boost);
      tmpColor.lerpColors(C.bg, tmpColor, clamp01(intensity + boost));
      setCell(rainMesh, idx, x, row * RAIN_CELL + RAIN_CELL / 2, size, tmpColor);
    }
  }
  rainMesh.instanceMatrix.needsUpdate = true;
  rainMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Logo: es rasteritza l'SVG per a cada cara i es mostreja en cel·les.
// ---------------------------------------------------------------------------
async function loadLogo(color) {
  const url = import.meta.env.BASE_URL + 'logo_mod.svg';
  let svg = await (await fetch(url)).text();
  svg = svg.replace(/fill="#001C75"/gi, `fill="#${color.getHexString()}"`);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  return img;
}

const LOGO_ASPECT = 204 / 64;
function logoBox(face) {
  const w = Math.round(Math.min(face.w * 0.82, H * 0.46 * LOGO_ASPECT));
  const h = Math.round(w / LOGO_ASPECT);
  const cx = face.x0 + face.w / 2;
  return { w, h, x: Math.round(cx - w / 2), y: Math.round(H / 2 - h / 2) };
}

function rasterize(img, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return cv;
}

const crispMat = (tex) => new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  uniforms: {
    map: { value: tex },
    color: { value: new THREE.Color('#' + C.logo.getHexString()).convertLinearToSRGB() },
    glint: { value: C.glint.clone().convertLinearToSRGB() },
    opacity: { value: 0 },
    sweep: { value: -1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map; uniform vec3 color; uniform vec3 glint;
    uniform float opacity; uniform float sweep;
    varying vec2 vUv;
    void main() {
      float a = texture2D(map, vUv).a;
      float d = vUv.x + (vUv.y - 0.5) * 0.35 - sweep;
      float band = exp(-d * d * 120.0);
      gl_FragColor = vec4(mix(color, glint, band * 0.85), a * opacity);
    }`,
});

const logoCells = []; // { tx, ty, x0, y0, delay, fallDelay, vx }
const crispMeshes = [];
let logoMesh = null;

async function buildLogo() {
  const img = await loadLogo(C.logo);
  for (const face of FACES) {
    const box = logoBox(face);
    const cv = rasterize(img, box.w, box.h);
    const data = cv.getContext('2d').getImageData(0, 0, box.w, box.h).data;
    const alphaAt = (x, y) => {
      x = Math.min(box.w - 1, Math.max(0, Math.round(x)));
      y = Math.min(box.h - 1, Math.max(0, Math.round(y)));
      return data[(y * box.w + x) * 4 + 3] / 255;
    };
    // Graella global alineada a LOGO_CELL perquè totes les cares coincideixin
    const gx0 = Math.floor(box.x / LOGO_CELL), gx1 = Math.ceil((box.x + box.w) / LOGO_CELL);
    const gy0 = Math.floor(box.y / LOGO_CELL), gy1 = Math.ceil((box.y + box.h) / LOGO_CELL);
    for (let gy = gy0; gy < gy1; gy++) {
      for (let gx = gx0; gx < gx1; gx++) {
        const cx = gx * LOGO_CELL + LOGO_CELL / 2, cy = gy * LOGO_CELL + LOGO_CELL / 2;
        let cov = 0;
        for (let sy = -1; sy <= 1; sy++)
          for (let sx = -1; sx <= 1; sx++)
            cov += alphaAt(cx - box.x + sx * LOGO_CELL / 3, cy - box.y + sy * LOGO_CELL / 3);
        if (cov / 9 < 0.4) continue;
        const u = (cx - box.x) / box.w;
        logoCells.push({
          tx: cx, ty: cy,
          y0: -20 - rand() * 260,
          delay: u * 0.6 + rand() * (ASSEMBLE_SPREAD - 0.6),
          fallDelay: rand() * 0.9 + (1 - cy / H) * 0.5,
          vx: (rand() - 0.5) * 80,
        });
      }
    }
    // Logo vectorial nítid (es fon sobre els píxels un cop format)
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mesh = new THREE.Mesh(quad, crispMat(tex));
    mesh.scale.set(box.w, box.h, 1);
    mesh.position.set(box.x + box.w / 2, Y(box.y + box.h / 2), 2);
    mesh.renderOrder = 2;
    scene.add(mesh);
    crispMeshes.push(mesh);
  }
  logoMesh = makeInstanced(logoCells.length, 1);
  logoMesh.renderOrder = 1;
}

function updateLogo(t) {
  const size = LOGO_CELL - 1;
  const crisp = smooth(T_CRISP_IN, T_CRISP_IN + CRISP_FADE, t) * (1 - smooth(T_BREAK, T_BREAK + 0.25, t));
  const cellsVisible = t < T_CRISP_IN + CRISP_FADE || t >= T_BREAK;

  for (let i = 0; i < logoCells.length; i++) {
    const c = logoCells[i];
    if (!cellsVisible || t < T_ASSEMBLE + c.delay) { hideCell(logoMesh, i); continue; }

    if (t < T_BREAK) {
      // Caiguda des de dalt fins a la seva posició (acceleració + flaix en aterrar)
      const p = clamp01((t - T_ASSEMBLE - c.delay) / FALL_DUR);
      const y = c.y0 + (c.ty - c.y0) * p * p;
      const flash = p < 1 ? 0.7 : Math.exp(-(t - T_ASSEMBLE - c.delay - FALL_DUR) * 5);
      tmpColor.copy(C.logo).lerp(C.flash, flash);
      setCell(logoMesh, i, c.tx, Math.round(y), size, tmpColor);
    } else {
      // Es desfà: cau amb gravetat i es dissol en el color de la pluja
      const s = t - T_BREAK - 0.3 - c.fallDelay;
      if (s <= 0) { setCell(logoMesh, i, c.tx, c.ty, size, C.logo); continue; }
      const y = c.ty + 0.5 * GRAVITY * s * s;
      if (y > H + LOGO_CELL) { hideCell(logoMesh, i); continue; }
      let x = c.tx + c.vx * s;
      x = ((x % W) + W) % W;
      tmpColor.copy(C.logo).lerp(C.rain[0], clamp01(s * 2.5));
      setCell(logoMesh, i, x, Math.round(y), size, tmpColor);
    }
  }
  logoMesh.instanceMatrix.needsUpdate = true;
  logoMesh.instanceColor.needsUpdate = true;

  // Dues passades de brillantor sobre el logo nítid
  const g1 = (t - (T_CRISP_IN + 1.0)) / 1.4;
  const g2 = (t - (T_BREAK - 2.4)) / 1.4;
  const sweep = g1 >= 0 && g1 <= 1 ? g1 : g2 >= 0 && g2 <= 1 ? g2 : -1;
  for (const m of crispMeshes) {
    m.material.uniforms.opacity.value = crisp;
    m.material.uniforms.sweep.value = sweep < 0 ? -1 : sweep * 1.6 - 0.3;
  }
}

// ---------------------------------------------------------------------------
// Jugador: centrat a cada cara, de cintura cap amunt.
// Original: https://fzlleida.dev6.bigbangfood.es/storage/players/men/photo_body/30003914.webp
// Es demana via /fz-storage (proxy al mateix origen) perquè aquell servidor no envia CORS.
// ---------------------------------------------------------------------------
const PLAYER_SRC = { url: '/fz-storage/players/men/photo_body/30003914.webp', w: 1035, h: 1964, cropH: 1350 };
const playerMeshes = [];

async function buildPlayer() {
  const tex = await new THREE.TextureLoader().loadAsync(PLAYER_SRC.url);
  tex.premultiplyAlpha = true;
  tex.anisotropy = 4;
  const scale = H / PLAYER_SRC.cropH; // la part de dalt (cropH) ocupa tota l'alçada
  const w = Math.round(PLAYER_SRC.w * scale);
  const h = Math.round(PLAYER_SRC.h * scale);
  for (const face of FACES) {
    const left = Math.round(face.x0 + face.w / 2 - w / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      uniforms: {
        map: { value: tex },
        rect: { value: new THREE.Vector4(left, 0, w, h) }, // x, y (cap avall), amplada, alçada
        block: { value: 72 },
        opacity: { value: 0 },
        canvasH: { value: H },
      },
      vertexShader: /* glsl */ `
        void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec4 rect; uniform float block;
        uniform float opacity; uniform float canvasH;
        void main() {
          // Mosaic alineat a la graella global (la mateixa dels quadrats de 72 px)
          vec2 s = vec2(gl_FragCoord.x, canvasH - gl_FragCoord.y);
          vec2 q = block > 1.0 ? (floor(s / block) + 0.5) * block : s;
          vec2 uv = vec2((q.x - rect.x) / rect.z, 1.0 - (q.y - rect.y) / rect.w);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
          vec4 c = texture2D(map, uv);
          gl_FragColor = c * opacity;
        }`,
    });
    const mesh = new THREE.Mesh(quad, mat);
    // El quad cobreix el rectangle ampliat a la graella perquè els blocs de vora no es tallin
    const pad = 72;
    mesh.scale.set(w + pad * 2, H, 1);
    mesh.position.set(left + w / 2, Y(H / 2), 3);
    mesh.renderOrder = 3;
    scene.add(mesh);
    playerMeshes.push(mesh);
  }
}

function updatePlayer(t) {
  const pin = clamp01((t - T_PLAYER_IN) / PLAYER_REVEAL);
  const pout = clamp01((t - T_PLAYER_OUT) / PLAYER_REVEAL);
  const visible = t >= T_PLAYER_IN && pout < 1;
  // Entrada: de quadrats de 72 px a nítid. Sortida: a l'inrevés i es fon.
  const p = pout > 0 ? 1 - pout : pin;
  const block = MOSAIC_STEPS[Math.min(MOSAIC_STEPS.length - 1, Math.floor(p * MOSAIC_STEPS.length))];
  const opacity = visible ? clamp01(pin * 3) * (1 - smooth(0.6, 1, pout)) : 0;
  for (const m of playerMeshes) {
    m.visible = opacity > 0;
    m.material.uniforms.block.value = block;
    m.material.uniforms.opacity.value = opacity;
  }
}

// ---------------------------------------------------------------------------
// Guies de cares (?guides=1) per comprovar la posició al cub
// ---------------------------------------------------------------------------
if (params.get('guides') === '1') {
  const g = document.getElementById('guides');
  g.classList.add('on');
  const marks = [...CORNERS.map((x, i) => ({ x, label: `Cantonada ${i + 1}` })), ...FACES.map((f) => ({ x: f.x0, label: f.name }))];
  for (const { x, label } of marks) {
    const el = document.createElement('div');
    el.style.left = (x / W) * 100 + '%';
    el.textContent = `${label} · x=${x}`;
    g.appendChild(el);
  }
}

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------
await Promise.all([buildLogo(), buildPlayer()]);
const start = performance.now();
let last = start;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = FREEZE ?? ((now - start) / 1000) % LOOP;

  // Pluja més suau mentre el logo és visible
  const calmLogo = smooth(T_FORMED - 1, T_FORMED, t) * (1 - smooth(T_BREAK, T_BREAK + 1.2, t));
  const calmPlayer = smooth(T_PLAYER_IN - 0.5, T_PLAYER_IN + 0.5, t) * (1 - smooth(T_PLAYER_OUT + 0.5, T_PLAYER_OUT + 1.5, t));
  const calm = Math.max(calmLogo, calmPlayer);
  const intensity = 1 - calm * 0.6;
  // Ona de llum de 360° quan el logo queda format
  const wp = (t - T_FORMED) / 2.2;
  const waveAmt = wp >= 0 && wp <= 1 ? Math.sin(wp * Math.PI) : 0;
  const waveX = (FACES[0].x0 + wp * W) % W;

  updateRain(dt, intensity, waveX, waveAmt);
  updateLogo(t);
  updatePlayer(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

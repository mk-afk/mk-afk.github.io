/* ════════════════════════════════════════════════════════════
   pond.js · the water every page sits on

   Draws the pond itself on <canvas id="pond">: the floor, drifting
   light, lily pads, rain. It also runs the Night | Day switch and
   the Pause button. Everything else is added by other files:
     theme.js  which of Night and Day the page opens on
     water.js  ripples that bend the pond, ink that flows (needs WebGL)
     afloat.js the moon and the season's weather (every page)
     home.js   the koi
     ideas.js  a school of small fish
   Anything with class="sheet" is treated as paper lying on the
   water: fish come out from under it and floating things stop at
   its edge.
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const cv = document.getElementById('pond');
if (!cv || !cv.getContext) return;
const ctx = cv.getContext('2d');
const root = document.documentElement;
root.classList.add('pond-on');   // the stylesheet shows the caption and the Night | Day switch only when this is set

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  rainAmount: 1.0,     // night rain: 0 = still pond … 1.5 = downpour
  showStreaks: true,   // diagonal rain streaks above the water (night only)
  tapWater: false,     // true = tapping the water makes ripples and startles the fish
};

/* ── helpers ──────────────────────────────────────────────── */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ss = t => t * t * (3 - 2 * t); // smoothstep
const angDiff = a => Math.atan2(Math.sin(a), Math.cos(a));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── night / day palettes ─────────────────────────────────── */
const SCENE = {
  dark: {
    night: true, themeColor: '#081714',
    water: ['#0f2520', '#081714', '#040d0a'], vignette: 'rgba(2,8,7,',
    murk: 'rgba(6,16,13,', koiShadow: 'rgba(3,11,9,0.26)', outline: '#04100d', outA: 0.08,
    rim: 'rgba(4,12,10,', rimA: 0.2, sink: 0.62, finEdge: 'rgba(4,16,13,', finEdgeA: 0.1,   // koi: shading at the body's edge, how far the tail fades into the water, the line round a fin
    tintT: [13, 35, 30], tintK: d => clamp(0.08 + d * 0.72, 0, 0.78),
    padShadow: 'rgba(2,8,7,0.32)', padShade: 'rgba(1,6,5,0.5)',
    ripple: 'rgba(190,230,210,', glint: 'rgba(220,245,230,',
    caustic: 'rgba(120,200,170,', causticA: 0.035, causticComp: 'lighter',
    smallFish: [186, 208, 195], smallFishShadow: 'rgba(2,8,7,0.28)',
  },
  light: {
    night: false, themeColor: '#dbe8e3',
    water: ['#e6efeb', '#dbe8e3', '#cbddd7'], vignette: 'rgba(120,160,150,',
    murk: 'rgba(222,235,230,', koiShadow: 'rgba(70,96,88,0.20)', outline: '#3a4a40', outA: 0.2,
    rim: 'rgba(58,84,78,', rimA: 0.17, sink: 0.5, finEdge: 'rgba(58,78,70,', finEdgeA: 0.3,
    tintT: [219, 232, 227], tintK: d => clamp(0.04 + d * 0.42, 0, 0.52),
    padShadow: 'rgba(70,96,88,0.22)', padShade: 'rgba(60,88,80,0.34)',
    ripple: 'rgba(60,118,102,', glint: 'rgba(255,255,255,',
    caustic: 'rgba(255,255,255,', causticA: 0.28, causticComp: 'source-over',
    smallFish: [58, 82, 74], smallFishShadow: 'rgba(70,96,88,0.18)',
  },
};
let theme = root.dataset.theme === 'light' ? 'light' : 'dark';
const S = () => SCENE[theme];

/* ── the time of year (set by afloat.js; summer until told otherwise) ── */
// size: how big the lily pads are · night/day: their colour · bronze: new leaves come up bronze ·
// rust: they are turning brown from the rim · hardyOnly: only the pads marked hardy are left
const PAD_SEASON = {
  spring: { size: 0.84, night: '#273f33', day: '#9cc27e', bronze: true },
  summer: { size: 1.00, night: '#24392f', day: '#86a86b' },
  autumn: { size: 0.95, night: '#2c3829', day: '#a3a56c', rust: true },
  winter: { size: 0.74, night: '#1d2c28', day: '#8e9c88', hardyOnly: true },
};
let season = 'summer';
function setSeason(name) {
  season = PAD_SEASON[name] ? name : 'summer';
  if (sized) { pickPads(); placePads(); if (!running) renderOnce(); }
}

function tint(hex, d, a = 1) { // sink a color into the water
  const P = S();
  const k = P.tintK(d);
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${Math.round(lerp(r, P.tintT[0], k))},${Math.round(lerp(g, P.tintT[1], k))},${Math.round(lerp(b, P.tintT[2], k))},${a})`;
}

let W = 0, H = 0, dpr = 1;

/* ── the paper lying on the water ─────────────────────────── */
const sheetEl = document.querySelector('.sheet');
let sheet = null;      // its box in viewport pixels, or null
let covered = false;   // true when the paper hides (nearly) all of the water
function measureSheet() {
  if (!sheetEl) { sheet = null; covered = false; return; }
  const r = sheetEl.getBoundingClientRect();
  sheet = { l: r.left, t: r.top, r: r.right, b: r.bottom };
  const vw = window.innerWidth, vh = window.innerHeight;
  const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  covered = ix * iy > vw * vh * 0.9;
}
function underSheet(x, y, pad = 0) {
  return !!sheet && x > sheet.l - pad && x < sheet.r + pad && y > sheet.t - pad && y < sheet.b + pad;
}
// the biggest patch of open water beside the paper: { x, y, w, h } (centre + size), or null if there is none worth the name
function openWater() {
  if (!sheet) return { x: W * 0.55, y: H * 0.5, w: W, h: H };
  const s = sheet, vh = Math.min(H, window.innerHeight);
  const boxes = [
    [Math.max(0, s.r), 0, W, vh],                    // right of the paper
    [0, 0, Math.min(W, s.l), vh],                    // left of it
    [0, 0, W, Math.min(vh, s.t)],                    // above
    [0, Math.max(0, s.b), W, vh],                    // below
  ];
  let best = null, area = 0;
  for (const [x0, y0, x1, y1] of boxes) {
    const w = x1 - x0, h = y1 - y0;
    if (w < 110 || h < 110) continue;
    if (w * h > area) { area = w * h; best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w, h }; }
  }
  return best;
}
// which way out from under the paper? returns a heading in radians, or null
function wayOut(x, y, pad) {
  if (!underSheet(x, y, pad)) return null;
  const s = sheet, vh = Math.min(H, window.innerHeight);
  let best = null, bd = Infinity, d;
  if (W - s.r > 110) { d = s.r + pad - x; if (d < bd) { bd = d; best = 0; } }
  if (s.l > 110)     { d = x - (s.l - pad); if (d < bd) { bd = d; best = Math.PI; } }
  if (s.t > 110)     { d = y - (s.t - pad); if (d < bd) { bd = d; best = -Math.PI / 2; } }
  if (vh - s.b > 110) { d = s.b + pad - y; if (d < bd) { bd = d; best = Math.PI / 2; } }
  return best;
}

/* ── pond floor (rebuilt when the size changes) ───────────── */
const floorCv = document.createElement('canvas');
function buildFloor() {
  const s = 0.25;
  floorCv.width = Math.max(2, Math.floor(W * s));
  floorCv.height = Math.max(2, Math.floor(H * s));
  const f = floorCv.getContext('2d');
  f.clearRect(0, 0, floorCv.width, floorCv.height);
  for (let i = 0; i < 90; i++) { // dark silt blotches
    f.beginPath();
    f.ellipse(rand(0, floorCv.width), rand(0, floorCv.height),
      rand(8, 46), rand(6, 30), rand(0, TAU), 0, TAU);
    f.fillStyle = `rgba(3,14,12,${rand(0.05, 0.16)})`;
    f.fill();
  }
  for (let i = 0; i < 26; i++) { // faint pale stones
    f.beginPath();
    f.ellipse(rand(0, floorCv.width), rand(0, floorCv.height),
      rand(4, 14), rand(3, 9), rand(0, TAU), 0, TAU);
    f.fillStyle = `rgba(125,180,150,${rand(0.025, 0.06)})`;
    f.fill();
  }
}

// The water itself never changes between frames, so it is painted once per
// size and per theme into its own canvas and copied in from there.
const waterCv = document.createElement('canvas');
let waterKey = '';
function paintWater() {
  const P = S();
  waterCv.width = cv.width; waterCv.height = cv.height;
  const c = waterCv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createRadialGradient(W * 0.62, H * 0.42, 0, W * 0.62, H * 0.42, Math.max(W, H) * 0.9);
  g.addColorStop(0, P.water[0]);
  g.addColorStop(0.55, P.water[1]);
  g.addColorStop(1, P.water[2]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.globalAlpha = P.night ? 0.9 : 0.16;
  c.drawImage(floorCv, 0, 0, W, H);
  c.globalAlpha = 1;
  const v = c.createRadialGradient(W * 0.55, H * 0.45, Math.min(W, H) * 0.35,
                                   W * 0.55, H * 0.45, Math.max(W, H) * 0.85);
  v.addColorStop(0, P.vignette + '0)');
  v.addColorStop(1, P.vignette + (P.night ? 0.42 : 0.16) + ')');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}
function drawWater() {
  const key = theme + ':' + cv.width + 'x' + cv.height;
  if (key !== waterKey) { paintWater(); waterKey = key; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'copy';   // straight overwrite, no blending needed
  ctx.drawImage(waterCv, 0, 0);
  ctx.restore();
}

/* ── drifting light ───────────────────────────────────────── */
const caustics = [0, 1, 2].map(i => ({ s: rand(0, 9), r: rand(170, 320), i }));
function drawCaustics(t) {
  const P = S();
  ctx.globalCompositeOperation = P.causticComp;
  for (const c of caustics) {
    const x = W * (0.5 + 0.38 * Math.sin(t * 0.021 + c.s * 2.1));
    const y = H * (0.5 + 0.34 * Math.cos(t * 0.016 + c.s * 1.3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
    g.addColorStop(0, P.caustic + P.causticA + ')');
    g.addColorStop(1, P.caustic + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, c.r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ── suspended particles (night only) ─────────────────────── */
const motes = [];
function initMotes() {
  motes.length = 0;
  for (let i = 0; i < 46; i++)
    motes.push({ x: rand(0, W), y: rand(0, H), d: rand(0.2, 1), s: rand(0, 9) });
}
function stepMotes(t, dt) {
  for (const m of motes) {
    m.x += (3 + 5 * m.d) * dt + Math.sin(t * 0.6 + m.s) * 4 * dt;
    m.y += Math.sin(t * 0.4 + m.s * 2) * 5 * dt;
    if (m.x > W + 4) m.x = -4;
    if (m.x < -4) m.x = W + 4;
    if (m.y > H + 4) m.y = -4;
    if (m.y < -4) m.y = H + 4;
  }
}
function drawMotes() {
  ctx.fillStyle = '#bfe0cd';
  for (const m of motes) {
    ctx.globalAlpha = 0.04 + 0.1 * m.d;
    const r = 0.7 + m.d;
    ctx.fillRect(m.x, m.y, r, r);
  }
  ctx.globalAlpha = 1;
}

/* ── lily pads ────────────────────────────────────────────── */
// Where the pads grow. Each line is one pad.
//   rx, ry  where on the screen, 0–1 · r  how big
//   by, at  instead of rx, ry: beside the pad on line `by` (counting from 0), `at` degrees round it (0 is to its right, 90 below)
//   flower  it has a lily in summer · hardy  it is still there in winter
// (They keep to the edges, clear of the header's words and of where the moon lies.)
const padSpec = [
  { rx: 0.965, ry: 0.30,  r: 78, hardy: true },
  { by: 0, at: 218, r: 42, flower: true },
  { by: 1, at: 200, r: 24 },
  { rx: 0.985, ry: 0.69,  r: 52, flower: true, hardy: true },
  { by: 3, at: 120, r: 27 },
  { rx: 0.03,  ry: 0.93,  r: 58, flower: true, hardy: true },
  { by: 5, at: 265, r: 30 },
  { rx: 0.018, ry: 0.42,  r: 52 },
  { rx: 0.665, ry: 0.975, r: 66, hardy: true },
];
let pads = [];
// What makes one pad itself, settled when the page loads: how its edge wanders,
// how wide its notch is, where its veins run and fork, where it is blotched.
function makePads() {
  pads = padSpec.map((spec, i) => {
    const veins = [], n = Math.round(clamp(spec.r / 4.2, 9, 17));
    for (let k = 0; k < n; k++)
      veins.push({ at: 0.3 + (k + 0.5) / n * (TAU - 0.6) + rand(-0.07, 0.07), bow: rand(-0.05, 0.05), fork: rand(0.5, 0.68), open: rand(0.085, 0.15) });
    return {
      spec, i, x: 0, y: 0, r: spec.r, pic: {},
      turn: rand(0, TAU),                                    // which way the notch points
      gap: rand(0.02, 0.095),                                // half the notch's width at the rim, in radians
      wob: [[rand(0.012, 0.03), 2, rand(0, TAU)], [rand(0.008, 0.022), 3, rand(0, TAU)], [rand(0.004, 0.012), 5, rand(0, TAU)], [0.004, 13, rand(0, TAU)]],
      bite: Math.random() < 0.3 ? { at: rand(1.2, TAU - 1.2), deep: rand(0.05, 0.11), wide: rand(0.05, 0.1) } : null,   // some have a dent in the rim
      veins,
      blots: Array.from({ length: 3 }, () => ({ a: rand(0, TAU), d: rand(0.25, 0.75), s: rand(0.2, 0.42), dark: Math.random() < 0.5 })),
      rust: Array.from({ length: 4 }, () => ({ a: rand(0.5, TAU - 0.5), d: rand(0.78, 1.02), s: rand(0.2, 0.42) })),
      drops: Array.from({ length: 3 + Math.floor(rand(0, 5)) }, () => ({ a: rand(0.5, TAU - 0.5), d: Math.sqrt(rand(0.05, 0.8)), s: rand(1.0, 2.4) })),
      young: Math.random() < 0.6,                            // spring: the small ones may still be bronze
      lily: spec.flower ? { a: rand(0, TAU), turn: rand(0, TAU), pic: {} } : null,
    };
  });
}
function placePads() {
  const k = clamp(Math.min(W, H) / 760, 0.62, 1.25) * PAD_SEASON[season].size;
  for (const p of pads) {
    p.r = p.spec.r * k;
    if (p.spec.by === undefined) { p.x = p.spec.rx * W; p.y = p.spec.ry * H; continue; }
    const host = pads[p.spec.by], a = p.spec.at * Math.PI / 180, apart = (host.r + p.r) * 0.93;   // close enough to lap over its neighbour a little
    p.x = host.x + Math.cos(a) * apart; p.y = host.y + Math.sin(a) * apart;
  }
}
let live = [];   // the pads this season has: only the hardy ones see the winter through
function pickPads() { live = PAD_SEASON[season].hardyOnly ? pads.filter(p => p.spec.hardy) : pads; }
// A pad looks the same from one frame to the next, so each is painted once
// (per size, season and lighting) on a small canvas of its own and copied
// across from there. The same goes for the lilies.
//   holder  any object; the picture is kept on it
//   key     repaint only when this changes
//   half    half the picture's width; (0, 0) is its middle
function picture(holder, key, half, paint) {
  key += '@' + dpr;
  if (holder.key !== key) {
    const c = holder.cv || (holder.cv = document.createElement('canvas'));
    const px = Math.ceil(half * dpr) * 2;                   // a whole number of screen pixels, so it copies across exactly
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, px / 2, px / 2);
    paint(g);
    holder.key = key; holder.size = px / dpr;
  }
  return holder;
}
function stamp(pic, x, y) {                                 // centred on (x, y), nudged onto whole screen pixels
  const s = pic.size;
  ctx.drawImage(pic.cv, Math.round((x - s / 2) * dpr) / dpr, Math.round((y - s / 2) * dpr) / dpr, s, s);
}
function drawPads() {
  const key = theme + season;
  for (const p of live) {
    stamp(picture(p.pic, key + p.r.toFixed(1), p.r * 1.07 + 18, g => paintPad(g, p)), p.x, p.y);   // (the picture includes the pad's shadow)
    if (season === 'summer' && p.lily) drawLily(p);
  }
}

/* painting one pad */
const mixRGB = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const polar = (a, d) => [Math.cos(a) * d, Math.sin(a) * d];
// how far a pad's edge is from its middle, looking `a` round from its notch
function padEdge(p, a) {
  let k = 1;
  for (const [amp, n, phase] of p.wob) k += amp * Math.sin(n * a + phase);
  if (p.bite) { const d = angDiff(a - p.bite.at); k -= p.bite.deep * Math.exp(-d * d / (p.bite.wide * p.bite.wide)); }
  return p.r * k;
}
function padOutline(g, p) {
  const heart = polar(0, p.r * 0.07), gap = p.gap, first = gap * 2.4;   // the heart is where the stalk joins, at the foot of the notch
  g.beginPath();
  g.moveTo(heart[0], heart[1]);
  g.quadraticCurveTo(...polar(gap * 0.3, p.r * 0.55), ...polar(gap * 1.25, padEdge(p, gap) * 0.9));    // out along one side of the notch
  g.quadraticCurveTo(...polar(gap * 1.5, padEdge(p, gap)), ...polar(first, padEdge(p, first)));        // round the tip of that lobe
  let prev = polar(first, padEdge(p, first));
  for (let i = 1; i <= 72; i++) {                                                                       // all the way round the rim
    const a = first + (TAU - 2 * first) * i / 72, cur = polar(a, padEdge(p, a));
    if (i === 1) g.lineTo((prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    else g.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    prev = cur;
  }
  g.lineTo(prev[0], prev[1]);
  g.quadraticCurveTo(...polar(-gap * 1.5, padEdge(p, -gap)), ...polar(-gap * 1.25, padEdge(p, -gap) * 0.9));   // round the other tip
  g.quadraticCurveTo(...polar(-gap * 0.3, p.r * 0.55), heart[0], heart[1]);                                    // and back in to the heart
  g.closePath();
}
function paintPad(g, p) {
  const P = S(), look = PAD_SEASON[season], night = P.night, R = p.r, far = R * 1.2;
  const hex = night ? look.night : look.day;
  let base = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  if (look.bronze && p.young && p.spec.r < 45) base = mixRGB(base, night ? [70, 46, 36] : [172, 112, 84], 0.62);   // spring: new leaves come up bronze
  const pale = mixRGB(base, night ? [150, 190, 150] : [236, 244, 196], night ? 0.16 : 0.24);
  const deep = mixRGB(base, night ? [4, 14, 10] : [44, 76, 52], night ? 0.42 : 0.3);
  const lx = Math.cos(-p.turn) * -0.5 - Math.sin(-p.turn) * -0.86, ly = Math.sin(-p.turn) * -0.5 + Math.cos(-p.turn) * -0.86;   // "up and to the left", as the turned pad sees it
  const everywhere = () => g.fillRect(-far, -far, far * 2, far * 2);
  g.rotate(p.turn);
  // the leaf, and the soft shadow it throws on the water
  padOutline(g, p);
  g.save();
  g.shadowColor = P.padShade; g.shadowBlur = 7 * dpr; g.shadowOffsetX = 3.5 * dpr; g.shadowOffsetY = 5.5 * dpr;
  g.fillStyle = rgba(base); g.fill();
  g.restore();
  g.save();
  g.clip();
  const body = g.createRadialGradient(R * 0.07, 0, R * 0.05, 0, 0, R * 1.04);                  // paler at the heart, deeper towards the rim
  body.addColorStop(0, rgba(mixRGB(base, pale, 0.7))); body.addColorStop(0.45, rgba(base)); body.addColorStop(1, rgba(mixRGB(base, deep, 0.75)));
  g.fillStyle = body; everywhere();
  const sheen = g.createLinearGradient(lx * R, ly * R, -lx * R, -ly * R);                       // a waxy leaf: a little light on the side that faces it
  sheen.addColorStop(0, night ? 'rgba(170,215,195,0.10)' : 'rgba(255,255,236,0.20)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, night ? 'rgba(0,6,4,0.22)' : 'rgba(30,60,44,0.14)');
  g.fillStyle = sheen; everywhere();
  for (const b of p.blots) {                                                                    // no leaf is one even colour
    const [x, y] = polar(b.a, b.d * R), s = b.s * R, blot = g.createRadialGradient(x, y, 0, x, y, s), c = b.dark ? deep : pale;
    blot.addColorStop(0, rgba(c, 0.22)); blot.addColorStop(1, rgba(c, 0));
    g.fillStyle = blot; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
  }
  if (look.rust) {                                                                              // autumn: the pad is turning, from the rim inwards
    const rust = night ? 'rgba(96,66,30,' : 'rgba(168,112,48,';
    const turning = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R);
    turning.addColorStop(0, rust + '0)'); turning.addColorStop(1, rust + (night ? 0.32 : 0.36) + ')');
    g.fillStyle = turning; everywhere();
    for (const q of p.rust) {
      const [x, y] = polar(q.a, q.d * R), s = q.s * R, patch = g.createRadialGradient(x, y, 0, x, y, s);
      patch.addColorStop(0, rust + '0.5)'); patch.addColorStop(0.55, rust + '0.28)'); patch.addColorStop(1, rust + '0)');
      g.fillStyle = patch; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
  }
  // veins: out from the heart, each forking once, and again near the rim
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = rgba(pale, night ? 0.26 : 0.5);
  const hx = R * 0.07;
  for (const v of p.veins) {
    const len = padEdge(p, v.at) * 0.94, ca = Math.cos(v.at), sa = Math.sin(v.at);
    const along = (t, off = 0) => [hx * (1 - t) + ca * len * t - sa * off, sa * len * t + ca * off];
    const fork = along(v.fork, v.bow * R * 0.5);
    g.lineWidth = Math.max(0.55, R * 0.012);
    g.beginPath(); g.moveTo(...along(0.08)); g.quadraticCurveTo(...along(v.fork * 0.5, v.bow * R), fork[0], fork[1]); g.stroke();
    g.lineWidth = Math.max(0.4, R * 0.0075);
    for (const side of [-1, 1]) {
      const a = v.at + side * v.open, tip = polar(a, padEdge(p, a) * 0.95);
      const a2 = a + side * v.open * 0.55, tip2 = polar(a2, padEdge(p, a2) * 0.96);
      g.beginPath();
      g.moveTo(fork[0], fork[1]); g.lineTo(tip[0], tip[1]);
      g.moveTo(fork[0] + (tip[0] - fork[0]) * 0.62, fork[1] + (tip[1] - fork[1]) * 0.62); g.lineTo(tip2[0], tip2[1]);
      g.stroke();
    }
  }
  g.restore();   // (the leaf's own shape no longer clips what is drawn)
  // the rim: pale where it catches the light, dark where it turns away
  padOutline(g, p);
  const rim = g.createLinearGradient(lx * R, ly * R, -lx * R, -ly * R);
  rim.addColorStop(0, night ? 'rgba(150,205,180,0.20)' : 'rgba(255,255,240,0.75)'); rim.addColorStop(0.45, rgba(deep, 0.35)); rim.addColorStop(1, rgba(deep, night ? 0.9 : 0.7));
  g.strokeStyle = rim; g.lineWidth = 1.3; g.stroke();
  const eye = g.createRadialGradient(hx, 0, 0, hx, 0, R * 0.07);                                // the heart, where the stalk joins
  eye.addColorStop(0, rgba(pale, 0.9)); eye.addColorStop(1, rgba(pale, 0));
  g.fillStyle = eye; g.beginPath(); g.arc(hx, 0, R * 0.07, 0, TAU); g.fill();
  for (const q of night ? p.drops : p.drops.slice(0, 2)) {                                       // beads of water: more of them after a night's rain
    const [x, y] = polar(q.a, q.d * R * 0.9);
    g.fillStyle = rgba(deep, 0.35); g.beginPath(); g.arc(x - lx * 0.5, y - ly * 0.5, q.s, 0, TAU); g.fill();
    g.fillStyle = night ? 'rgba(190,225,210,0.22)' : 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(x, y, q.s * 0.8, 0, TAU); g.fill();
    g.fillStyle = night ? 'rgba(225,245,235,0.6)' : 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(x + lx * q.s * 0.35, y + ly * q.s * 0.35, q.s * 0.28, 0, TAU); g.fill();
  }
}
// a white water lily beside its pad: open by day, closed up at night
function drawLily(p) {
  const R = clamp(p.r * 0.44, 15, 30);
  const x = p.x + Math.cos(p.lily.a) * p.r * 0.72, y = p.y + Math.sin(p.lily.a) * p.r * 0.72;
  stamp(picture(p.lily.pic, theme + R.toFixed(1), R + 12, g => paintLily(g, p.lily, R)), x, y);
}
function paintLily(g, lily, R) {
  const P = S();
  g.rotate(lily.turn);
  const petal = (len, wid) => {
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(wid, -len * 0.45, 0, -len);
    g.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
    g.fill(); g.stroke();
  };
  const shadow = on => { g.shadowColor = on ? P.padShade : 'transparent'; g.shadowBlur = 5 * dpr; g.shadowOffsetX = 2.5 * dpr; g.shadowOffsetY = 4 * dpr; };
  g.lineWidth = 0.7;
  g.strokeStyle = P.night ? 'rgba(4,16,13,0.55)' : 'rgba(96,112,92,0.5)';
  if (P.night) {                              // a bud: three petals folded over each other
    g.fillStyle = tint('#f4f1e6', 0.36);
    shadow(true);
    for (const a of [-0.5, 0.5, 0]) { g.save(); g.rotate(a); petal(R * 0.9, R * 0.3); g.restore(); shadow(a > 0); }   // (the last petal lies on the others and shades nothing)
    shadow(false);
  } else {
    shadow(true);                             // the open flower's shadow, thrown by a disc hidden under its petals, so that no petal shades another
    g.fillStyle = '#eeeade'; g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.fill();
    shadow(false);
    for (const [n, len, wid, shade, off] of [[10, 1, 0.3, '#eeeade', 0], [8, 0.74, 0.27, '#f8f5ec', 0.4], [6, 0.48, 0.22, '#fffdf6', 0.15]]) {
      g.fillStyle = shade;
      for (let k = 0; k < n; k++) { g.save(); g.rotate(off + k * TAU / n); petal(R * len, R * wid); g.restore(); }
    }
    g.beginPath(); g.arc(0, 0, R * 0.2, 0, TAU);
    g.fillStyle = '#e2b03c'; g.fill();
    g.fillStyle = 'rgba(150,96,20,0.55)';
    for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(Math.cos(k * 0.9) * R * 0.11, Math.sin(k * 0.9) * R * 0.11, 0.9, 0, TAU); g.fill(); }
  }
}

/* ── ripples ──────────────────────────────────────────────── */
const ripples = [];
function addRipple(x, y, maxR = rand(26, 70), a0 = 0.5, delay = 0) {
  if (ripples.length > 150) ripples.shift();
  ripples.push({ x, y, r: 1.5, maxR, a0, delay });
}
function stepRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const p = ripples[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.r += ((p.maxR - p.r) * 1.7 + 16) * dt;
    if (p.r >= p.maxR * 0.985) ripples.splice(i, 1);
  }
}
function drawRipples() {
  const P = S();
  ctx.lineWidth = 1;
  for (const p of ripples) {
    if (p.delay > 0) continue;
    const a = Math.max(0, p.a0 * (1 - p.r / p.maxR));
    ctx.strokeStyle = P.ripple + a + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = P.ripple + (a * 0.55) + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.62, 0, TAU); ctx.stroke();
    if (p.r < 6) { // first-splash glint
      ctx.fillStyle = P.glint + a + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, TAU); ctx.fill();
    }
  }
}

/* ── rain: how hard, where it lands, streaks above the surface ── */
let rippleAcc = 0, rainNow = 0.5;
function stepRain(t, dt) {
  rainNow = clamp(0.55 + 0.35 * Math.sin(t * 0.043) + 0.15 * Math.sin(t * 0.013 + 2), 0.12, 1)
            * CONFIG.rainAmount;
  const calm = reduced ? 0.35 : 1;
  if (season === 'winter') { // snow settles without a splash
    rippleAcc += dt * 1.1 * calm;
    while (rippleAcc > 1) { rippleAcc -= 1; addRipple(rand(0, W), rand(0, H), rand(18, 44), 0.26); }
  } else if (S().night) {
    rippleAcc += dt * (4 + 22 * rainNow) * calm;
    while (rippleAcc > 1) { rippleAcc -= 1; addRipple(rand(0, W), rand(0, H)); }
  } else { // a calm day: the odd drop, nothing more
    rippleAcc += dt * 1.4 * calm;
    while (rippleAcc > 1) { rippleAcc -= 1; addRipple(rand(0, W), rand(0, H), rand(30, 80), 0.32); }
  }
}
const streaks = [];
function initStreaks() {
  streaks.length = 0;
  for (let i = 0; i < 90; i++)
    streaks.push({ x: rand(-W * 0.1, W), y: rand(-H, H), sp: rand(850, 1350), ln: rand(13, 22) });
}
function stepStreaks(dt) {
  for (const s of streaks) {
    s.y += s.sp * dt;
    s.x += s.sp * 0.18 * dt;
    if (s.y > H + 30) { s.y = rand(-60, -10); s.x = rand(-W * 0.15, W); }
  }
}
function drawStreaks() {
  const count = Math.floor(lerp(18, 90, clamp(rainNow, 0, 1)));
  ctx.strokeStyle = 'rgba(185,225,205,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const s = streaks[i];
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.ln * 0.2, s.y - s.ln);
  }
  ctx.stroke();
}

/* ── what lives in the pond (added by the other files) ────── */
// Each is an object with some of these methods:
//   resize(W, H)       the pond changed size
//   update(dt, t)      move on by dt seconds
//   draw(t)            paint in the water, under the lily pads (fish)
//   drawReflected(t)   paint on the surface, still under the pads (the moon)
//   drawAfloat(t)      paint floating on the surface, over the pads (leaves, petals, ice)
//   drawFalling(t)     paint in the air above everything (snow, fireflies)
//   tap(x, y)          the water was tapped there (only if CONFIG.tapWater)
const swimmers = [];
const stirSubs = [];   // told whenever a fish disturbs the surface
const drawnSubs = [];  // told each time the pond has been painted (water.js then redraws it through the graphics card)
function add(sw) {
  swimmers.push(sw);
  if (W && sw.resize) sw.resize(W, H);
  if (!running) { if (paused && reduced) preroll(); renderOnce(); }
}

/* ── size ─────────────────────────────────────────────────── */
let sized = false;
function resize() {
  // the canvas is sized in CSS (it fills the largest viewport), so a phone's
  // address bar sliding away does not count as a resize
  const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
  const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / (w * h)));
  measureSheet();
  if (sized && w === W && h === H && ratio === dpr) { syncLoop(); return; }
  W = w; H = h; dpr = ratio;
  cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildFloor(); waterKey = '';
  if (!sized) { makePads(); pickPads(); initMotes(); initStreaks(); }
  else {
    for (const m of motes) { m.x = Math.min(m.x, W); m.y = Math.min(m.y, H); }
  }
  placePads();
  for (const sw of swimmers) if (sw.resize) sw.resize(W, H);
  sized = true;
  syncLoop();
  if (!running) renderOnce();
}

/* ── main loop ────────────────────────────────────────────── */
let T = 0, last = 0, rafId = 0, running = false, painted = false;
let paused = reduced;   // people who ask for less motion get a still pond, with a Play button

function step(dt) {
  T += dt;
  for (const sw of swimmers) if (sw.update) sw.update(dt, T);
  stepRain(T, dt);
  stepRipples(dt);
  if (S().night) stepMotes(T, dt);
  if (raining()) stepStreaks(dt);
}
const raining = () => S().night && season !== 'winter' && CONFIG.showStreaks && !reduced;
function draw() {
  drawWater();
  drawCaustics(T);
  if (S().night) drawMotes();
  for (const sw of swimmers) if (sw.draw) sw.draw(T);
  for (const sw of swimmers) if (sw.drawReflected) sw.drawReflected(T);
  drawPads();
  for (const sw of swimmers) if (sw.drawAfloat) sw.drawAfloat(T);
  drawRipples();
  if (raining()) drawStreaks();
  for (const sw of swimmers) if (sw.drawFalling) sw.drawFalling(T);
  painted = true;
  for (const fn of drawnSubs) fn();
}
function frame(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  measureSheet();              // cheap, and the paper can move without a scroll (fonts loading, a section opening)
  if (covered) { running = false; return; }
  step(dt);
  draw();
  rafId = requestAnimationFrame(frame);
}
function renderOnce() { if (sized) draw(); }
function preroll() { for (let i = 0; i < 150; i++) step(1 / 30); } // let the pond settle before a still frame
function syncLoop() {
  const want = !paused && !document.hidden && !covered;
  if (want && !running) {
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  } else if (!want && running) {
    running = false;
    cancelAnimationFrame(rafId);
  }
}
document.addEventListener('visibilitychange', syncLoop);

let scrollQueued = false;
window.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => { scrollQueued = false; measureSheet(); syncLoop(); });
}, { passive: true });
window.addEventListener('resize', resize);
if (sheetEl && 'ResizeObserver' in window) new ResizeObserver(() => { measureSheet(); syncLoop(); }).observe(sheetEl);

/* ── tap the water (off unless CONFIG.tapWater) ───────────── */
if (CONFIG.tapWater) window.addEventListener('pointerdown', e => {
  if (e.button > 0 || paused || !e.target.closest) return;
  if (e.target.closest('.sheet, a, button, input, textarea, select, summary, label')) return;   // only bare water counts
  const x = e.clientX, y = e.clientY;
  addRipple(x, y, 92, S().night ? 0.7 : 0.5);
  addRipple(x, y, 56, S().night ? 0.55 : 0.38, 0.09);
  for (const sw of swimmers) if (sw.tap) sw.tap(x, y);
});

/* ── Night | Day ──────────────────────────────────────────── */
const themeBtns = document.querySelectorAll('[data-set-theme]');
const themeSubs = [];
const themeMeta = document.querySelector('meta[name="theme-color"]');
function applyTheme(t, remember) {
  theme = t === 'light' ? 'light' : 'dark';
  root.dataset.theme = theme;
  for (const b of themeBtns) b.setAttribute('aria-pressed', String(b.dataset.setTheme === theme));
  if (themeMeta) themeMeta.content = S().themeColor;
  if (remember) { try { localStorage.setItem('pond-theme', theme + '|' + (Date.now() + 12 * 3600e3)); } catch (e) { /* private mode, sandboxes */ } }   // holds for twelve hours: see theme.js
  for (const fn of themeSubs) fn(theme);
  if (!running) renderOnce();
}
for (const b of themeBtns) b.addEventListener('click', () => applyTheme(b.dataset.setTheme, true));

/* ── Pause / Play ─────────────────────────────────────────── */
const pauseBtn = document.getElementById('pondPause');
const pauseSubs = [];   // other moving things on the page (a figure, say) that should stop and start with the pond
function showPaused() {
  for (const fn of pauseSubs) fn(paused);
  if (!pauseBtn) return;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
  pauseBtn.setAttribute('aria-label', paused ? 'Play the animation' : 'Pause the animation');
}
if (pauseBtn) pauseBtn.addEventListener('click', () => {
  paused = !paused;
  showPaused();
  syncLoop();
});

/* ── go ───────────────────────────────────────────────────── */
window.Pond = {
  ctx, config: CONFIG, reduced, TAU, rand, lerp, clamp, ss, angDiff,
  get W() { return W; }, get H() { return H; },
  get scene() { return S(); }, get night() { return S().night; },
  get sheet() { return sheet; }, get paused() { return paused; },
  get season() { return season; }, setSeason,
  get rain() { return season === 'winter' ? 0.15 : rainNow; },      // how rough the surface is, 0–1.5
  get pads() { return live; },
  onPause(fn) { pauseSubs.push(fn); }, onTheme(fn) { themeSubs.push(fn); },
  onStir(fn) { stirSubs.push(fn); },
  stir(x, y, dx, dy, r) { for (const fn of stirSubs) fn(x, y, dx, dy, r); },   // a fish at (x, y) heading (dx, dy) pushes on anything within r
  tint, addRipple, add, underSheet, openWater, wayOut,
  // for water.js, which redraws the finished pond through the graphics card:
  canvas: cv, get dpr() { return dpr; }, get ripples() { return ripples; }, get moving() { return running; },
  get drawn() { return painted; }, onDrawn(fn) { drawnSubs.push(fn); },
  inkwell: null,   // water.js puts the flowing ink here when the graphics card can run it; home.js draws its own trails when it is missing
};

resize();
applyTheme(theme, false);
showPaused();
if (paused) { preroll(); renderOnce(); }
// web fonts arriving can nudge the paper; look again once they are in
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureSheet(); syncLoop(); if (!running) renderOnce(); });

})();

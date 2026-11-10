/* ════════════════════════════════════════════════════════════
   afloat.js · what the pond's weather brings (loaded by every page)

     the moon    at night, its reflection, in tonight's real phase
     the season  petals in spring, fireflies on summer nights, maple
                 leaves in autumn, ice and snow in winter (summer's
                 lilies are drawn with the pads, in pond.js)

   None of it answers to the visitor. It follows the calendar, the
   wind, the rain and the fish. Each part can be switched off in
   CONFIG, just below.
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const P = window.Pond;
if (!P) return;

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  season: 'auto',        // 'auto' follows the calendar (northern hemisphere). Or pin it: 'spring', 'summer', 'autumn', 'winter'
  moon: true,            // the moon's reflection in Night mode. false = no moon
  fireflies: 'summer',   // 'summer' = on summer nights · 'always' = every night · false = never
};

const { ctx, TAU, rand, clamp, ss, angDiff } = P;
const NOW = new Date();

/* ── the time of year ─────────────────────────────────────── */
function seasonOf(d) {
  const n = (d.getMonth() + 1) * 100 + d.getDate();   // 10 November → 1110
  if (n >= 320 && n < 621) return 'spring';
  if (n >= 621 && n < 922) return 'summer';
  if (n >= 922 && n < 1221) return 'autumn';
  return 'winter';
}
const season = CONFIG.season === 'auto' ? seasonOf(NOW) : CONFIG.season;
P.setSeason(season);

/* ── the wind: which way the surface drifts ───────────────── */
// It blows from the open water towards the paper, swinging widely and slowly,
// so a few of the things afloat end up resting against the paper's edge.
let windX = -3, windY = 1;
function blow(t) {
  const o = P.openWater(), s = P.sheet;
  let toward = 2.6;
  if (o && s) {
    const px = (Math.max(s.l, 0) + Math.min(s.r, P.W)) / 2, py = (Math.max(s.t, 0) + Math.min(s.b, P.H)) / 2;
    toward = Math.atan2(py - o.y, px - o.x);
  }
  const a = toward + 1.05 * Math.sin(t * 0.023) + 0.45 * Math.sin(t * 0.0071 + 1.3);
  const sp = 3.2 + 1.6 * Math.sin(t * 0.05 + 2);
  windX = Math.cos(a) * sp; windY = Math.sin(a) * sp;
}

/* ════════ the moon ════════ */
// How far through its cycle the moon is: 0 new, 0.25 first quarter, 0.5 full.
// This is the angle between the Moon and the Sun as seen from Earth, from
// their mean motions plus the six largest wobbles (Meeus, Astronomical
// Algorithms, ch. 48). It lands within about half an hour of the almanac.
function moonAge(d) {
  const rad = Math.PI / 180;
  const T = (d.getTime() / 864e5 - 10957.5) / 36525;      // centuries since noon on 1 January 2000
  const D = (297.8501921 + 445267.1114034 * T) * rad;      // mean angle from the Sun to the Moon
  const M = (357.5291092 + 35999.0502909 * T) * rad;       // where the Sun is on its (slightly oval) path
  const N = (134.9633964 + 477198.8675055 * T) * rad;      // where the Moon is on its own
  const apart = D / rad + 6.289 * Math.sin(N) - 2.100 * Math.sin(M) + 1.274 * Math.sin(2 * D - N)
              + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * N) + 0.110 * Math.sin(D);
  return ((apart / 360) % 1 + 1) % 1;
}
function moonName(p) {
  if (p < 0.034 || p > 0.966) return 'new, so nearly dark';
  if (p < 0.216) return 'a waxing crescent';
  if (p < 0.284) return 'a first quarter';
  if (p < 0.466) return 'a waxing gibbous';
  if (p < 0.534) return 'a full moon';
  if (p < 0.716) return 'a waning gibbous';
  if (p < 0.784) return 'a last quarter';
  return 'a waning crescent';
}
// the dark seas, roughly where they sit on the disc (x, y, size; north up)
const MARIA = [[-0.3, -0.45, 0.25], [-0.62, -0.08, 0.26], [0.18, -0.4, 0.17], [0.37, -0.14, 0.19],
               [0.72, -0.28, 0.1], [-0.2, 0.42, 0.18], [0.6, 0.06, 0.13]];
let moon = null;
function buildMoon() {
  // The moon's face is painted once, a little larger than the disc, and the
  // rippling shape of the lit part is filled with it on every frame.
  const p = moonAge(NOW), R = 120, M = 12;
  const c = document.createElement('canvas');
  c.width = c.height = 2 * (R + M);
  const g = c.getContext('2d');
  g.fillStyle = '#f3f1e4'; g.fillRect(0, 0, c.width, c.height);
  g.translate(R + M, R + M);
  for (const [mx, my, mr] of MARIA) {
    const sea = g.createRadialGradient(mx * R, my * R, 0, mx * R, my * R, mr * R * 1.3);
    sea.addColorStop(0, 'rgba(96,112,108,0.34)'); sea.addColorStop(0.6, 'rgba(96,112,108,0.2)'); sea.addColorStop(1, 'rgba(96,112,108,0)');
    g.fillStyle = sea; g.beginPath(); g.arc(mx * R, my * R, mr * R * 1.3, 0, TAU); g.fill();
  }
  moon = { cv: c, margin: M / R, age: p, name: moonName(p), lit: (1 - Math.cos(TAU * p)) / 2, x: 0, y: 0, d: 0 };
}
function placeMoon() {
  const W = P.W, H = P.H, s = P.sheet;
  moon.d = clamp(Math.min(W, H) * 0.125, 60, 120);
  moon.x = W * 0.7; moon.y = H * 0.36;
  if (!s) return;
  const beside = W - s.r;
  if (beside >= 240) moon.x = s.r + beside * 0.42;                        // wide screens: in the water beside the paper
  else { moon.x = W * 0.27; moon.y = Math.max(moon.d * 0.8, (s.t + window.scrollY) * 0.56); }   // narrow: in the water above it
}
function drawMoon(t) {
  if (!moon || !P.night) return;
  const R = moon.d / 2, x = moon.x, y = moon.y, N = 36;
  const rough = 0.45 + 1.0 * P.rain;                        // rain makes the reflection shiver more
  const sway = h => Math.sin(t * 1.5 + h * 0.2) * rough + Math.sin(t * 0.9 + h * 0.085) * rough * 0.6;   // how far the swell pushes it sideways, h pixels below its centre
  // an outline from top to bottom and back: `out` and `back` say how far each edge bulges (1 is the full disc, −1 the full disc the other way)
  const shape = (out, back) => {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + Math.PI * i / N, h = R * Math.sin(a); ctx.lineTo(x + out * R * Math.cos(a) + sway(h), y + h); }
    for (let i = N; i >= 0; i--) { const a = -Math.PI / 2 + Math.PI * i / N, h = R * Math.sin(a); ctx.lineTo(x + back * R * Math.cos(a) + sway(h), y + h); }
    ctx.closePath();
  };
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * 2.5);
  glow.addColorStop(0, `rgba(170,200,185,${0.04 + 0.09 * moon.lit})`); glow.addColorStop(1, 'rgba(170,200,185,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, R * 2.5, 0, TAU); ctx.fill();
  shape(1, -1);
  ctx.fillStyle = `rgba(190,210,200,${0.035 + 0.06 * (1 - moon.lit)})`; ctx.fill();   // the whole disc, faintly: the part the sun is not on
  if (moon.lit > 0.003) {
    const side = moon.age < 0.5 ? 1 : -1;                   // waxing: lit on the right
    shape(side, side * Math.cos(TAU * moon.age));           // from the limb round to the terminator
    ctx.globalCompositeOperation = 'screen';                // light laid over the water, so a fish passing beneath still shows through
    ctx.globalAlpha = 0.62;
    const full = 2 * R * (1 + moon.margin), k = full / moon.cv.width;
    ctx.translate(x - full / 2 + sway(0) * 0.6, y - full / 2); ctx.scale(k, k);   // lines the painted face up with the shape
    ctx.fillStyle = moon.face || (moon.face = ctx.createPattern(moon.cv, 'no-repeat'));
    ctx.fill();
  }
  ctx.restore();
}

/* ════════ the season: things that float ════════ */
const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };   // 0° is up
// a maple leaf: slender pointed lobes fanned out from where the stalk joins. One unit is the centre lobe.
function maple(tips, wide) {
  const leaf = new Path2D(), veins = new Path2D(), base = pt(180, 0.16);
  leaf.moveTo(...base);
  leaf.lineTo(...pt(tips[0][0] - 28, 0.22));
  tips.forEach(([deg, len], i) => {
    const next = i < tips.length - 1 ? pt((deg + tips[i + 1][0]) / 2, 0.3) : pt(deg + 28, 0.22);
    leaf.quadraticCurveTo(...pt(deg - wide, len * 0.6), ...pt(deg, len));
    leaf.quadraticCurveTo(...pt(deg + wide, len * 0.6), ...next);
    veins.moveTo(...base); veins.lineTo(...pt(deg, len * 0.9));
  });
  leaf.closePath();
  veins.moveTo(...base); veins.lineTo(...pt(180, 0.62));    // the stalk
  return { leaf, veins };
}
function plainLeaf() {       // an ordinary oval leaf, for variety
  const leaf = new Path2D(), veins = new Path2D();
  leaf.moveTo(0, -1); leaf.quadraticCurveTo(0.66, -0.25, 0, 0.72); leaf.quadraticCurveTo(-0.66, -0.25, 0, -1); leaf.closePath();
  veins.moveTo(0, -0.92); veins.lineTo(0, 1.05);
  for (const y of [-0.45, -0.1, 0.22]) { veins.moveTo(0, y + 0.16); veins.lineTo(0.26, y - 0.05); veins.moveTo(0, y + 0.16); veins.lineTo(-0.26, y - 0.05); }
  return { leaf, veins };
}
const LEAVES = [
  maple([[-112, 0.6], [-54, 0.86], [0, 1], [54, 0.86], [112, 0.6]], 13),
  maple([[-126, 0.46], [-84, 0.72], [-40, 0.9], [0, 1], [40, 0.9], [84, 0.72], [126, 0.46]], 9.5),
  maple([[-104, 0.66], [-50, 0.9], [0, 1], [50, 0.9], [104, 0.66]], 16),
  plainLeaf(),
];
const LEAF_TONES = ['#b63a1e', '#cf4a22', '#dd6a2a', '#e08a2e', '#d9a23a', '#a8452a', '#c2581f'];
const PETAL = (() => {       // a cherry petal: a teardrop with a nick in its tip
  const p = new Path2D();
  p.moveTo(0, 1); p.bezierCurveTo(0.95, 0.5, 0.92, -0.62, 0.26, -1); p.lineTo(0, -0.72); p.lineTo(-0.26, -1);
  p.bezierCurveTo(-0.92, -0.62, -0.95, 0.5, 0, 1); p.closePath();
  return p;
})();
const PETAL_TONES = ['#f6d5dc', '#f9e3e7', '#f2c4cf', '#fbeef0', '#f4cdd6'];

const things = [];           // whatever this season leaves on the water
const size = () => clamp(Math.min(P.W, P.H) / 760, 0.72, 1.15);
function howMany() {
  const room = clamp(P.W * P.H / 1.3e6, 0.4, 1.5);
  return Math.round(({ autumn: 14, spring: 24, winter: 6 }[season] || 0) * room);
}
function landingSpot(r) {    // open water: not under the paper, not on a lily pad
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < 16; k++) {
    const x = rand(16, P.W - 16), y = rand(16, P.H - 16);
    if (P.underSheet(x, y, r + 6)) continue;
    if (P.pads.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r)) continue;
    const upwind = -(x * windX + y * windY);                // prefer upwind, so it has somewhere to drift
    if (upwind > bestScore) { bestScore = upwind; best = [x, y]; }
    if (k >= 3 && best) break;
  }
  return best;
}
function launch(f, settled) {
  const sc = size();
  f.vx = f.vy = 0; f.a = rand(0, TAU); f.seed = rand(0, 99); f.age = 0;
  if (season === 'autumn') {
    f.kind = 'leaf'; f.shape = Math.floor(rand(0, LEAVES.length)); f.tone = LEAF_TONES[Math.floor(rand(0, LEAF_TONES.length))];
    f.size = rand(10, 16) * sc * (f.shape === 3 ? 0.72 : 1); f.r = f.size * 0.72; f.life = rand(80, 170); f.sail = rand(0.8, 1.15); f.spin = rand(-0.3, 0.3);
  } else if (season === 'spring') {
    f.kind = 'petal'; f.tone = PETAL_TONES[Math.floor(rand(0, PETAL_TONES.length))];
    f.size = rand(4.4, 6.8) * sc; f.r = f.size * 0.8; f.life = rand(55, 120); f.sail = rand(0.9, 1.3); f.spin = rand(-0.5, 0.5);
  } else {
    f.kind = 'floe'; f.size = rand(30, 64) * sc; f.r = f.size * 0.8; f.life = rand(280, 560); f.sail = rand(0.22, 0.42); f.spin = rand(-0.03, 0.03);
    const n = 6 + Math.floor(rand(0, 3));
    f.pts = Array.from({ length: n }, (_, i) => { const a = (i + rand(-0.38, 0.38)) / n * TAU, r = rand(0.6, 1); return [Math.cos(a) * r, Math.sin(a) * r]; });
    f.cracks = [rand(0, TAU), rand(0, TAU)].map(a => [rand(-0.2, 0.2), rand(-0.2, 0.2), Math.cos(a) * rand(0.5, 0.8), Math.sin(a) * rand(0.5, 0.8)]);
  }
  const spot = landingSpot(f.r);
  if (!spot) { f.alpha = 0; f.life = 4; f.x = -99; f.y = -99; return f; }   // nowhere to land just now: try again shortly
  [f.x, f.y] = spot;
  f.alpha = settled ? 1 : 0;
  if (settled) f.age = rand(0, f.life * 0.85);
  else if (f.kind !== 'floe' && !quiet) P.addRipple(f.x, f.y, f.r * 2 + 9, 0.3);   // it lands
  return f;
}
let quiet = false;           // true while fast-forwarding, so landings make no ripples
function block(f) {          // stop at the paper and at lily pads; true if it is resting against the paper
  const s = P.sheet;
  let held = false;
  if (s) {
    const l = s.l - f.r, r = s.r + f.r, t = s.t - f.r, b = s.b + f.r;
    if (f.x > l && f.x < r && f.y > t && f.y < b) {
      const dl = f.x - l, dr = r - f.x, du = f.y - t, dd = b - f.y, m = Math.min(dl, dr, du, dd);
      if (m === dl) { f.x = l; if (f.vx > 0) f.vx = 0; f.vy *= 0.9; }
      else if (m === dr) { f.x = r; if (f.vx < 0) f.vx = 0; f.vy *= 0.9; }
      else if (m === du) { f.y = t; if (f.vy > 0) f.vy = 0; f.vx *= 0.9; }
      else { f.y = b; if (f.vy < 0) f.vy = 0; f.vx *= 0.9; }
      f.spin *= 0.9;
      held = true;
    }
  }
  for (const p of P.pads) {
    const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy), min = p.r + f.r * 0.7;
    if (d < min && d > 0.01) {
      f.x = p.x + dx / d * min; f.y = p.y + dy / d * min;
      const into = (f.vx * dx + f.vy * dy) / d;
      if (into < 0) { f.vx -= into * dx / d; f.vy -= into * dy / d; }
    }
  }
  return held;
}
function stepThings(dt, t) {
  for (const f of things) {
    f.age += dt;
    const going = f.age > f.life;
    f.alpha = clamp(f.alpha + (going ? -dt / 3 : dt / 1.6), 0, 1);
    if ((going && f.alpha <= 0) || f.x < -50 || f.x > P.W + 50 || f.y < -50 || f.y > P.H + 50) { launch(f, false); continue; }
    const stray = Math.sin(t * 0.31 + f.seed) * 1.7, bearing = f.seed * 7 + t * 0.13;   // a little wandering of its own
    const ease = Math.min(1, dt * 0.6);
    f.vx += (windX * f.sail + Math.cos(bearing) * stray - f.vx) * ease;
    f.vy += (windY * f.sail + Math.sin(bearing) * stray - f.vy) * ease;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.a += (f.spin + Math.sin(t * 0.43 + f.seed) * 0.05) * dt;
    if (block(f) && f.kind !== 'floe') f.age += dt * 3;      // once it fetches up against the paper it soon goes under
  }
  for (let i = 0; i < things.length; i++) {                 // keep them from stacking on one another
    for (let j = i + 1; j < things.length; j++) {
      const a = things[i], b = things[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.82;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2, wa = b.r / (a.r + b.r), wb = 1 - wa;   // the smaller one gives way more
        a.x -= dx / d * push * 2 * wa; a.y -= dy / d * push * 2 * wa;
        b.x += dx / d * push * 2 * wb; b.y += dy / d * push * 2 * wb;
      }
    }
  }
}
function drawThings() {
  const S = P.scene, night = P.night;
  for (const f of things) {
    if (f.alpha <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    if (f.kind === 'floe') {
      ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.scale(f.size, f.size);
      ctx.beginPath(); f.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      ctx.fillStyle = night ? 'rgba(186,214,212,0.11)' : 'rgba(255,255,255,0.5)'; ctx.fill();
      ctx.lineWidth = 1.3 / f.size; ctx.lineJoin = 'round';
      ctx.strokeStyle = night ? 'rgba(214,236,234,0.3)' : 'rgba(255,255,255,0.95)'; ctx.stroke();
      ctx.lineWidth = 0.8 / f.size;
      ctx.strokeStyle = night ? 'rgba(214,236,234,0.16)' : 'rgba(150,184,180,0.5)';
      ctx.beginPath(); for (const [x0, y0, x1, y1] of f.cracks) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); } ctx.stroke();
    } else {
      const shape = f.kind === 'leaf' ? LEAVES[f.shape].leaf : PETAL;
      ctx.save();                                           // its shadow, a little down and to the right
      ctx.translate(f.x + f.size * 0.12 + 0.6, f.y + f.size * 0.2 + 1); ctx.rotate(f.a); ctx.scale(f.size, f.size);
      ctx.fillStyle = S.padShadow; ctx.fill(shape);
      ctx.restore();
      ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.scale(f.size, f.size);
      ctx.fillStyle = P.tint(f.tone, night ? (f.kind === 'leaf' ? 0.3 : 0.42) : 0);
      ctx.fill(shape);
      if (f.kind === 'leaf') {
        ctx.lineWidth = 0.85 / f.size; ctx.lineCap = 'round';
        ctx.strokeStyle = night ? 'rgba(0,0,0,0.3)' : 'rgba(84,34,10,0.4)';
        ctx.stroke(LEAVES[f.shape].veins);
      } else {
        ctx.lineWidth = 0.6 / f.size;
        ctx.strokeStyle = night ? 'rgba(0,0,0,0.2)' : 'rgba(190,120,140,0.55)';
        ctx.stroke(shape);
      }
    }
    ctx.restore();
  }
}

/* ── winter: snow, seen from above ────────────────────────── */
const flakes = [];
function stepFlakes(dt, t) {
  if (season !== 'winter') return;
  const want = Math.round((P.night ? 80 : 34) * clamp(P.W * P.H / 1.3e6, 0.4, 1.5) * (P.reduced ? 0.4 : 1));
  while (flakes.length < want) flakes.push({ x: rand(0, P.W), y: rand(0, P.H), r: rand(0.8, 2.3), sp: rand(0.7, 1.4), ph: rand(0, 9), life: rand(2, 9), age: rand(0, 6) });
  flakes.length = Math.min(flakes.length, want);
  for (const q of flakes) {
    q.age += dt;
    q.x += (windX * 2.6 * q.sp + Math.sin(t * 1.3 + q.ph) * 6) * dt;
    q.y += (windY * 2.6 * q.sp + 9 * q.sp + Math.cos(t * 1.1 + q.ph) * 5) * dt;
    if (q.age > q.life || q.x < -8 || q.x > P.W + 8 || q.y < -8 || q.y > P.H + 8) {   // it has landed: start another
      q.x = rand(0, P.W); q.y = rand(0, P.H); q.age = 0; q.life = rand(2.5, 9);
    }
  }
}
function drawFlakes() {
  if (season !== 'winter') return;
  const night = P.night;
  for (const q of flakes) {
    const fade = Math.min(1, q.age * 2, (q.life - q.age) * 2.5);    // fades in, then melts as it lands
    if (fade <= 0) continue;
    if (!night) {                                                    // by day it needs a shadow to show against pale water
      ctx.globalAlpha = fade * 0.22; ctx.fillStyle = '#46605a';
      ctx.beginPath(); ctx.arc(q.x + 1.2, q.y + 1.8, q.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = fade * (night ? 0.3 + 0.2 * q.r : 0.95);
    ctx.fillStyle = night ? '#e6f1ec' : '#ffffff';
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ════════ summer nights: fireflies ════════ */
// They drift over the open water, each on its own wandering course, and each
// glows on its own slow beat. More of them light up when the rain eases off.
const FLIES = CONFIG.fireflies === 'always' || (CONFIG.fireflies === 'summer' && season === 'summer');
const GLOW = (() => {        // one firefly's light: a hot point, and the pool of light it throws on the water
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d'), light = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  for (const [at, colour] of [[0, '255,255,226,1'], [0.07, '242,251,168,0.95'], [0.19, '216,238,114,0.42'],
                              [0.42, '192,226,100,0.12'], [0.75, '172,214,92,0.03'], [1, '172,214,92,0']]) light.addColorStop(at, `rgba(${colour})`);
  g.fillStyle = light; g.fillRect(0, 0, 96, 96);
  return c;
})();
const flies = [];
const WORDS = [...document.querySelectorAll('.site-head > *, .fig-caption > span, .site-foot')];   // text that sits on the water: they keep clear of it, so it stays easy to read
let words = [];
const overWords = (x, y, pad) => words.some(r => x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad);
function settle(f, o) {      // somewhere over the open water, dark for the moment
  for (let k = 0; k < 8; k++) {
    f.x = o.x + rand(-0.46, 0.46) * o.w; f.y = o.y + rand(-0.46, 0.46) * o.h;
    if (!overWords(f.x, f.y, 10) && !P.underSheet(f.x, f.y, 10)) break;
  }
  f.a = rand(0, TAU); f.glow = -1; f.wait = rand(0.2, 4.5); f.under = 0;
  return f;
}
// how bright it is: nothing while it is dark; through a glow, a quick swell and a slow fade
const shining = f => f.glow < 0 ? 0 : f.glow < 0.16 ? ss(f.glow / 0.16) : Math.pow(1 - (f.glow - 0.16) / 0.84, 1.7);
function stepFlies(dt, t) {
  if (!FLIES || !P.night) return;
  const o = P.openWater();
  if (!o) return;                                           // no water showing just now
  words = WORDS.map(el => el.getBoundingClientRect());
  const want = Math.round(clamp(10 + o.w * o.h / 26000, 10, 40));   // a dozen or so on a phone, two dozen beside the paper on a laptop
  while (flies.length < want) flies.push(settle({ sp: rand(9, 21), high: rand(0.7, 1.25), beat: rand(0.75, 1.35), seed: rand(0, 99) }, o));
  flies.length = want;
  const lively = clamp(1.3 - 0.6 * P.rain, 0.55, 1);        // fewer of them glow while it pours
  const edge = 30, floor = Math.min(P.H, window.innerHeight);
  for (const f of flies) {
    if (P.underSheet(f.x, f.y, 0)) { f.under += dt; if (f.under > 1.5) settle(f, o); } else f.under = 0;   // lost under the paper: come out over the water again
    f.a += (Math.sin(t * 0.9 + f.seed) * 0.9 + Math.sin(t * 0.37 + f.seed * 2.3) * 0.7) * dt;             // a wandering course
    if (P.underSheet(f.x, f.y, edge) || overWords(f.x, f.y, 16) || f.x < edge || f.x > P.W - edge || f.y < edge || f.y > floor - edge)
      f.a += clamp(angDiff(Math.atan2(o.y - f.y, o.x - f.x) - f.a), -1.6, 1.6) * dt * 2.6;                // and back towards open water from its edges
    const sp = f.sp * (0.6 + 0.4 * Math.sin(t * 0.6 + f.seed * 1.7)) * (1 + 0.7 * shining(f));            // it darts a little while it is lit
    f.x += Math.cos(f.a) * sp * dt; f.y += Math.sin(f.a) * sp * dt;
    if (f.glow < 0) {                                       // dark: counting down to the next glow
      f.wait -= dt * lively;
      if (f.wait <= 0 && !overWords(f.x, f.y, 4)) { f.glow = 0; f.wait = Math.random() < 0.18 ? 0.25 : rand(1.8, 5.5); }   // now and then, two in quick succession
    } else {
      f.glow += dt / f.beat;
      if (f.glow >= 1) f.glow = -1;
    }
  }
}
function drawFlies() {
  if (!FLIES || !P.night) return;
  const sc = size();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';                 // light, added to whatever is beneath it
  for (const f of flies) {
    const lit = shining(f);
    if (lit < 0.01) continue;
    const r = 26 * f.high * sc;
    ctx.globalAlpha = lit * 0.95;
    ctx.drawImage(GLOW, f.x - r, f.y - r, 2 * r, 2 * r);
  }
  ctx.restore();
}

/* ── the fish disturb what floats above them ──────────────── */
// (x, y) is a fish's head, (dx, dy) how far it just moved, r how far its push reaches
P.onStir((x, y, dx, dy, r) => {
  for (const f of things) {
    const ex = f.x - x, ey = f.y - y, d = Math.hypot(ex, ey);
    if (d < r) { const k = (1 - d / r) * (f.kind === 'floe' ? 0.05 : 0.4); f.vx += dx * k; f.vy += dy * k; f.spin += (ex * dy - ey * dx) * 0.0012 * k; }
  }
});

/* ── a line for the caption ───────────────────────────────── */
const note = document.getElementById('pondNote');
function writeNote() {
  if (note) note.textContent = (CONFIG.moon && moon && P.night) ? `The moon is tonight’s: ${moon.name}.` : '';
}
P.onTheme(writeNote);

/* ── join the pond ────────────────────────────────────────── */
if (CONFIG.moon) buildMoon();
writeNote();
let started = false;
P.add({
  resize() {
    if (moon) placeMoon();
    if (started) return;
    started = true;
    blow(0);
    const n = howMany();
    for (let i = 0; i < n; i++) things.push(launch({}, true));
    quiet = true;                                           // run the wind on ahead, so the page opens on a pond that has
    for (let i = 0; i < 480; i++) { blow(i * 0.25); stepThings(0.25, i * 0.25); }   // been there a while
    quiet = false;
  },
  update(dt, t) {
    blow(t + 120);
    if (moon) placeMoon();
    stepThings(dt, t + 120);
    stepFlakes(dt, t);
    stepFlies(dt, t);
  },
  drawReflected(t) { if (moon) drawMoon(t); },
  drawAfloat() { drawThings(); },
  drawFalling() { drawFlakes(); drawFlies(); },
});

})();

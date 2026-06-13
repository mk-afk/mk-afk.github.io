/* ════════════════════════════════════════════════════════════
   the pond · procedural koi, rain, and a few quiet rituals
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  fishCount: 3,        // 2–4 looks best
  rainAmount: 1.0,     // 0 = still pond … 1.5 = downpour
  showStreaks: true,   // diagonal rain streaks above the water
};

/* ── helpers ──────────────────────────────────────────────── */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ss = t => t * t * (3 - 2 * t); // smoothstep
const angDiff = a => Math.atan2(Math.sin(a), Math.cos(a));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mqlMobile = matchMedia('(max-width:880px)');

/* ── day / night scene palettes ───────────────────────────── */
const SCENE = {
  dark: {
    murk: 'rgba(6,16,13,', koiShadow: 'rgba(3,11,9,0.26)', outline: '#04100d', outA: 0.08,
    tintT: [13, 35, 30], tintK: d => clamp(0.08 + d * 0.72, 0, 0.78),
    pad: '#22362f', padStroke: 'rgba(0,0,0,0.35)', vein: 'rgba(6,16,13,0.5)',
    drop: 'rgba(205,228,213,', dropMul: 1, rim: 'rgba(160,220,190,0.07)',
    padShadow: 'rgba(2,8,7,0.32)',
    ripple: 'rgba(190,230,210,', glint: 'rgba(220,245,230,',
    caustic: 'rgba(120,200,170,', causticA: 0.035, causticComp: 'lighter',
  },
  light: {
    murk: 'rgba(252,250,245,', koiShadow: 'rgba(95,110,98,0.16)', outline: '#3a4a40', outA: 0.15,
    tintT: [250, 247, 241], tintK: d => clamp(0.05 + d * 0.5, 0, 0.6),
    pad: '#9fb785', padStroke: 'rgba(70,90,55,0.35)', vein: 'rgba(74,96,60,0.45)',
    drop: 'rgba(255,255,255,', dropMul: 2.4, rim: 'rgba(255,255,255,0.5)',
    padShadow: 'rgba(96,112,92,0.18)',
    ripple: 'rgba(70,130,112,', glint: 'rgba(255,255,255,',
    caustic: 'rgba(110,185,160,', causticA: 0.06, causticComp: 'source-over',
  },
};
let theme = 'dark';
const S = () => SCENE[theme];

function tint(hex, d, a = 1) { // sink a color into the water
  const P = S();
  const k = P.tintK(d);
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${Math.round(lerp(r, P.tintT[0], k))},${Math.round(lerp(g, P.tintT[1], k))},${Math.round(lerp(b, P.tintT[2], k))},${a})`;
}

/* ── canvas ───────────────────────────────────────────────── */
const cv = document.getElementById('pond');
const ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;

/* ── pond floor (built once per resize) ───────────────────── */
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

function drawBackground(t) {
  if (theme === 'light') { ctx.clearRect(0, 0, W, H); return; } // paper shows through
  const g = ctx.createRadialGradient(W * 0.62, H * 0.42, 0, W * 0.62, H * 0.42, Math.max(W, H) * 0.9);
  g.addColorStop(0, '#0f2520');
  g.addColorStop(0.55, '#081714');
  g.addColorStop(1, '#040d0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.9;
  ctx.drawImage(floorCv, 0, 0, W, H);
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W * 0.55, H * 0.45, Math.min(W, H) * 0.35,
                                     W * 0.55, H * 0.45, Math.max(W, H) * 0.85);
  v.addColorStop(0, 'rgba(2,8,7,0)');
  v.addColorStop(1, 'rgba(2,8,7,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/* ── drifting light (murky caustic wisps) ─────────────────── */
const caustics = [0, 1, 2].map(i => ({ s: rand(0, 9), r: rand(170, 320), i }));
function drawCaustics(t) {
  ctx.globalCompositeOperation = S().causticComp;
  for (const c of caustics) {
    const x = W * (0.5 + 0.38 * Math.sin(t * 0.021 + c.s * 2.1));
    const y = H * (0.5 + 0.34 * Math.cos(t * 0.016 + c.s * 1.3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
    g.addColorStop(0, S().caustic + S().causticA + ')');
    g.addColorStop(1, S().caustic + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, c.r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ── suspended particles ──────────────────────────────────── */
const motes = [];
function initMotes() {
  motes.length = 0;
  for (let i = 0; i < 46; i++)
    motes.push({ x: rand(0, W), y: rand(0, H), d: rand(0.2, 1), s: rand(0, 9) });
}
function drawMotes(t, dt) {
  ctx.fillStyle = '#bfe0cd';
  for (const m of motes) {
    m.x += (3 + 5 * m.d) * dt + Math.sin(t * 0.6 + m.s) * 4 * dt;
    m.y += Math.sin(t * 0.4 + m.s * 2) * 5 * dt;
    if (m.x > W + 4) m.x = -4;
    if (m.x < -4) m.x = W + 4;
    if (m.y > H + 4) m.y = -4;
    if (m.y < -4) m.y = H + 4;
    ctx.globalAlpha = 0.04 + 0.1 * m.d;
    const r = 0.7 + m.d;
    ctx.fillRect(m.x, m.y, r, r);
  }
  ctx.globalAlpha = 1;
}

/* ── lily pads ────────────────────────────────────────────── */
const padSpec = [
  { rx: 0.87, ry: 0.13, r: 76, s: 1.2 },
  { rx: 0.08, ry: 0.84, r: 54, s: 4.7 },
  { rx: 0.70, ry: 0.96, r: 66, s: 7.9 },
  { rx: 0.34, ry: 0.03, r: 48, s: 2.9 },
];
let pads = [];
function placePads() {
  pads = padSpec.map(p => {
    const sp = []; // fixed speckles — rain droplets resting on the pad
    const ns = 10 + Math.floor(rand(0, 9));
    for (let i = 0; i < ns; i++) {
      const a = rand(0.4, TAU - 0.4), rr = Math.sqrt(rand(0.03, 0.9)) * p.r;
      sp.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, s: rand(0.6, 1.7), al: rand(0.05, 0.15) });
    }
    return { x: p.rx * W, y: p.ry * H, r: p.r, s: p.s, a0: rand(0, TAU), sp };
  });
}
function drawPads(t) {
  for (const p of pads) {
    const rot = p.a0 + Math.sin(t * 0.22 + p.s) * 0.03;
    ctx.save();
    ctx.translate(p.x, p.y);
    // soft shadow on the water
    ctx.beginPath(); ctx.ellipse(4, 6, p.r, p.r * 0.94, 0, 0, TAU);
    ctx.fillStyle = S().padShadow; ctx.fill();
    ctx.rotate(rot);
    // pad with a notch
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.r, 0.26, TAU - 0.26);
    ctx.closePath();
    ctx.fillStyle = S().pad; ctx.fill();
    ctx.strokeStyle = S().padStroke; ctx.lineWidth = 2; ctx.stroke();
    // veins
    ctx.strokeStyle = S().vein; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = 0.55 + k * ((TAU - 1.1) / 5);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * p.r * 0.92, Math.sin(a) * p.r * 0.92);
      ctx.stroke();
    }
    // resting droplets
    for (const q of p.sp) {
      ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, TAU);
      ctx.fillStyle = S().drop + (q.al * S().dropMul) + ')'; ctx.fill();
    }
    // wet rim highlight
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0.26, TAU - 0.26);
    ctx.strokeStyle = S().rim; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
}

/* ── rain ripples ─────────────────────────────────────────── */
const ripples = [];
function addRipple(x, y, maxR = rand(26, 70), a0 = 0.5, delay = 0) {
  if (ripples.length > 150) ripples.shift();
  ripples.push({ x, y, r: 1.5, maxR, a0, delay });
}
function drawRipples(dt) {
  ctx.lineWidth = 1;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const p = ripples[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.r += ((p.maxR - p.r) * 1.7 + 16) * dt;
    const a = Math.max(0, p.a0 * (1 - p.r / p.maxR));
    if (p.r >= p.maxR * 0.985) { ripples.splice(i, 1); continue; }
    ctx.strokeStyle = S().ripple + a + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = S().ripple + (a * 0.55) + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.62, 0, TAU); ctx.stroke();
    if (p.r < 6) { // first-splash glint
      ctx.fillStyle = S().glint + a + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, TAU); ctx.fill();
    }
  }
}

/* ── rain streaks above the surface ───────────────────────── */
const streaks = [];
function initStreaks() {
  streaks.length = 0;
  for (let i = 0; i < 90; i++)
    streaks.push({ x: rand(-W * 0.1, W), y: rand(-H, H), sp: rand(850, 1350), ln: rand(13, 22) });
}
function drawStreaks(dt, count) {
  ctx.strokeStyle = 'rgba(185,225,205,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const s = streaks[i];
    s.y += s.sp * dt;
    s.x += s.sp * 0.18 * dt;
    if (s.y > H + 30) { s.y = rand(-60, -10); s.x = rand(-W * 0.15, W); }
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.ln * 0.2, s.y - s.ln);
  }
  ctx.stroke();
}

/* ── koi ──────────────────────────────────────────────────── */
const PALETTES = [
  { name: 'sanke', base: '#f3efe4', patches: ['#e07a4f', '#26282c', '#e8894e', '#d96b3f'], eye: '#23252a', fin: '#efe9da' },
  { name: 'showa', base: '#26282c', patches: ['#e07a4f', '#f3efe4', '#e8894e', '#f3efe4'], eye: '#0b0c0e', fin: '#3a3d42' },
  { name: 'sanke', base: '#f3efe4', patches: ['#d96b3f', '#e07a4f', '#26282c'], eye: '#23252a', fin: '#efe9da' },
  { name: 'showa', base: '#2a2c30', patches: ['#e8894e', '#f3efe4', '#e07a4f'], eye: '#0b0c0e', fin: '#3f424a' },
];

class Koi {
  constructor(idx, count) {
    this.pal = PALETTES[idx % PALETTES.length];
    this.size = rand(1.0, 1.35);
    this.depth = clamp((idx + rand(0.05, 0.6)) / count, 0.08, 0.9);
    this.n = 26;
    this.segLen = 4.2 * this.size;
    this.heading = rand(0, TAU);
    this.seed = rand(0, 1000);
    this.phase = rand(0, TAU);
    this.ep = rand(0, TAU);
    this.epRate = rand(0.55, 0.9);
    this.boost = 0;
    this.gulp = 0;
    this.gulpT = rand(10, 24);
    this.spdMod = 0.7;
    const x = rand(W * 0.35, W * 0.92), y = rand(H * 0.15, H * 0.85);
    this.cx = new Float32Array(this.n);
    this.cy = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.cx[i] = x - Math.cos(this.heading) * this.segLen * i;
      this.cy[i] = y - Math.sin(this.heading) * this.segLen * i;
    }
    // body half-width profile
    this.w = new Float32Array(this.n);
    const maxW = 12 * this.size; // plump, photo-koi proportions
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      let f;
      if (t < 0.14) f = lerp(0.55, 0.97, ss(t / 0.14));            // blunt nose
      else if (t < 0.4) f = lerp(0.97, 1, ss((t - 0.14) / 0.26));  // broad back
      else if (t < 0.8) f = lerp(1, 0.26, ss((t - 0.4) / 0.4));    // long taper
      else f = lerp(0.26, 0.11, (t - 0.8) / 0.2);                  // tail stalk
      this.w[i] = f * maxW;
    }
    // cartoonish patch pattern, fixed per fish
    const nb = 4 + Math.floor(rand(0, 4));
    this.blobs = [];
    for (let i = 0; i < nb; i++) {
      this.blobs.push({
        u: rand(0.06, 0.9), v: rand(-0.75, 0.75),
        r: rand(0.55, 1.15), e: rand(1.25, 1.9),
        c: this.pal.patches[i % this.pal.patches.length],
      });
    }
    // scratch buffers for drawing
    this.px = new Float32Array(this.n); this.py = new Float32Array(this.n);
    this.nx = new Float32Array(this.n); this.ny = new Float32Array(this.n);
    this.da = new Float32Array(this.n);
  }

  update(dt, t, all) {
    // wander
    const drift = Math.sin(t * 0.45 + this.seed) * 0.6 + Math.sin(t * 0.17 + this.seed * 1.7) * 0.4;
    this.heading += drift * 0.3 * dt;
    // stay in the pond
    const m = 110, hx = this.cx[0], hy = this.cy[0];
    if (hx < m || hx > W - m || hy < m || hy > H - m) {
      const want = Math.atan2(H * 0.5 - hy, W * 0.55 - hx);
      this.heading += clamp(angDiff(want - this.heading), -1.4, 1.4) * dt * 2.2;
    }
    // gentle separation from similar-depth fish
    for (const o of all) {
      if (o === this) continue;
      const dx = hx - o.cx[0], dy = hy - o.cy[0];
      const d2 = dx * dx + dy * dy;
      if (d2 < 90 * 90 && Math.abs(o.depth - this.depth) < 0.28) {
        const away = Math.atan2(dy, dx);
        this.heading += clamp(angDiff(away - this.heading), -1, 1) * dt * 1.3;
      }
    }
    // kick–glide rhythm
    this.ep += dt * this.epRate * (1 + this.boost);
    const s = Math.sin(this.ep);
    this.spdMod = 0.7 + 0.3 * s * s;
    // surface gulp → ripples from the mouth
    this.gulpT -= dt;
    if (this.gulpT < 0 && this.depth < 0.6 && !reduced) {
      this.gulp = 1;
      this.gulpT = rand(16, 34);
      addRipple(hx, hy, 26, 0.45, 0);
      addRipple(hx, hy, 36, 0.4, 0.22);
      addRipple(hx, hy, 20, 0.32, 0.45);
    }
    this.gulp = Math.max(0, this.gulp - dt * 0.8);
    this.boost = Math.max(0, this.boost - this.boost * dt * 2.1);
    const spd = (13 + 13 * this.spdMod) * this.size * (1 + this.boost * 1.7) * (reduced ? 0.55 : 1);
    this.phase += dt * (2 + spd * 0.05);
    // move head, body follows
    this.cx[0] += Math.cos(this.heading) * spd * dt;
    this.cy[0] += Math.sin(this.heading) * spd * dt;
    for (let i = 1; i < this.n; i++) {
      const dx = this.cx[i] - this.cx[i - 1], dy = this.cy[i] - this.cy[i - 1];
      const d = Math.hypot(dx, dy) || 1;
      this.cx[i] = this.cx[i - 1] + (dx / d) * this.segLen;
      this.cy[i] = this.cy[i - 1] + (dy / d) * this.segLen;
    }
  }

  draw(t) {
    const n = this.n, sz = this.size, d = this.depth;
    const fade = clamp((1 - d * 0.5) * (1 + this.gulp * 0.15), 0, 1);
    const scaleD = (1 - d * 0.22) * (1 + this.gulp * 0.06);
    // 1) chain normals → wave-displaced spine
    const amp = (0.8 + 1.2 * this.spdMod + this.boost * 1.6) * sz * (reduced ? 0.6 : 1);
    for (let i = 0; i < n; i++) {
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      let fx = this.cx[ia] - this.cx[ib], fy = this.cy[ia] - this.cy[ib];
      const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L;
      const env = 0.12 + 0.88 * Math.pow(i / (n - 1), 1.5);
      const lat = Math.sin(this.phase - i * 0.52) * amp * env;
      this.px[i] = this.cx[i] + (-fy) * lat;
      this.py[i] = this.cy[i] + (fx) * lat;
    }
    // 2) final tangents/normals from displaced spine
    for (let i = 0; i < n; i++) {
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      let fx = this.px[ia] - this.px[ib], fy = this.py[ia] - this.py[ib];
      const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L;
      this.nx[i] = -fy; this.ny[i] = fx;
      this.da[i] = Math.atan2(fy, fx);
    }
    const px = this.px, py = this.py, nx = this.nx, ny = this.ny, w = this.w, da = this.da;
    // 3) body outline → Path2D
    const body = new Path2D();
    const pts = [];
    pts.push([px[0] + Math.cos(da[0]) * 5.4 * sz, py[0] + Math.sin(da[0]) * 5.4 * sz]);
    for (let i = 0; i < n; i++) pts.push([px[i] + nx[i] * w[i], py[i] + ny[i] * w[i]]);
    pts.push([px[n - 1] - Math.cos(da[n - 1]) * 2.2 * sz, py[n - 1] - Math.sin(da[n - 1]) * 2.2 * sz]);
    for (let i = n - 1; i >= 0; i--) pts.push([px[i] - nx[i] * w[i], py[i] - ny[i] * w[i]]);
    const np = pts.length;
    body.moveTo((pts[0][0] + pts[np - 1][0]) / 2, (pts[0][1] + pts[np - 1][1]) / 2);
    for (let i = 0; i < np; i++) {
      const a = pts[i], b = pts[(i + 1) % np];
      body.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    body.closePath();

    ctx.save();
    const ccx = px[6], ccy = py[6];
    ctx.translate(ccx, ccy); ctx.scale(scaleD, scaleD); ctx.translate(-ccx, -ccy);
    ctx.globalAlpha = fade;

    // shadow on the silt (higher fish → longer throw)
    const off = (7 + 15 * (1 - d)) * sz;
    ctx.save();
    ctx.fillStyle = S().koiShadow;
    ctx.globalAlpha = fade * 0.42;
    ctx.translate(off * 0.6, off);
    ctx.fill(body);
    ctx.translate(off * 0.18, off * 0.25);
    ctx.globalAlpha = fade * 0.18;
    ctx.fill(body);
    ctx.restore();

    // tail fin (behind body)
    const ta = da[n - 1] + Math.PI + Math.sin(this.phase - n * 0.52 - 0.7) * 0.3;
    const tl = (15 + 2 * Math.sin(this.phase * 0.9 + this.seed)) * sz;
    const ex = px[n - 1], ey = py[n - 1];
    ctx.globalAlpha = fade * 0.55;
    ctx.fillStyle = tint(this.pal.fin, d);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.quadraticCurveTo(
      ex + Math.cos(ta + 0.9) * tl * 0.5, ey + Math.sin(ta + 0.9) * tl * 0.5,
      ex + Math.cos(ta + 0.5) * tl, ey + Math.sin(ta + 0.5) * tl);
    ctx.quadraticCurveTo(
      ex + Math.cos(ta) * tl * 0.32, ey + Math.sin(ta) * tl * 0.32,
      ex + Math.cos(ta - 0.5) * tl, ey + Math.sin(ta - 0.5) * tl);
    ctx.quadraticCurveTo(
      ex + Math.cos(ta - 0.9) * tl * 0.5, ey + Math.sin(ta - 0.9) * tl * 0.5,
      ex, ey);
    ctx.fill();

    // pectoral fins
    ctx.globalAlpha = fade * 0.45;
    for (const sgn of [-1, 1]) {
      const bx = px[5] + nx[5] * w[5] * 0.75 * sgn;
      const by = py[5] + ny[5] * w[5] * 0.75 * sgn;
      const fa = da[5] + Math.PI + sgn * (0.85 + 0.18 * Math.sin(this.phase * 1.1 + (sgn > 0 ? 0 : 2.1)));
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(fa);
      ctx.beginPath();
      ctx.ellipse(7 * sz, 0, 8.5 * sz, 3.6 * sz, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = fade;

    // body
    ctx.fillStyle = tint(this.pal.base, d);
    ctx.fill(body);
    // patches ride the spine, clipped to the body
    ctx.save();
    ctx.clip(body);
    for (const b of this.blobs) {
      const i = Math.round(b.u * (n - 1));
      const X = px[i] + nx[i] * (b.v * w[i]);
      const Y = py[i] + ny[i] * (b.v * w[i]);
      const rr = b.r * (w[i] * 0.85 + 2.5);
      ctx.save();
      ctx.translate(X, Y); ctx.rotate(da[i]); ctx.scale(b.e, 1);
      const pg = ctx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr);
      pg.addColorStop(0, tint(b.c, d));
      pg.addColorStop(0.85, tint(b.c, d));
      pg.addColorStop(1, tint(b.c, d, 0));
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU);
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.restore();
    }
    // shade into the water: dark inner rim + head→tail dissolve
    ctx.strokeStyle = S().murk + (0.16 + d * 0.3) + ')';
    ctx.lineWidth = (2.2 + 2.8 * d) * sz;
    ctx.stroke(body); // straddles the outline; the outer half is clipped away
    const wg = ctx.createLinearGradient(px[0], py[0], px[n - 1], py[n - 1]);
    wg.addColorStop(0, S().murk + '0)');
    wg.addColorStop(0.5, S().murk + (0.06 + d * 0.1) + ')');
    wg.addColorStop(1, S().murk + (0.78 + d * 0.18) + ')');
    ctx.fillStyle = wg;
    ctx.fill(body);
    if (theme === 'dark' && d < 0.55) { // a touch of surface light on the back, near the head
      const sg = ctx.createRadialGradient(px[4], py[4], 0, px[4], py[4], w[4] * 2.6);
      sg.addColorStop(0, `rgba(235,246,238,${0.12 * (1 - d * 1.6)})`);
      sg.addColorStop(1, 'rgba(235,246,238,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg; ctx.fill(body);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // dorsal ridge
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1 * sz; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px[8], py[8]);
    for (let i = 9; i <= 18; i++) ctx.lineTo(px[i], py[i]);
    ctx.stroke();
    // eyes
    ctx.fillStyle = tint(this.pal.eye, d);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(px[1] + nx[1] * w[1] * 0.62 * sgn, py[1] + ny[1] * w[1] * 0.62 * sgn, 1.5 * sz, 0, TAU);
      ctx.fill();
    }
    // soft cartoon outline
    ctx.globalAlpha = fade * S().outA;
    ctx.strokeStyle = S().outline;
    ctx.lineWidth = 1 * sz;
    ctx.stroke(body);

    ctx.restore();
  }
}

let fishes = [];
function initFish() {
  fishes = [];
  const c = clamp(Math.round(CONFIG.fishCount), 1, 6);
  for (let i = 0; i < c; i++) fishes.push(new Koi(i, c));
  fishes.sort((a, b) => b.depth - a.depth); // deepest painted first
}

/* ── resize ───────────────────────────────────────────────── */
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildFloor(); placePads(); initMotes(); initStreaks();
  for (const f of fishes) { // nudge anyone left outside
    const ox = clamp(f.cx[0], 60, W - 60) - f.cx[0];
    const oy = clamp(f.cy[0], 60, H - 60) - f.cy[0];
    for (let i = 0; i < f.n; i++) { f.cx[i] += ox; f.cy[i] += oy; }
  }
}
window.addEventListener('resize', resize);
resize();
initFish();

/* ── weather + main loop ──────────────────────────────────── */
let last = performance.now(), T = 0, running = true, rippleAcc = 0;
function frame(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; T += dt;

  const I = clamp(0.55 + 0.35 * Math.sin(T * 0.043) + 0.15 * Math.sin(T * 0.013 + 2), 0.12, 1)
            * CONFIG.rainAmount;

  for (const f of fishes) f.update(dt, T, fishes);

  drawBackground(T);
  drawCaustics(T);
  if (theme === 'dark') drawMotes(T, dt);
  for (const f of fishes) f.draw(T);
  drawPads(T);

  if (theme === 'dark') {
    rippleAcc += dt * (4 + 22 * I) * (reduced ? 0.35 : 1);
    while (rippleAcc > 1) { rippleAcc -= 1; addRipple(rand(0, W), rand(0, H)); }
    drawRipples(dt);
    if (CONFIG.showStreaks && !reduced)
      drawStreaks(dt, Math.floor(lerp(18, 90, clamp(I, 0, 1))));
  } else {
    rippleAcc += dt * 1.4 * (reduced ? 0.35 : 1);   // a calm day
    while (rippleAcc > 1) { rippleAcc -= 1; addRipple(rand(0, W), rand(0, H), rand(30, 80), 0.32); }
    drawRipples(dt);
  }

  rafId = requestAnimationFrame(frame);
}
let rafId = requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    cancelAnimationFrame(rafId);
  } else if (!running) {
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
});

/* ── tap the water ────────────────────────────────────────── */
window.addEventListener('pointerdown', e => {
  if (e.target.closest('a, button, input, textarea, select, .panel, .hero-card, nav')) return;
  const x = e.clientX, y = e.clientY;
  addRipple(x, y, 92, 0.7);
  addRipple(x, y, 56, 0.55, 0.09);
  for (const f of fishes) {
    const dx = f.cx[0] - x, dy = f.cy[0] - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 170) {
      f.boost = Math.min(1.2, f.boost + (1 - dist / 170) * 0.9);
      const away = Math.atan2(dy, dx);
      f.heading += angDiff(away - f.heading) * 0.4;
    }
  }
});

/* ── scroll: the pond settles into the background ─────────── */
const dim = document.getElementById('dim');
let scrollQueued = false;
function applyScroll() {
  scrollQueued = false;
  const vh = window.innerHeight;
  const p = clamp(window.scrollY / (vh * 0.85), 0, 1);
  const base = mqlMobile.matches ? 0.34 : 0;
  dim.style.opacity = (base + (0.74 - base) * p).toFixed(3);
  document.documentElement.classList.toggle('deep', window.scrollY > vh * 0.45);
}
window.addEventListener('scroll', () => {
  if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(applyScroll); }
}, { passive: true });
applyScroll();

/* ── hero typing ──────────────────────────────────────────── */
/* EDIT: your hero lines. c = typed command, o = printed output (HTML ok). */
const HERO_STEPS = [
  { c: 'cat focus.txt' },
  { o: 'deep learning · computer vision · ml systems<br>now exploring: representation learning, efficient training' },
  { c: 'ls' },
  { o: '<a class="dir" href="#projects">projects/</a> <a class="dir" href="#papers">papers/</a> <a class="dir" href="blog.html">ideas/</a> <a class="file" href="#resume">resume.txt</a> <a class="exec" href="#contact">contact.sh*</a>' },
];
const PROMPT = '<span class="d">&gt;</span> ';
const term = document.getElementById('heroTerm');

function typeHero() {
  if (!term) return;
  term.innerHTML = '';
  if (reduced) {
    let html = '';
    for (const s of HERO_STEPS) {
      if (s.c) html += '<div class="prompt-line">' + PROMPT + s.c + '</div>';
      else html += '<div class="out">' + s.o + '</div>';
    }
    html += '<div class="prompt-line">' + PROMPT + '<span class="cursor"></span></div>';
    term.innerHTML = html;
    return;
  }
  let i = 0;
  const next = () => {
    if (i >= HERO_STEPS.length) {
      const fin = document.createElement('div');
      fin.className = 'prompt-line';
      fin.innerHTML = PROMPT + '<span class="cursor"></span>';
      term.appendChild(fin);
      return;
    }
    const s = HERO_STEPS[i++];
    if (s.c) {
      const line = document.createElement('div');
      line.className = 'prompt-line';
      line.innerHTML = PROMPT + '<span class="cmd"></span><span class="cursor"></span>';
      term.appendChild(line);
      const cmd = line.querySelector('.cmd');
      let k = 0;
      const tick = () => {
        if (k < s.c.length) {
          cmd.textContent += s.c[k++];
          setTimeout(tick, 26 + Math.random() * 38);
        } else {
          line.querySelector('.cursor').remove();
          setTimeout(next, 260);
        }
      };
      setTimeout(tick, 120);
    } else {
      const out = document.createElement('div');
      out.className = 'out';
      out.innerHTML = s.o;
      out.style.opacity = '0';
      out.style.transition = 'opacity .35s ease';
      term.appendChild(out);
      requestAnimationFrame(() => { out.style.opacity = '1'; });
      setTimeout(next, 220);
    }
  };
  setTimeout(next, 500);
}
typeHero();

/* ── nav: highlight the section in view ───────────────────── */
const navlinks = [...document.querySelectorAll('.navlink')];
const spy = new IntersectionObserver(entries => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const id = '#' + en.target.id;
    navlinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === id));
  }
}, { rootMargin: '-40% 0px -55% 0px' });
['home', 'projects', 'papers', 'resume', 'contact']
  .forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });

/* ── day / night ──────────────────────────────────────────── */
const themeBtn = document.getElementById('themeBtn');
function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? '\u2600 day' : '\u263e night';
  themeBtn.setAttribute('aria-pressed', String(t === 'light'));
  try { localStorage.setItem('pond-theme', t); } catch (e) { /* preview sandboxes */ }
}
themeBtn.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
let savedTheme = null;
try { savedTheme = localStorage.getItem('pond-theme'); } catch (e) {}
if (savedTheme === 'light') applyTheme('light');

})();

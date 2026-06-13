/* ════════════════════════════════════════════════════════════
   the quiet pond · night rain by default, paper water by day
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  rainAmount: 0.85,   // night mode: 0 = still … 1.5 = downpour
  showStreaks: true,
  schoolSize: 30,     // how many small fish in the school
};

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sceneOff = matchMedia('(max-width: 680px)');

/* ── palettes for the scene ───────────────────────────────── */
const PAL = {
  dark: {
    night: true,
    pad: '#22362f', padStroke: 'rgba(0,0,0,0.35)', vein: 'rgba(6,16,13,0.5)',
    drop: 'rgba(205,228,213,', rim: 'rgba(160,220,190,0.07)',
    padShadow: 'rgba(2,8,7,0.32)',
    ripple: 'rgba(190,230,210,', glint: 'rgba(220,245,230,',
    caustic: 'rgba(120,200,170,0.035)', causticComp: 'lighter',
    fishRGB: [186, 208, 195], bgRGB: [8, 18, 15],
    fishShadow: 'rgba(2,8,7,0.28)',
  },
  light: {
    night: false,
    pad: '#9fb785', padStroke: 'rgba(70,90,55,0.35)', vein: 'rgba(74,96,60,0.45)',
    drop: 'rgba(255,255,255,', rim: 'rgba(255,255,255,0.5)',
    padShadow: 'rgba(96,112,92,0.18)',
    ripple: 'rgba(70,130,112,', glint: 'rgba(255,255,255,',
    caustic: 'rgba(110,185,160,0.06)', causticComp: 'source-over',
    fishRGB: [63, 86, 77], bgRGB: [255, 254, 251],
    fishShadow: 'rgba(96,112,92,0.16)',
  },
};
let theme = 'dark';

const cv = document.getElementById('pond');
const ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;

/* ── night floor (built once per resize) ──────────────────── */
const floorCv = document.createElement('canvas');
function buildFloor() {
  const s = 0.25;
  floorCv.width = Math.max(2, Math.floor(W * s));
  floorCv.height = Math.max(2, Math.floor(H * s));
  const f = floorCv.getContext('2d');
  f.clearRect(0, 0, floorCv.width, floorCv.height);
  for (let i = 0; i < 90; i++) {
    f.beginPath();
    f.ellipse(rand(0, floorCv.width), rand(0, floorCv.height),
      rand(8, 46), rand(6, 30), rand(0, TAU), 0, TAU);
    f.fillStyle = `rgba(3,14,12,${rand(0.05, 0.16)})`;
    f.fill();
  }
  for (let i = 0; i < 26; i++) {
    f.beginPath();
    f.ellipse(rand(0, floorCv.width), rand(0, floorCv.height),
      rand(4, 14), rand(3, 9), rand(0, TAU), 0, TAU);
    f.fillStyle = `rgba(125,180,150,${rand(0.025, 0.06)})`;
    f.fill();
  }
}

function drawBackground() {
  if (theme === 'dark') {
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
  } else {
    ctx.clearRect(0, 0, W, H);   // paper shows through
  }
}

/* ── drifting light / water pools ─────────────────────────── */
const caustics = [0, 1, 2].map(i => ({ s: rand(0, 9), r: rand(170, 320), i }));
function drawCaustics(t) {
  const pal = PAL[theme];
  ctx.globalCompositeOperation = pal.causticComp;
  for (const c of caustics) {
    const x = W * (0.5 + 0.38 * Math.sin(t * 0.021 + c.s * 2.1));
    const y = H * (0.5 + 0.34 * Math.cos(t * 0.016 + c.s * 1.3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
    g.addColorStop(0, pal.caustic);
    g.addColorStop(1, pal.caustic.replace(/[\d.]+\)$/, '0)'));
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
  { rx: 0.91, ry: 0.10, r: 70, s: 1.2 },
  { rx: 0.05, ry: 0.30, r: 50, s: 4.7 },
  { rx: 0.86, ry: 0.84, r: 62, s: 7.9 },
  { rx: 0.16, ry: 0.97, r: 46, s: 2.9 },
];
let pads = [];
function placePads() {
  pads = padSpec.map(p => {
    const sp = [];
    const ns = 10 + Math.floor(rand(0, 9));
    for (let i = 0; i < ns; i++) {
      const a = rand(0.4, TAU - 0.4), rr = Math.sqrt(rand(0.03, 0.9)) * p.r;
      sp.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, s: rand(0.6, 1.7), al: rand(0.05, 0.15) });
    }
    return { x: p.rx * W, y: p.ry * H, r: p.r, s: p.s, a0: rand(0, TAU), sp };
  });
}
function drawPads(t) {
  const pal = PAL[theme];
  for (const p of pads) {
    const rot = p.a0 + Math.sin(t * 0.22 + p.s) * 0.03;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath(); ctx.ellipse(4, 6, p.r, p.r * 0.94, 0, 0, TAU);
    ctx.fillStyle = pal.padShadow; ctx.fill();
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, p.r, 0.26, TAU - 0.26);
    ctx.closePath();
    ctx.fillStyle = pal.pad; ctx.fill();
    ctx.strokeStyle = pal.padStroke; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = pal.vein; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = 0.55 + k * ((TAU - 1.1) / 5);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * p.r * 0.92, Math.sin(a) * p.r * 0.92);
      ctx.stroke();
    }
    for (const q of p.sp) {
      ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, TAU);
      ctx.fillStyle = pal.drop + (q.al * (theme === 'light' ? 2.4 : 1)) + ')';
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0.26, TAU - 0.26);
    ctx.strokeStyle = pal.rim; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
}

/* ── the school (boids: separation · alignment · cohesion) ── */
const school = [];
function initSchool() {
  school.length = 0;
  for (let i = 0; i < CONFIG.schoolSize; i++) {
    const a = rand(0, TAU);
    school.push({
      x: rand(W * 0.15, W * 0.85), y: rand(H * 0.15, H * 0.85),
      vx: Math.cos(a), vy: Math.sin(a),
      spd: rand(30, 46), size: rand(0.75, 1.3), d: rand(0, 0.6),
      phase: rand(0, TAU), fx: 0, fy: 0,
    });
  }
}
function mixRGB(a, b, t) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function drawSchool(t, dt) {
  const pal = PAL[theme];
  const slow = reduced ? 0.5 : 1;
  // a lazy waypoint the school loosely wanders after
  const gx = W * (0.5 + 0.34 * Math.sin(t * 0.05));
  const gy = H * (0.5 + 0.30 * Math.sin(t * 0.037 + 1.7));
  for (const f of school) {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
    for (const o of school) {
      if (o === f) continue;
      const dx = o.x - f.x, dy = o.y - f.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 17) { sx -= dx / (dist || 1); sy -= dy / (dist || 1); }
      else if (dist < 56) { ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; n++; }
    }
    let vx = f.vx + sx * 0.09, vy = f.vy + sy * 0.09;
    if (n) {
      vx += (ax / n - f.vx) * 0.05 + (cx / n - f.x) * 0.0016;
      vy += (ay / n - f.vy) * 0.05 + (cy / n - f.y) * 0.0016;
    }
    vx += (gx - f.x) * 0.00022 + f.fx * 0.14;
    vy += (gy - f.y) * 0.00022 + f.fy * 0.14;
    const m = 76;
    if (f.x < m) vx += (m - f.x) * 0.0024;
    if (f.x > W - m) vx -= (f.x - (W - m)) * 0.0024;
    if (f.y < m) vy += (m - f.y) * 0.0024;
    if (f.y > H - m) vy -= (f.y - (H - m)) * 0.0024;
    const vm = Math.hypot(vx, vy) || 1;
    f.vx = vx / vm; f.vy = vy / vm;
    const flee = Math.hypot(f.fx, f.fy);
    const sp = f.spd * (1 + flee * 1.6) * slow;
    f.x += f.vx * sp * dt; f.y += f.vy * sp * dt;
    f.fx *= Math.pow(0.25, dt); f.fy *= Math.pow(0.25, dt);
    f.phase += dt * (7 + sp * 0.09);

    // draw — a small teardrop with a flicking tail
    const ang = Math.atan2(f.vy, f.vx);
    const s = f.size * (1 - f.d * 0.42);
    const L = 13 * s, Wd = 4.4 * s;
    const k = (theme === 'dark' ? 0.16 : 0.10) + f.d * 0.52;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(ang);
    ctx.fillStyle = pal.fishShadow;
    ctx.beginPath(); ctx.ellipse(1.5, 2.2, L * 0.55, Wd * 0.6, 0, 0, TAU); ctx.fill();
    const wag = Math.sin(f.phase) * 0.55;
    ctx.fillStyle = mixRGB(pal.fishRGB, pal.bgRGB, k);
    ctx.beginPath();
    ctx.moveTo(L * 0.55, 0);
    ctx.quadraticCurveTo(L * 0.20, -Wd, -L * 0.45, -Wd * 0.22);
    ctx.quadraticCurveTo(-L * 0.52, 0, -L * 0.45, Wd * 0.22);
    ctx.quadraticCurveTo(L * 0.20, Wd, L * 0.55, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-L * 0.42, 0);
    ctx.lineTo(-L * 0.78, -Wd * 0.5 + wag * Wd * 0.5);
    ctx.lineTo(-L * 0.70, wag * Wd * 0.4);
    ctx.lineTo(-L * 0.78, Wd * 0.5 + wag * Wd * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ── ripples ──────────────────────────────────────────────── */
const ripples = [];
function addRipple(x, y, maxR = rand(26, 70), a0 = 0.5, delay = 0) {
  if (ripples.length > 150) ripples.shift();
  ripples.push({ x, y, r: 1.5, maxR, a0, delay });
}
function drawRipples(dt) {
  const pal = PAL[theme];
  ctx.lineWidth = 1;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const p = ripples[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.r += ((p.maxR - p.r) * 1.7 + 16) * dt;
    const a = Math.max(0, p.a0 * (1 - p.r / p.maxR));
    if (p.r >= p.maxR * 0.985) { ripples.splice(i, 1); continue; }
    ctx.strokeStyle = pal.ripple + a + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pal.ripple + (a * 0.55) + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.62, 0, TAU); ctx.stroke();
    if (p.r < 6) {
      ctx.fillStyle = pal.glint + a + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, TAU); ctx.fill();
    }
  }
}

/* ── night rain streaks ───────────────────────────────────── */
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

/* ── resize ───────────────────────────────────────────────── */
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildFloor(); placePads(); initMotes(); initStreaks(); initSchool();
}
window.addEventListener('resize', resize);
resize();

/* ── main loop ────────────────────────────────────────────── */
let last = performance.now(), T = 0, running = true, rippleAcc = 0;
function frame(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; T += dt;

  if (!sceneOff.matches) {
    drawBackground();
    drawCaustics(T);
    if (theme === 'dark') drawMotes(T, dt);
    drawSchool(T, dt);
    drawPads(T);

    if (theme === 'dark') {
      const I = clamp(0.55 + 0.35 * Math.sin(T * 0.043) + 0.15 * Math.sin(T * 0.013 + 2), 0.12, 1)
                * CONFIG.rainAmount;
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
  if (e.target.closest('a, button, input, textarea, select, .page, footer')) return;
  addRipple(e.clientX, e.clientY, 92, theme === 'dark' ? 0.7 : 0.4);
  addRipple(e.clientX, e.clientY, 56, theme === 'dark' ? 0.55 : 0.3, 0.09);
  for (const f of school) {
    const dx = f.x - e.clientX, dy = f.y - e.clientY;
    const dist = Math.hypot(dx, dy);
    if (dist < 240) {
      const k = (1 - dist / 240) * 1.5;
      f.fx += (dx / (dist || 1)) * k;
      f.fy += (dy / (dist || 1)) * k;
    }
  }
});

/* ── day / night toggle ───────────────────────────────────── */
const themeBtn = document.getElementById('themeBtn');
function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? '☀ day' : '☾ night';
  themeBtn.setAttribute('aria-pressed', String(t === 'light'));
  try { localStorage.setItem('pond-theme', t); } catch (e) { /* preview sandboxes */ }
}
themeBtn.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
let saved = null;
try { saved = localStorage.getItem('pond-theme'); } catch (e) {}
if (saved === 'light') applyTheme('light');

})();

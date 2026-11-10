/* ════════════════════════════════════════════════════════════
   ideas.js · a school of small fish
   Boids: each fish keeps its distance (separation), matches its
   neighbours' heading (alignment) and drifts towards them
   (cohesion).
   Used on the ideas page and on posts. The water lives in pond.js.
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const P = window.Pond;
if (!P) return;

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  schoolSize: 30,     // how many small fish (small screens get fewer)
};

const { ctx, TAU, rand, lerp, reduced } = P;
const school = [];

function stock(W, H) {
  school.length = 0;
  const n = Math.round(CONFIG.schoolSize * (Math.min(W, H) < 560 ? 0.6 : 1));
  const o = P.openWater();
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    school.push({
      x: o ? o.x + rand(-0.35, 0.35) * o.w : rand(W * 0.15, W * 0.85),
      y: o ? o.y + rand(-0.35, 0.35) * o.h : rand(H * 0.15, H * 0.85),
      vx: Math.cos(a), vy: Math.sin(a),
      spd: rand(30, 46), size: rand(0.75, 1.3), d: rand(0, 0.6),
      phase: rand(0, TAU), fx: 0, fy: 0,
    });
  }
}

function update(dt, t) {
  const W = P.W, H = P.H;
  const slow = reduced ? 0.5 : 1;
  // a lazy waypoint the school loosely wanders after, kept over open water
  const o = P.openWater() || { x: W * 0.5, y: H * 0.5, w: W, h: H };
  const gx = o.x + o.w * 0.34 * Math.sin(t * 0.05);
  const gy = o.y + o.h * 0.30 * Math.sin(t * 0.037 + 1.7);
  for (const f of school) {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
    for (const q of school) {
      if (q === f) continue;
      const dx = q.x - f.x, dy = q.y - f.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 17) { sx -= dx / (dist || 1); sy -= dy / (dist || 1); }
      else if (dist < 56) { ax += q.vx; ay += q.vy; cx += q.x; cy += q.y; n++; }
    }
    let vx = f.vx + sx * 0.09, vy = f.vy + sy * 0.09;
    if (n) {
      vx += (ax / n - f.vx) * 0.05 + (cx / n - f.x) * 0.0016;
      vy += (ay / n - f.vy) * 0.05 + (cy / n - f.y) * 0.0016;
    }
    vx += (gx - f.x) * 0.00022 + f.fx * 0.14;
    vy += (gy - f.y) * 0.00022 + f.fy * 0.14;
    // come out from under the paper
    const out = P.wayOut(f.x, f.y, 14);
    if (out !== null) { vx += Math.cos(out) * 0.05; vy += Math.sin(out) * 0.05; }
    // stay in the pond
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
  }
}

function mix(a, b, t) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

function draw() {
  const S = P.scene;
  for (const f of school) { // a small teardrop with a flicking tail
    const ang = Math.atan2(f.vy, f.vx);
    const s = f.size * (1 - f.d * 0.42);
    const L = 13 * s, Wd = 4.4 * s;
    const k = (S.night ? 0.16 : 0.10) + f.d * 0.52;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(ang);
    ctx.fillStyle = S.smallFishShadow;
    ctx.beginPath(); ctx.ellipse(1.5, 2.2, L * 0.55, Wd * 0.6, 0, 0, TAU); ctx.fill();
    const wag = Math.sin(f.phase) * 0.55;
    ctx.fillStyle = mix(S.smallFish, S.tintT, k);
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

P.add({
  resize(W, H) {
    if (!school.length) { stock(W, H); return; }
    for (const f of school) { f.x = Math.min(f.x, W - 10); f.y = Math.min(f.y, H - 10); }
  },
  update, draw,
  tap(x, y) {
    for (const f of school) {
      const dx = f.x - x, dy = f.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < 240) {
        const k = (1 - dist / 240) * 1.5;
        f.fx += (dx / (dist || 1)) * k;
        f.fy += (dy / (dist || 1)) * k;
      }
    }
  },
});

})();

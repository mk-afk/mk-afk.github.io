/* ════════════════════════════════════════════════════════════
   home.js · the koi
   Procedural: every fish is a chain of 26 points with a body, fins
   and markings drawn around it. No images. The water itself lives
   in pond.js. In Day mode each fish also trails ink: through the
   fluid in water.js where the browser can run it, and as a drawn
   stroke where it cannot.
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const P = window.Pond;
if (!P) return;

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  fishCount: 4,        // 2–5 looks best (small screens get one fewer)
  inkTrails: true,     // Day mode: each koi trails ink that spreads and fades
};

const { ctx, TAU, rand, lerp, clamp, ss, angDiff, reduced } = P;
const pick = list => list[Math.floor(Math.random() * list.length)];

/* ── varieties ────────────────────────────────────────────── */
// ground = the body's colour · finRoot = the side fins and tail are dark where they join the body
// (on a showa that is called motoguro) · the markings are laid out by PATTERNS[name], below
const HI = ['#e2603a', '#d9502c', '#ea7b47'];   // hi: the reds
const SHIRO = '#f3efe4', SUMI = '#26282c';      // white ground, ink black
const FIN = '#f0eadc', RAY = '#9c9482';         // fin membrane, and the fine rays in it
const VARIETIES = [
  { name: 'kohaku', ground: SHIRO, eye: '#23252a' },                 // white, with red in steps down the back
  { name: 'sanke',  ground: SHIRO, eye: '#23252a' },                 // the same, flecked with ink
  { name: 'tancho', ground: SHIRO, eye: '#23252a' },                 // white, with one red crown
  { name: 'showa',  ground: SUMI,  eye: '#0b0c0e', finRoot: SUMI },  // black, wrapped in red and white
  { name: 'utsuri', ground: SUMI,  eye: '#0b0c0e', finRoot: SUMI },  // black and white only
];

/* ── markings ─────────────────────────────────────────────── */
// Each marking is a blot with a wandering edge, pinned to the fish's back:
//   k.blot(colour, u, v, long, wide)   u = how far along the body (0 nose … 1 tail), v = how far across (−1 … 1),
//                                      long = half its length as a share of the body's, wide = half its width in
//                                      body half-widths (over 1 and it wraps down the fish's side)
//   k.spot(colour, u, v, r)            a round one, r in body half-widths at the fish's widest
// Later blots are painted over earlier ones.
const PATTERNS = {
  kohaku(k) {
    const m = [k.blot(pick(HI), rand(0.11, 0.125), rand(-0.1, 0.1), rand(0.06, 0.074), rand(0.6, 0.8), 0.7)];   // a cap on the head, clear of the eyes
    let u = rand(0.27, 0.37);
    for (let i = 0, steps = Math.random() < 0.55 ? 3 : 2; i < steps && u < 0.88; i++) {                          // then two or three saddles
      const long = rand(0.075, 0.125) * (1 - 0.35 * u);
      m.push(k.blot(pick(HI), u, rand(-0.35, 0.35), long, rand(0.85, 1.35)));
      u += long + rand(0.12, 0.2);
    }
    return m;
  },
  sanke(k) {
    const m = PATTERNS.kohaku(k);
    for (let i = 0, flecks = 4 + Math.floor(rand(0, 4)); i < flecks; i++)                                       // ink on the back, never on the head
      m.push(k.spot(SUMI, rand(0.24, 0.86), rand(-0.8, 0.8), rand(0.15, 0.34), rand(1, 1.7)));
    return m;
  },
  tancho(k) { return [k.spot(HI[1], 0.128, 0, 0.64, 1.06, 0.22)]; },                                              // on the crown, behind the eyes
  showa(k) {
    let side = Math.random() < 0.5 ? 1 : -1, red = Math.random() < 0.5, u = rand(0.3, 0.36);
    const m = [
      k.blot(SHIRO, 0.025, -side * rand(0.3, 0.6), 0.062, 0.78, 0.8),                                           // white over one cheek and the nose
      k.blot(pick(HI), rand(0.125, 0.15), side * rand(0.15, 0.4), rand(0.055, 0.07), rand(0.55, 0.75), 0.8),    // red on the crown, off-centre
    ];
    while (u < 0.9) {                                       // red and white by turns, on alternate sides: the black left between them runs in a zigzag
      const long = rand(0.06, 0.1) * (1 - 0.3 * u);
      m.push(k.blot(red ? pick(HI) : SHIRO, u, side * rand(0.2, 0.7), long, rand(0.7, 1.15)));
      u += long + rand(0.1, 0.16); red = !red; side = -side;
    }
    return m;
  },
  utsuri(k) {
    let side = Math.random() < 0.5 ? 1 : -1, u = rand(0.25, 0.31);
    const m = [k.blot(SHIRO, 0.055, side * rand(0.35, 0.6), 0.075, 0.8, 0.8)];                                  // half the face
    while (u < 0.9) {
      side = -side;
      const long = rand(0.07, 0.11) * (1 - 0.3 * u);
      m.push(k.blot(SHIRO, u, side * rand(0.35, 0.8), long, rand(0.75, 1.1)));
      u += long + rand(0.08, 0.13);
    }
    return m;
  },
};
const EDGE = 18;                                 // points round the edge of each blot

/* ── fins ─────────────────────────────────────────────────── */
// A side fin, one unit long, lying along +x from its root at the origin; +y is its trailing edge.
const FAN = new Path2D('M-.06-.09Q.5-.27 .98-.1Q1.13.17 .84.42Q.42.41 0 .17Z');
const FAN_RAYS = new Path2D();
for (const [a, r] of [[-0.07, 0.93], [0.06, 0.98], [0.19, 0.97], [0.31, 0.92], [0.42, 0.85]]) {
  FAN_RAYS.moveTo(Math.cos(a) * 0.2, Math.sin(a) * 0.2); FAN_RAYS.lineTo(Math.cos(a) * r, Math.sin(a) * r);
}
const BEND = 0.24, COS_BEND = Math.cos(BEND), SIN_BEND = Math.sin(BEND);   // the most the body can bend at one joint, in radians

/* ── Day mode's ink, drawn by hand ────────────────────────── */
// (Used when water.js cannot run its fluid.) Each koi trails ink the way a
// loaded brush does in a bowl of water: a soft stroke that spreads, wanders
// and pales, with a few darker threads in it while it is fresh.
const INK = {
  life: 7,                      // seconds a stroke lasts
  width: 5,                     // half its width at the tail, before it spreads
  wash: 0.16,                   // how dark each soft dab is (they overlap, so the stroke is nearly twice this where it is fresh)
  thread: 0.16,                 // how dark the darkest thread is
  colour: 'rgba(30,44,42,',     // sumi: black with a little of the water in it
  step: 3.2,                    // a dab for every so many pixels the tail travels (times the fish's size)
  most: 200,                    // and never more than this many
  nx: new Float32Array(200), ny: new Float32Array(200),
  dab: (() => {                 // one soft dab of the brush
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), soft = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (let i = 0; i <= 8; i++) { const r = i / 8; soft.addColorStop(r, `rgba(30,44,42,${Math.exp(-r * r * 3.4) * (1 - r * r)})`); }
    g.fillStyle = soft; g.fillRect(0, 0, 64, 64);
    return c;
  })(),
};

class Koi {
  constructor(variety, idx, count, scale) {
    this.pal = variety;
    this.size = rand(1.0, 1.3) * scale;
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
    const [x, y] = Koi.startPoint();
    this.cx = new Float32Array(this.n);
    this.cy = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.cx[i] = x - Math.cos(this.heading) * this.segLen * i;
      this.cy[i] = y - Math.sin(this.heading) * this.segLen * i;
    }
    // body half-width profile
    this.w = new Float32Array(this.n);
    this.maxW = 12 * this.size; // plump, photo-koi proportions
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      let f;
      if (t < 0.14) f = lerp(0.55, 0.97, ss(t / 0.14));            // blunt nose
      else if (t < 0.4) f = lerp(0.97, 1, ss((t - 0.14) / 0.26));  // broad back
      else if (t < 0.8) f = lerp(1, 0.26, ss((t - 0.4) / 0.4));    // long taper
      else f = lerp(0.26, 0.11, (t - 0.8) / 0.2);                  // tail stalk
      this.w[i] = f * this.maxW;
    }
    this.marks = PATTERNS[variety.name](this);     // fixed for the fish's life
    this.look = null;                              // its colours, sunk to its depth (see paint)
    // Day mode: the ink it trails. One entry for every few pixels the tail has travelled.
    this.trail = [];
    this.trailN = 0;                               // how many entries have ever been laid down
    this.threads = Array.from({ length: 3 }, (_, i) => ({   // the darker threads in the stroke
      at: (i - 1) * 0.55 + rand(-0.2, 0.2),        // where across the stroke, −1…1
      ink: rand(0.55, 1),
      wide: rand(0.7, 1.5),
      key: rand(0, 99),
    }));
    // scratch buffers for drawing
    this.px = new Float32Array(this.n); this.py = new Float32Array(this.n);
    this.nx = new Float32Array(this.n); this.ny = new Float32Array(this.n);
    this.da = new Float32Array(this.n);
    this.ox = new Float32Array(EDGE); this.oy = new Float32Array(EDGE);
    this.qx = 0; this.qy = 0;
  }

  // one marking: a blot with a wandering edge (see PATTERNS)
  blot(c, u, v, long, wide, rough = 1) {
    const ex = new Float32Array(EDGE), ey = new Float32Array(EDGE);
    const p1 = rand(0, TAU), p2 = rand(0, TAU), p3 = rand(0, TAU);
    const a1 = rand(0.1, 0.2) * rough, a2 = rand(0.06, 0.13) * rough, a3 = rand(0.03, 0.07) * rough;
    for (let k = 0; k < EDGE; k++) {
      const th = k / EDGE * TAU;
      const far = 1 + a1 * Math.sin(2 * th + p1) + a2 * Math.sin(3 * th + p2) + a3 * Math.sin(5 * th + p3);
      ex[k] = Math.cos(th) * far * long; ey[k] = Math.sin(th) * far * wide;
    }
    return { c, u, v, ex, ey };
  }
  spot(c, u, v, r, stretch = 1, rough = 1) {
    const i = Math.round(clamp(u, 0, 1) * (this.n - 1));
    return this.blot(c, u, v, r * this.maxW * stretch / ((this.n - 1) * this.segLen), r * this.maxW / this.w[i], rough);
  }

  // somewhere in open water, not under the paper
  static startPoint() {
    const o = P.openWater();
    for (let k = 0; k < 24; k++) {
      const x = o ? o.x + rand(-0.42, 0.42) * o.w : rand(P.W * 0.15, P.W * 0.9);
      const y = o ? o.y + rand(-0.38, 0.38) * o.h : rand(P.H * 0.15, P.H * 0.85);
      if (!P.underSheet(x, y, 30)) return [x, y];
    }
    return [P.W * 0.6, P.H * 0.4];
  }

  update(dt, t, all) {
    const W = P.W, H = P.H, n = this.n;
    const hx = this.cx[0], hy = this.cy[0];
    // which way it would like to turn, in radians a second. First, wandering:
    let turn = (Math.sin(t * 0.45 + this.seed) * 0.6 + Math.sin(t * 0.17 + this.seed * 1.7) * 0.4) * 0.3;
    // stay in the pond: near an edge, turn back towards open water
    const m = 80 * this.size;
    if (hx < m || hx > W - m || hy < m || hy > H - m) {
      const o = P.openWater();
      const want = Math.atan2((o ? o.y : H * 0.5) - hy, (o ? o.x : W * 0.55) - hx);
      turn += clamp(angDiff(want - this.heading), -1.4, 1.4) * 2.2;
    }
    // come out from under the paper
    const out = P.wayOut(hx, hy, 34 * this.size);
    if (out !== null) turn += clamp(angDiff(out - this.heading), -1.3, 1.3) * 1.7;
    // gentle separation from similar-depth fish
    const near = 70 * this.size;
    for (const o of all) {
      if (o === this) continue;
      const dx = hx - o.cx[0], dy = hy - o.cy[0];
      const d2 = dx * dx + dy * dy;
      if (d2 < near * near && Math.abs(o.depth - this.depth) < 0.28) {
        const away = Math.atan2(dy, dx);
        turn += clamp(angDiff(away - this.heading), -1, 1) * 1.3;
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
      P.addRipple(hx, hy, 26, 0.45, 0);
      P.addRipple(hx, hy, 36, 0.4, 0.22);
      P.addRipple(hx, hy, 20, 0.32, 0.45);
    }
    this.gulp = Math.max(0, this.gulp - dt * 0.8);
    this.boost = Math.max(0, this.boost - this.boost * dt * 2.1);
    const spd = (13 + 13 * this.spdMod) * this.size * (1 + this.boost * 1.7) * (reduced ? 0.55 : 1)
                * (P.season === 'winter' ? 0.7 : 1);       // koi go sluggish in the cold
    this.phase += dt * (2 + spd * 0.05);
    // a koi cannot turn on the spot: it swims no tighter a circle than its body could bend round
    const most = spd / (20 * this.size);
    this.heading += clamp(turn, -most, most) * dt;
    // move head, body follows
    const mx = Math.cos(this.heading) * spd * dt, my = Math.sin(this.heading) * spd * dt;
    this.cx[0] += mx; this.cy[0] += my;
    if (this.depth < 0.7) P.stir(hx, hy, mx, my, 42 * this.size);   // near the surface, it nudges whatever floats above
    let bx = -Math.cos(this.heading), by = -Math.sin(this.heading);   // which way the last link pointed, head to tail
    for (let i = 1; i < n; i++) {
      let dx = this.cx[i] - this.cx[i - 1], dy = this.cy[i] - this.cy[i - 1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      if (dx * bx + dy * by < COS_BEND) {                 // a spine only bends so far at each joint
        const k = bx * dy - by * dx < 0 ? -SIN_BEND : SIN_BEND;
        dx = bx * COS_BEND - by * k; dy = by * COS_BEND + bx * k;
      }
      this.cx[i] = this.cx[i - 1] + dx * this.segLen;
      this.cy[i] = this.cy[i - 1] + dy * this.segLen;
      bx = dx; by = dy;
    }
    // the ink it leaves by day
    if (CONFIG.inkTrails) {
      const b = n - 1, tr = this.trail, well = P.inkwell;
      let fx = this.cx[b - 1] - this.cx[b], fy = this.cy[b - 1] - this.cy[b];
      const L = Math.hypot(fx, fy) || 1;
      fx /= L; fy /= L;
      const swing = this.phase - b * 0.52, reach = this.wag() * 0.7;      // most of the sway the tail is drawn with
      const x = this.cx[b] - fy * reach * Math.sin(swing), y = this.cy[b] + fx * reach * Math.sin(swing);
      const press = 0.72 + 0.45 * s * s + this.boost * 0.5;               // how hard the brush is pressing
      if (well && well.live) {
        if (!P.night) {
          // into the fluid: the ink, the tail's push on the water (a little backwards), and the turn each sweep of it leaves behind
          const beat = reach * Math.cos(swing) * (2 + spd * 0.05);        // how fast the tail is crossing the fish's path
          const fitful = 0.9 + 0.55 * Math.sin(t * 0.83 + this.seed) * Math.sin(t * 0.31 + this.seed * 2.1);   // no two sweeps stir it quite alike
          well.add(x, y, -fy, fx, -fx * spd * 0.12, -fy * spd * 0.12, beat * fitful, press * clamp(1 - this.depth * 0.55, 0, 1), this.size);
        }
        if (tr.length) tr.length = 0;
      } else {
        const last = tr[tr.length - 1];
        if (!last || Math.hypot(x - last[0], y - last[1]) >= INK.step * this.size) {
          tr.push([x, y, t, press, this.trailN++]);                       // where, when, how hard, and a serial number
          if (tr.length > INK.most) tr.shift();
        }
        while (tr.length > 2 && t - tr[0][2] > INK.life) tr.shift();
      }
    }
  }

  // how far the body swings from side to side
  wag() { return (0.8 + 1.2 * this.spdMod + this.boost * 1.6) * this.size * (reduced ? 0.6 : 1); }

  // Day mode: the ink this fish has trailed, drawn by hand (see INK, above)
  drawTrail(t) {
    const tr = this.trail, m = tr.length;
    if (m < 6) return;
    const sz = this.size, fade = clamp(1 - this.depth * 0.55, 0, 1), seed = this.seed;
    const nx = INK.nx, ny = INK.ny;
    for (let i = 0; i < m; i++) {                                         // which way is "across" at each point
      const a = tr[Math.max(0, i - 2)], b = tr[Math.min(m - 1, i + 2)];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / L; ny[i] = dx / L;
    }
    ctx.save();
    for (let i = 0; i < m; i++) {                                         // the wash: one soft dab at each point
      const q = tr[i];
      const u = clamp((t - q[2]) / INK.life, 0, 1);
      const sparse = u > 0.45;                                            // once the dabs have spread, every other one will do
      if (sparse && (q[4] & 1)) continue;
      const a = INK.wash * ss(clamp(u / 0.06, 0, 1)) * Math.pow(1 - u, 1.5) * fade * (sparse ? 2 : 1);
      if (a < 0.004) continue;                                            // too faint to see
      const r = INK.width * sz * q[3] * (1.05 + 1.5 * u);                 // it spreads…
      const stray = Math.sin(q[4] * 0.21 + seed) * Math.sin(q[4] * 0.057 + seed * 1.7) * 11 * sz * Math.pow(u, 1.3);   // …and wanders off its line
      ctx.globalAlpha = a;
      ctx.drawImage(INK.dab, q[0] + nx[i] * stray - r, q[1] + ny[i] * stray - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const h of this.threads) {
      ctx.lineWidth = h.wide * sz * 0.7;
      let i = 0;
      while (i < m - 1) {                                                 // in short runs, so each can fade at its own pace
        const run = Math.floor(tr[i][4] / 6);
        let j = i;
        while (j < m - 1 && Math.floor(tr[j][4] / 6) === run) j++;
        const age = (t - tr[(i + j) >> 1][2]) / INK.life;                 // 0 just laid down … 1 gone
        const strength = ss(clamp(age / 0.05, 0, 1)) * Math.pow(clamp(1 - age / 0.7, 0, 1), 1.4);   // the threads go before the wash does
        if (strength > 0.01) {
          ctx.strokeStyle = INK.colour + (INK.thread * h.ink * strength * fade).toFixed(3) + ')';
          ctx.beginPath();
          for (let k = i; k <= j; k++) {
            const q = tr[k], u = clamp((t - q[2]) / INK.life, 0, 1);
            const off = INK.width * sz * q[3] * (0.5 + 0.9 * u) * h.at
                      + Math.sin(q[4] * 0.16 + h.key) * Math.sin(q[4] * 0.049 + h.key * 2.3) * 13 * sz * Math.pow(u, 1.2);
            const x = q[0] + nx[k] * off, y = q[1] + ny[k] * off;
            if (k === i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        i = j;
      }
    }
    ctx.restore();
  }

  // its colours, sunk to its depth: worked out once, and again only when Night and Day change over
  paint() {
    const S = P.scene, d = this.depth, v = this.pal;
    if (this.look && this.look.night === S.night) return this.look;
    const L = { night: S.night, ground: P.tint(v.ground, d), eye: P.tint(v.eye, d), ray: P.tint(RAY, d, 0.5),
                marks: this.marks.map(b => P.tint(b.c, d)),
                ridge: v.ground === SUMI ? 'rgba(236,236,226,' : 'rgba(18,24,28,',
                gill: v.ground === SUMI ? 'rgba(236,236,226,0.06)' : 'rgba(18,24,28,0.13)' };
    // fins are translucent: densest at the root, thin at the edge
    L.fan = ctx.createRadialGradient(0, 0, 0.06, 0, 0, 1.06);
    L.tail = ctx.createLinearGradient(0, 0, 1, 0);
    if (v.finRoot) {
      for (const g of [L.fan, L.tail]) {
        g.addColorStop(0, P.tint(v.finRoot, d, 0.9)); g.addColorStop(0.3, P.tint(v.finRoot, d, 0.72));
        g.addColorStop(0.52, P.tint(FIN, d, 0.6)); g.addColorStop(1, P.tint(FIN, d, 0.24));
      }
    } else {
      for (const g of [L.fan, L.tail]) { g.addColorStop(0, P.tint(FIN, d, 0.86)); g.addColorStop(0.5, P.tint(FIN, d, 0.6)); g.addColorStop(1, P.tint(FIN, d, 0.24)); }
    }
    return (this.look = L);
  }

  // where a spot on the fish's back is on the screen: u along it (0 nose … 1 tail), v across it (−1 … 1). The answer is left in qx, qy.
  at(u, v) {
    const n1 = this.n - 1, f = clamp(u, 0, 1) * n1, i = Math.min(n1 - 1, f | 0), t = f - i;
    const wv = (this.w[i] + (this.w[i + 1] - this.w[i]) * t) * v;
    this.qx = this.px[i] + (this.px[i + 1] - this.px[i]) * t + (this.nx[i] + (this.nx[i + 1] - this.nx[i]) * t) * wv;
    this.qy = this.py[i] + (this.py[i + 1] - this.py[i]) * t + (this.ny[i] + (this.ny[i + 1] - this.ny[i]) * t) * wv;
    if (u < 0) { this.qx -= Math.cos(this.da[0]) * u * n1 * this.segLen; this.qy -= Math.sin(this.da[0]) * u * n1 * this.segLen; }   // ahead of the first point: out along the nose
  }

  // one side fin: `side` is +1 or −1, `i` the point of the spine it grows from, `inset` how far in from the body's edge
  // its root lies, `spread` its angle out from the body, `long` its length
  fin(L, side, i, inset, spread, long, outline) {
    const sz = this.size;
    ctx.save();
    ctx.translate(this.px[i] + this.nx[i] * this.w[i] * inset * side, this.py[i] + this.ny[i] * this.w[i] * inset * side);
    ctx.rotate(this.da[i] + Math.PI - side * spread);
    ctx.scale(long, long * side);
    ctx.fillStyle = L.fan;
    ctx.fill(FAN);
    ctx.lineWidth = 0.5 * sz / long;
    ctx.strokeStyle = L.ray;
    ctx.stroke(FAN_RAYS);
    if (outline) { ctx.lineWidth = 0.8 * sz / long; ctx.strokeStyle = outline; ctx.stroke(FAN); }
    ctx.restore();
  }

  draw() {
    const S = P.scene, L = this.paint();
    const n = this.n, sz = this.size, d = this.depth, e = n - 1;
    const fade = clamp((1 - d * 0.5) * (1 + this.gulp * 0.15), 0, 1);
    const scaleD = (1 - d * 0.22) * (1 + this.gulp * 0.06);
    // 1) chain normals → wave-displaced spine
    const amp = this.wag();
    for (let i = 0; i < n; i++) {
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      let fx = this.cx[ia] - this.cx[ib], fy = this.cy[ia] - this.cy[ib];
      const len = Math.hypot(fx, fy) || 1; fx /= len; fy /= len;
      const env = 0.12 + 0.88 * Math.pow(i / (n - 1), 1.5);
      const lat = Math.sin(this.phase - i * 0.52) * amp * env;
      this.px[i] = this.cx[i] + (-fy) * lat;
      this.py[i] = this.cy[i] + (fx) * lat;
    }
    // 2) final tangents/normals from displaced spine
    for (let i = 0; i < n; i++) {
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      let fx = this.px[ia] - this.px[ib], fy = this.py[ia] - this.py[ib];
      const len = Math.hypot(fx, fy) || 1; fx /= len; fy /= len;
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
    ctx.fillStyle = S.koiShadow;
    ctx.globalAlpha = fade * 0.42;
    ctx.translate(off * 0.6, off);
    ctx.fill(body);
    ctx.translate(off * 0.18, off * 0.25);
    ctx.globalAlpha = fade * 0.18;
    ctx.fill(body);
    ctx.restore();

    const edge = S.finEdge + (S.finEdgeA * (1 - d * 0.6)).toFixed(3) + ')';   // a fine line round each fin, so pale fins hold their shape on pale water

    // tail fin (behind the body): two lobes that follow the stalk's swing, their tips a beat behind their root
    {
      const ph = this.phase - n * 0.52, give = 0.36 * (reduced ? 0.6 : 1);
      const s0 = give * Math.sin(ph - 0.5), s1 = give * Math.sin(ph - 0.95), s2 = give * Math.sin(ph - 1.4);
      const open = 0.4 + 0.05 * Math.sin(this.phase * 0.7 + this.seed), tl = 25 * sz;
      ctx.save();
      ctx.translate(px[e], py[e]); ctx.rotate(da[e] + Math.PI); ctx.scale(tl, tl);
      ctx.globalAlpha = fade * (S.night ? 0.7 : 0.92);
      ctx.beginPath();
      ctx.moveTo(-0.1, 0.055);
      ctx.quadraticCurveTo(0.52 * Math.cos(open + 0.44 + s0), 0.52 * Math.sin(open + 0.44 + s0), Math.cos(open + s2), Math.sin(open + s2));
      ctx.quadraticCurveTo(0.8 * Math.cos(open - 0.1 + s1), 0.8 * Math.sin(open - 0.1 + s1), 0.6 * Math.cos(s1), 0.6 * Math.sin(s1));
      ctx.quadraticCurveTo(0.8 * Math.cos(-open + 0.1 + s1), 0.8 * Math.sin(-open + 0.1 + s1), Math.cos(-open + s2), Math.sin(-open + s2));
      ctx.quadraticCurveTo(0.52 * Math.cos(-open - 0.44 + s0), 0.52 * Math.sin(-open - 0.44 + s0), -0.1, -0.055);
      ctx.closePath();
      ctx.fillStyle = L.tail;
      ctx.fill();
      ctx.lineWidth = 0.8 * sz / tl; ctx.strokeStyle = edge; ctx.stroke();
      ctx.beginPath();                                              // its rays, fanning out from the stalk
      for (const side of [1, -1]) {
        for (const [a, r] of [[side * (open + 0.13) + (s0 + s2) / 2, 0.64], [side * open + s2, 0.9], [side * open * 0.62 + (s1 + s2) / 2, 0.74], [side * open * 0.3 + s1, 0.62]]) {
          ctx.moveTo(0.1 * Math.cos(a), 0.1 * Math.sin(a)); ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
      }
      ctx.moveTo(0.1 * Math.cos(s1), 0.1 * Math.sin(s1)); ctx.lineTo(0.55 * Math.cos(s1), 0.55 * Math.sin(s1));
      ctx.lineWidth = 0.5 * sz / tl; ctx.strokeStyle = L.ray; ctx.stroke();
      ctx.restore();
    }

    // side fins (behind the body too). They open as the fish glides and fold back as it kicks;
    // in a turn the inside fin is held out and the outside one tucked in.
    {
      const turning = clamp(angDiff(da[1] - da[8]) * 0.9, -0.4, 0.4);
      const glide = 1 - (this.spdMod - 0.7) / 0.3;                  // 0 mid-kick … 1 gliding
      for (const side of [1, -1]) {
        const scull = 0.07 * Math.sin(this.phase * 1.1 + (side > 0 ? 0 : 2.1));
        ctx.globalAlpha = fade * 0.8;                               // pelvic fins: small, mostly under the belly
        this.fin(L, side, 12, 0.5, 0.42 + 0.14 * glide + scull, 10.5 * sz, edge);
        ctx.globalAlpha = fade;                                     // pectoral fins
        this.fin(L, side, 5, 0.7, clamp(0.6 + 0.4 * glide - 0.3 * this.boost + side * turning + scull, 0.3, 1.25), 19 * sz, edge);
      }
    }
    ctx.globalAlpha = fade;

    // body
    ctx.fillStyle = L.ground;
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    // markings ride the spine, clipped to the body
    const ox = this.ox, oy = this.oy, n1 = n - 1, noseX = Math.cos(da[0]) * n1 * this.segLen, noseY = Math.sin(da[0]) * n1 * this.segLen;
    for (let m = 0; m < this.marks.length; m++) {
      const b = this.marks[m];
      for (let k = 0; k < EDGE; k++) {
        const u = b.u + b.ex[k], f = clamp(u, 0, 1) * n1, i = Math.min(n1 - 1, f | 0), t = f - i;
        const wv = (w[i] + (w[i + 1] - w[i]) * t) * (b.v + b.ey[k]);
        ox[k] = px[i] + (px[i + 1] - px[i]) * t + (nx[i] + (nx[i + 1] - nx[i]) * t) * wv;
        oy[k] = py[i] + (py[i + 1] - py[i]) * t + (ny[i] + (ny[i + 1] - ny[i]) * t) * wv;
        if (u < 0) { ox[k] -= noseX * u; oy[k] -= noseY * u; }                // ahead of the first point: out along the nose
      }
      ctx.beginPath();
      ctx.moveTo((ox[EDGE - 1] + ox[0]) / 2, (oy[EDGE - 1] + oy[0]) / 2);
      for (let k = 0; k < EDGE; k++) {
        const j = k + 1 === EDGE ? 0 : k + 1;
        ctx.quadraticCurveTo(ox[k], oy[k], (ox[k] + ox[j]) / 2, (oy[k] + oy[j]) / 2);
      }
      ctx.fillStyle = L.marks[m];
      ctx.fill();
    }
    // gill covers: a faint curve behind each eye
    ctx.strokeStyle = L.gill;
    ctx.lineWidth = 0.9 * sz; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const side of [1, -1]) {
      this.at(0.148, side * 0.99); ctx.moveTo(this.qx, this.qy);
      this.at(0.208, side * 0.8); const mx = this.qx, my = this.qy;
      this.at(0.182, side * 0.36); ctx.quadraticCurveTo(mx, my, this.qx, this.qy);
    }
    ctx.stroke();
    // shade into the water: a darker rim where the body rounds away, and a head→tail dissolve
    ctx.strokeStyle = S.rim + (S.rimA * (1 - d * 0.5)).toFixed(3) + ')';
    ctx.lineWidth = 7 * sz;
    ctx.stroke(body); // straddles the outline; the outer half is clipped away
    ctx.strokeStyle = S.murk + (0.16 + d * 0.3) + ')';
    ctx.lineWidth = (2.2 + 2.8 * d) * sz;
    ctx.stroke(body);
    const wg = ctx.createLinearGradient(px[0], py[0], px[n - 1], py[n - 1]);
    wg.addColorStop(0, S.murk + '0)');
    wg.addColorStop(0.5, S.murk + (0.06 + d * 0.1) + ')');
    wg.addColorStop(1, S.murk + (S.sink + d * 0.2).toFixed(3) + ')');
    ctx.fillStyle = wg;
    ctx.fill(body);
    if (S.night && d < 0.55) { // a touch of surface light on the back, near the head
      const sg = ctx.createRadialGradient(px[4], py[4], 0, px[4], py[4], w[4] * 2.6);
      sg.addColorStop(0, `rgba(235,246,238,${0.12 * (1 - d * 1.6)})`);
      sg.addColorStop(1, 'rgba(235,246,238,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg; ctx.fill(body);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // dorsal fin: from above it is a blade seen on edge, leaning one way and then the other as the body swings
    ctx.fillStyle = L.ridge + '0.12)';
    ctx.beginPath();
    ctx.moveTo(px[9], py[9]);
    for (let i = 10; i <= 17; i++) ctx.lineTo(px[i], py[i]);
    for (let i = 17; i >= 9; i--) {
      const lean = Math.sin(Math.PI * Math.pow((i - 9) / 8, 0.6)) * 3.6 * sz * Math.sin(this.phase - i * 0.52 - 1.2);   // tallest a third of the way back
      ctx.lineTo(px[i] + nx[i] * lean, py[i] + ny[i] * lean);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = L.ridge + '0.14)';
    ctx.lineWidth = 1 * sz; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px[8], py[8]);
    for (let i = 9; i <= 18; i++) ctx.lineTo(px[i], py[i]);
    ctx.stroke();
    // eyes
    ctx.fillStyle = L.eye;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(px[1] + nx[1] * w[1] * 0.62 * side, py[1] + ny[1] * w[1] * 0.62 * side, 1.5 * sz, 0, TAU);
      ctx.fill();
    }
    // soft outline
    ctx.globalAlpha = fade * S.outA;
    ctx.strokeStyle = S.outline;
    ctx.lineWidth = 1 * sz;
    ctx.stroke(body);
    if (S.night && this.pal.ground === SUMI) {      // a black fish in black water: the night catches its edge, or its tail would seem to swim alone
      ctx.globalAlpha = fade * 0.22;
      ctx.strokeStyle = '#b0ccbe';
      ctx.stroke(body);
    }

    ctx.restore();
  }
}

/* ── the pond's residents ─────────────────────────────────── */
let fishes = [];
function stock() {
  const small = Math.min(P.W, P.H) < 560;
  const want = clamp(Math.round(CONFIG.fishCount) - (small ? 1 : 0), 1, 6);
  const scale = clamp(Math.min(P.W, P.H) / 640, 0.9, 1.55);
  const order = VARIETIES.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  fishes = [];
  for (let i = 0; i < want; i++) fishes.push(new Koi(order[i % order.length], i, want, scale));
  fishes.sort((a, b) => b.depth - a.depth); // deepest painted first
}

P.add({
  resize(W, H) {
    if (!fishes.length) { stock(); return; }
    for (const f of fishes) { // nudge anyone left outside back in
      const ox = clamp(f.cx[0], 60, W - 60) - f.cx[0];
      const oy = clamp(f.cy[0], 60, H - 60) - f.cy[0];
      for (let i = 0; i < f.n; i++) { f.cx[i] += ox; f.cy[i] += oy; }
      if (ox || oy) f.trail.length = 0;
    }
  },
  update(dt, t) { for (const f of fishes) f.update(dt, t, fishes); },
  draw(t) {
    if (CONFIG.inkTrails && !P.night) {             // ink first, so none of it lies across a fish
      if (P.inkwell && P.inkwell.live) P.inkwell.draw();
      else for (const f of fishes) f.drawTrail(t);
    }
    for (const f of fishes) f.draw();
  },
  tap(x, y) { // startle whoever is close
    for (const f of fishes) {
      const dx = f.cx[0] - x, dy = f.cy[0] - y;
      const dist = Math.hypot(dx, dy);
      if (dist < 170) {
        f.boost = Math.min(1.2, f.boost + (1 - dist / 170) * 0.9);
        const away = Math.atan2(dy, dx);
        f.heading += angDiff(away - f.heading) * 0.4;
      }
    }
  },
});

})();

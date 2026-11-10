/* ════════════════════════════════════════════════════════════
   water.js · what the graphics card adds (loaded by every page)

     ripples  every ring on the pond bends what lies under it
     ink      by day the koi's ink is run through a small fluid
              simulation, so it curls and drifts as ink does

   Both are extras, written in WebGL. Where the browser has no
   WebGL, or the device cannot keep the pond smooth with them on,
   they switch themselves off and the pond is drawn exactly as it
   is without this file. Deleting this file's <script> line from a
   page does the same.
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';
const P = window.Pond;
if (!P) return;

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  ripples: true,      // rings bend the picture beneath them. false = rings are only drawn, as before
  bend: 5,            // how far a fresh raindrop's ring bends it, in pixels
  ink: true,          // Day mode: the koi's ink flows. false = the drawn trails in home.js
  inkDark: 1,         // how dark the ink is: 0.5 is faint, 2 is heavy
  inkLasts: 3,        // roughly how many seconds it takes to fade
  watchSpeed: true,   // switch both off, for the rest of the visit, on a device that cannot keep up
};

const KEY = 'pond-water';   // remembers for this visit that the device could not keep up
try { if (CONFIG.watchSpeed && sessionStorage.getItem(KEY) === 'off') return; } catch (e) { /* no storage: just try */ }

/* ── small WebGL helpers ──────────────────────────────────── */
const ASK = { antialias: false, depth: false, stencil: false, powerPreference: 'low-power',
              failIfMajorPerformanceCaveat: CONFIG.watchSpeed };   // (that last one: no context at all if it would be drawn without a graphics card)
const WHOLE = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
`;
function build(gl, vert, frag, attribs = ['aPos']) {   // a shader program, with its uniforms looked up by name
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader would not compile');
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vert)); gl.attachShader(prog, make(gl.FRAGMENT_SHADER, frag));
  attribs.forEach((name, i) => gl.bindAttribLocation(prog, i, name));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'shaders would not link');
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u };
}
function wholeScreen(gl) {   // one triangle that covers everything
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
}
function smooth(gl) {        // a picture that is read between its pixels, and not past its edges
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function letGo(gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
// Some browsers, given no graphics card, imitate one in software. That is far too slow for this, so it counts as having none.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
function usable(gl) {
  if (!gl) return false;
  if (!CONFIG.watchSpeed) return true;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (!SOFTWARE.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)))) return true;
  letGo(gl);
  return false;
}

/* ════════ ripples that bend the pond ════════ */
// The finished pond is handed to the graphics card as a picture. A second,
// small picture (the "bend map") records how far each point should be pushed
// sideways: every ring on the pond is stamped into it. The pond is then
// redrawn on a canvas of its own, lying exactly over the first, with each
// point looked up a few pixels from where it really is.
function bendingRipples() {
  const view = document.createElement('canvas');
  const gl = view.getContext('webgl2', { ...ASK, alpha: false });
  if (!usable(gl)) return null;
  const MOST = 12;   // the largest bend the map can hold, in pixels
  const rings = build(gl, `#version 300 es
in vec2 aCorner;      // one corner of the square a ring is stamped in, in pond pixels
in vec4 aRing;        // the ring: centre x, centre y, radius, strength in pixels
uniform vec2 uSize;   // the pond, in pixels
out vec2 vAt; out vec4 vRing;
void main() {
  vAt = aCorner; vRing = aRing;
  vec2 c = aCorner / uSize * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`, `#version 300 es
precision highp float;
in vec2 vAt; in vec4 vRing; out vec4 o;
uniform float uMost;
void main() {
  vec2 from = vAt - vRing.xy;
  float far = length(from) + 1e-4;
  float wide = 5.0 + 0.07 * vRing.z;                       // a ring broadens a little as it spreads
  float x = (far - vRing.z) / wide;                        // how many widths this point is from the crest
  float push = -x * exp(0.5 - 0.5 * x * x) * vRing.w;      // towards the crest from either side, the way a lens gathers
  vec2 d = from / far * push / uMost;
  o = vec4(max(d.x, 0.0), max(-d.x, 0.0), max(d.y, 0.0), max(-d.y, 0.0));   // right, left, down, up: four amounts that can simply be added up
}`, ['aCorner', 'aRing']);
  const mix = build(gl, WHOLE, FRAG + `
uniform sampler2D uPond, uBend;
uniform vec2 uSize;
uniform float uMost, uGlint, uShade;
void main() {
  vec4 b = texture(uBend, vUv);
  vec2 d = vec2(b.r - b.g, b.b - b.a) * uMost;             // how far to look aside, in pond pixels (y runs down the screen)
  vec3 c = texture(uPond, vUv + vec2(d.x, -d.y) / uSize).rgb;
  float lit = d.x + d.y * 1.7;                             // the side of a crest that faces the light catches a little of it;
  c += (lit > 0.0 ? uGlint : uShade) * lit;                // the side that faces away loses a little
  o = vec4(c, 1.0);
}`);
  const whole = wholeScreen(gl);
  const MAX = 320, data = new Float32Array(MAX * 36);      // 6 corners × (corner 2 + ring 4) for each stamp
  const ringVao = gl.createVertexArray();
  gl.bindVertexArray(ringVao);
  const ringBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
  const pondTex = gl.createTexture(), bendTex = gl.createTexture(), bendFbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, pondTex); smooth(gl);
  gl.bindTexture(gl.TEXTURE_2D, bendTex); smooth(gl);
  let pw = 0, ph = 0, bw = 0, bh = 0, alive = true, shown = false;

  function stamp(n, x, y, r, strength) {                   // one ring into the list, as a square big enough to hold it
    const reach = r + 3.3 * (5 + 0.07 * r), k = n * 36;
    const corners = [x - reach, y - reach, x + reach, y - reach, x - reach, y + reach, x - reach, y + reach, x + reach, y - reach, x + reach, y + reach];
    for (let i = 0; i < 6; i++) {
      const j = k + i * 6;
      data[j] = corners[i * 2]; data[j + 1] = corners[i * 2 + 1];
      data[j + 2] = x; data[j + 3] = y; data[j + 4] = r; data[j + 5] = strength;
    }
  }
  function present() {
    if (!alive) return;
    const pond = P.canvas, w = pond.width, h = pond.height;
    if (!w || !h) return;
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
    const mw = Math.max(2, Math.round(P.W)), mh = Math.max(2, Math.round(P.H));
    if (mw !== bw || mh !== bh) {
      bw = mw; bh = mh;
      gl.bindTexture(gl.TEXTURE_2D, bendTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bendFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bendTex, 0);
    }
    // 1 · every ring into the bend map (each of the pond's rings is drawn as two circles; so are these)
    let n = 0;
    for (const q of P.ripples) {
      if (q.delay > 0 || n > MAX - 2) continue;
      const strength = CONFIG.bend * 2 * q.a0 * Math.sqrt(Math.max(0, 1 - q.r / q.maxR));   // (it bends for longer than the drawn line stays bright)
      if (strength < 0.08) continue;
      stamp(n++, q.x, q.y, q.r, strength);
      stamp(n++, q.x, q.y, q.r * 0.62, strength * 0.55);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, bendFbo);
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (n) {
      gl.useProgram(rings.prog);
      gl.uniform2f(rings.u.uSize, P.W, P.H); gl.uniform1f(rings.u.uMost, MOST);
      gl.bindVertexArray(ringVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * 36));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      gl.disable(gl.BLEND);
    }
    // 2 · the pond as it has just been painted
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pondTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (w !== pw || h !== ph) { pw = w; ph = h; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pond); }
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, pond);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // 3 · and again, bent
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(mix.prog);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bendTex);
    gl.uniform1i(mix.u.uPond, 0); gl.uniform1i(mix.u.uBend, 1);
    gl.uniform2f(mix.u.uSize, P.W, P.H);
    gl.uniform1f(mix.u.uMost, MOST);
    gl.uniform1f(mix.u.uGlint, P.night ? 0.0045 : 0.007); gl.uniform1f(mix.u.uShade, P.night ? 0.003 : 0.007);
    gl.bindVertexArray(whole);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    if (!shown) {                                           // only now does it go on the page, over the pond it copies
      shown = true;
      if (gl.getError() !== gl.NO_ERROR) { retire('broken'); return; }
      P.canvas.insertAdjacentElement('afterend', view);
    }
  }
  function stop() {
    if (!alive) return;
    alive = false;
    view.remove();
    letGo(gl);
  }
  view.id = 'water';
  view.setAttribute('aria-hidden', 'true');
  view.addEventListener('webglcontextlost', e => { e.preventDefault(); retire('lost'); });
  return { present, stop };
}

/* ════════ ink that flows ════════ */
// A small grid of water, one cell every few pixels, holds how fast the water
// in it is moving and how much ink it carries. Each koi's tail pushes on the
// water and drops ink into it. Many times a second the grid is moved on:
// the water carries itself and the ink along, is kept from piling up, and
// is given back the small swirls that a coarse grid smooths away. The ink is
// then drawn into the pond, underneath the fish. (The method is Jos Stam's
// "stable fluids", 1999.) Nothing is set up until the first koi leaves some
// ink, so pages without koi, and nights, cost nothing.
function flowingInk() {
  let sim = null, dead = false;
  const well = {
    get live() { return !dead; },
    // A tail is at (x, y), and (ax, ay) points across the fish's path. The tail pushes the water at (vx, vy) pixels a second,
    // sets it turning by `turn` (how fast the tail is crossing that path, in pixels a second) and leaves `amount` of ink.
    // `size` is the fish's.
    add(x, y, ax, ay, vx, vy, turn, amount, size) {
      if (dead) return;
      if (!sim) {
        try { sim = inkSimulation(); } catch (e) { sim = null; }
        if (!sim) { dead = true; if (P.inkwell === well) P.inkwell = null; return; }   // this browser cannot: home.js draws its own trails from here on
      }
      sim.add(x, y, ax, ay, vx, vy, turn, amount, size);
    },
    draw() { if (sim && !dead) sim.draw(); },              // paint the ink into the pond (home.js calls this just before it draws the fish)
  };
  return { well, step(dt) { if (sim && !dead) sim.step(dt); }, stop() { dead = true; if (sim) sim.stop(); } };
}
function inkSimulation() {
  const lab = document.createElement('canvas');            // never shown: the pond copies the finished ink out of it
  const gl = lab.getContext('webgl2', { ...ASK, alpha: true, premultipliedAlpha: true });
  if (!usable(gl)) return null;
  gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_color_buffer_half_float');   // either lets the card draw into fine-grained pictures
  const CELL = 5, MOST = 6;                                // pixels of pond to a cell; koi it can take ink from at once
  const whole = wholeScreen(gl);
  const sides = `
  vec2 dx = vec2(uCell.x, 0.0), dy = vec2(0.0, uCell.y);`;
  const tails = `
uniform sampler2D uWhat; uniform vec2 uPond; uniform int uCount; uniform vec4 uAt[${MOST}]; uniform vec4 uAdd[${MOST}]; uniform vec4 uSide[${MOST}];
void main() {
  vec4 v = texture(uWhat, vUv);
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uPond;               // this cell, in pond pixels
  for (int i = 0; i < uCount; i++) {
    vec2 d = p - uAt[i].xy;`;
  const prog = {
    carry: build(gl, WHOLE, FRAG + `
uniform sampler2D uFlow, uWhat; uniform vec2 uCell; uniform float uDt, uKeep;
void main() { o = uKeep * texture(uWhat, vUv - uDt * texture(uFlow, vUv).xy * uCell); }`),   // whatever is here now was upstream a moment ago
    push: build(gl, WHOLE, FRAG + tails + `
    float g = exp(-dot(d, d) / (uAt[i].w * uAt[i].w));
    v.xy = mix(v.xy, uAdd[i].xy, uAdd[i].w * g);                                         // the water by a tail is eased towards the way the tail pushes,
    v.xy += uSide[i].z * vec2(d.y, d.x) / uAt[i].w * g;                                  // and each sweep of the tail leaves it turning
  }
  o = v;
}`),
    drop: build(gl, WHOLE, FRAG + tails + `
    float fine = uAt[i].z * uAt[i].z;
    vec2 side = uSide[i].xy * uAt[i].z * 2.4;                                            // ink: a thread down the middle, a fainter one either side of it,
    v.r += uAdd[i].z * (exp(-dot(d, d) / fine) + 0.5 * (exp(-1.6 * dot(d - side, d - side) / fine) + exp(-1.6 * dot(d + side, d + side) / fine))
                        + 0.25 * exp(-dot(d, d) / (fine * 12.0)));                       // and a wash round all three
  }
  o = v;
}`),
    curl: build(gl, WHOLE, FRAG + `
uniform sampler2D uFlow; uniform vec2 uCell;
void main() {${sides}
  o = vec4(0.5 * (texture(uFlow, vUv + dx).y - texture(uFlow, vUv - dx).y - texture(uFlow, vUv + dy).x + texture(uFlow, vUv - dy).x), 0.0, 0.0, 1.0);
}`),
    swirl: build(gl, WHOLE, FRAG + `
uniform sampler2D uFlow, uCurl; uniform vec2 uCell; uniform float uSwirl, uDt;
void main() {${sides}
  float l = abs(texture(uCurl, vUv - dx).x), r = abs(texture(uCurl, vUv + dx).x), b = abs(texture(uCurl, vUv - dy).x), t = abs(texture(uCurl, vUv + dy).x);
  vec2 f = 0.5 * vec2(t - b, r - l);
  f = f / (length(f) + 1e-4) * uSwirl * texture(uCurl, vUv).x;
  f.y = -f.y;
  o = vec4(texture(uFlow, vUv).xy + f * uDt, 0.0, 1.0);
}`),
    spread: build(gl, WHOLE, FRAG + `
uniform sampler2D uFlow; uniform vec2 uCell;
void main() {${sides}
  o = vec4(0.5 * (texture(uFlow, vUv + dx).x - texture(uFlow, vUv - dx).x + texture(uFlow, vUv + dy).y - texture(uFlow, vUv - dy).y), 0.0, 0.0, 1.0);
}`),
    press: build(gl, WHOLE, FRAG + `
uniform sampler2D uPress, uSpread; uniform vec2 uCell;
void main() {${sides}
  o = vec4((texture(uPress, vUv - dx).x + texture(uPress, vUv + dx).x + texture(uPress, vUv - dy).x + texture(uPress, vUv + dy).x - texture(uSpread, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`),
    level: build(gl, WHOLE, FRAG + `
uniform sampler2D uFlow, uPress; uniform vec2 uCell;
void main() {${sides}
  o = vec4(texture(uFlow, vUv).xy - 0.5 * vec2(texture(uPress, vUv + dx).x - texture(uPress, vUv - dx).x, texture(uPress, vUv + dy).x - texture(uPress, vUv - dy).x), 0.0, 1.0);
}`),
    show: build(gl, WHOLE, FRAG + `
uniform sampler2D uInk; uniform vec3 uColour; uniform float uDark;
void main() {
  float a = min(1.0 - exp(-uDark * max(texture(uInk, vUv).r, 0.0)), 0.5);   // thin ink is pale; thick ink never quite goes black
  o = vec4(uColour * a, a);
}`),
  };
  const made = [];
  function sheet(w, h) {       // one picture the card can both read and draw into, holding fine-grained numbers
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex); smooth(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('this card cannot draw into fine-grained pictures');
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    made.push(tex, fbo);
    return { tex, fbo, w, h };
  }
  const pair = (w, h) => { let a = sheet(w, h), b = sheet(w, h); return { get now() { return a; }, get next() { return b; }, swap() { [a, b] = [b, a]; } }; };

  let flow, ink, press, curl, spread, gw = 0, gh = 0, forW = 0, forH = 0;
  let alive = true, fed = -1e9, clock = 0;
  const at = new Float32Array(MOST * 4), tail = new Float32Array(MOST * 4), scaled = new Float32Array(MOST * 4);
  const side = new Float32Array(MOST * 4), sided = new Float32Array(MOST * 4);
  let count = 0;

  function lay() {             // (re)make the grid to fit the pond: a fresh sheet of water
    for (let i = 0; i < made.length; i += 2) { gl.deleteTexture(made[i]); gl.deleteFramebuffer(made[i + 1]); }
    made.length = 0;
    forW = P.W; forH = P.H;
    const k = Math.min(1, 384 / Math.max(forW / CELL, forH / CELL));
    gw = Math.max(16, Math.round(forW / CELL * k)); gh = Math.max(16, Math.round(forH / CELL * k));
    flow = pair(gw, gh); press = pair(gw, gh); curl = sheet(gw, gh); spread = sheet(gw, gh);
    ink = pair(gw * 3, gh * 3);                             // the ink itself is kept three times as fine, so its threads stay crisp
    lab.width = gw * 3; lab.height = gh * 3;
    fed = -1e9; count = 0;
  }
  // run one of the programs over a whole sheet; `set` fills in its inputs
  function run(p, into, set) {
    gl.useProgram(p.prog);
    let unit = 0;
    const tex = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(p.u[name], unit++); };
    if (p.u.uCell) gl.uniform2f(p.u.uCell, 1 / gw, 1 / gh);
    set(p.u, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.fbo : null);
    gl.viewport(0, 0, into ? into.w : lab.width, into ? into.h : lab.height);
    gl.bindVertexArray(whole);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const tailsIn = (u, tex, what) => {
    tex('uWhat', what);
    gl.uniform2f(u.uPond, forW, forH); gl.uniform1i(u.uCount, count); gl.uniform4fv(u.uAt, at); gl.uniform4fv(u.uAdd, scaled);
    gl.uniform4fv(u.uSide, sided);
  };

  function add(x, y, ax, ay, vx, vy, turn, amount, size) {
    if (!alive || count >= MOST) return;
    const cell = forW / gw, k = count * 4;
    at[k] = x; at[k + 1] = y; at[k + 2] = 1.7 * size; at[k + 3] = 9 * size;     // where; how wide the thread of ink is; how wide the push is felt
    tail[k] = vx / cell; tail[k + 1] = -vy / cell; tail[k + 2] = amount;         // the push in cells a second, y running up; the ink
    side[k] = ax; side[k + 1] = ay; side[k + 2] = turn / cell;
    count++;
  }
  function draw() {
    if (!alive || clock - fed > CONFIG.inkLasts * 6) return;   // nothing left to show
    run(prog.show, null, (u, tex) => { tex('uInk', ink.now); gl.uniform3f(u.uColour, 30 / 255, 44 / 255, 42 / 255); gl.uniform1f(u.uDark, CONFIG.inkDark); });
    P.ctx.drawImage(lab, 0, 0, P.W, P.H);
  }
  function step(dt) {
    if (!alive || P.night) { count = 0; return; }
    if (P.W !== forW || P.H !== forH) lay();
    clock += dt;
    if (count) fed = clock;
    if (clock - fed > CONFIG.inkLasts * 6) { count = 0; return; }   // long since any koi came by: nothing to move
    dt = Math.min(dt, 1 / 30);
    if (count) {
      for (let i = 0; i < count * 4; i += 4) {
        scaled[i] = tail[i]; scaled[i + 1] = tail[i + 1]; scaled[i + 2] = tail[i + 2] * dt * 2.6; scaled[i + 3] = Math.min(1, dt * 1.5);
        sided[i] = side[i]; sided[i + 1] = side[i + 1]; sided[i + 2] = side[i + 2] * dt * 10;
      }
      run(prog.push, flow.next, (u, tex) => tailsIn(u, tex, flow.now));
      flow.swap();
    }
    run(prog.curl, curl, (u, tex) => tex('uFlow', flow.now));
    run(prog.swirl, flow.next, (u, tex) => { tex('uFlow', flow.now); tex('uCurl', curl); gl.uniform1f(u.uSwirl, 2); gl.uniform1f(u.uDt, dt); });
    flow.swap();
    run(prog.spread, spread, (u, tex) => tex('uFlow', flow.now));
    for (let i = 0; i < 14; i++) { run(prog.press, press.next, (u, tex) => { tex('uPress', press.now); tex('uSpread', spread); }); press.swap(); }
    run(prog.level, flow.next, (u, tex) => { tex('uFlow', flow.now); tex('uPress', press.now); });
    flow.swap();
    run(prog.carry, flow.next, (u, tex) => { tex('uFlow', flow.now); tex('uWhat', flow.now); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uKeep, Math.exp(-dt * 0.8)); });
    flow.swap();
    if (count) {
      run(prog.drop, ink.next, (u, tex) => tailsIn(u, tex, ink.now));
      ink.swap();
    }
    run(prog.carry, ink.next, (u, tex) => { tex('uFlow', flow.now); tex('uWhat', ink.now); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uKeep, Math.exp(-dt / CONFIG.inkLasts)); });
    ink.swap();
    count = 0;
  }
  function stop() {
    if (!alive) return;
    alive = false;
    letGo(gl);
  }
  lay();
  if (gl.getError() !== gl.NO_ERROR) { stop(); return null; }
  lab.addEventListener('webglcontextlost', e => { e.preventDefault(); retire('lost'); });
  P.onTheme(() => { if (alive) lay(); });                  // a fresh sheet of water each time day comes round
  return { add, draw, step, stop };
}

/* ── start what the browser can do; stand down when it cannot keep up ── */
let ripples = null, inks = null;
function retire(why) {
  if (ripples) { ripples.stop(); ripples = null; }
  if (inks) { inks.stop(); inks = null; }
  P.inkwell = null;                                         // home.js goes back to drawing its own trails
  if (why === 'slow') { try { sessionStorage.setItem(KEY, 'off'); } catch (e) { /* no storage */ } }
}
if (CONFIG.ink) inks = flowingInk();
try { if (CONFIG.ripples) ripples = bendingRipples(); } catch (e) { ripples = null; }
if (!ripples && !inks) return;
if (inks) P.inkwell = inks.well;

// Is the pond still smooth? Frames should come about every 17 ms.
//   · eight in a row slower than 80 ms: the device is nowhere near. The extras go at once.
//   · over half of them slower than 24 ms, two seconds running: it cannot quite keep up. They go then.
const gaps = [];
let last = 0, seen = 0, crawl = 0, slow = 0;
function watch() {
  const now = performance.now(), gap = now - last;
  last = now;
  if (!P.moving || gap > 1000) { crawl = 0; return; }      // the first frame after a pause says nothing
  if (++seen < 6) return;                                  // nor do the page's first few
  crawl = gap > 80 ? crawl + 1 : 0;
  if (crawl >= 8) { retire('slow'); return; }
  gaps.push(gap);
  if (gaps.length < 60) return;
  gaps.sort((a, b) => a - b);
  const typical = gaps[30];
  gaps.length = 0;
  slow = typical > 24 ? slow + 1 : 0;
  if (slow >= 2) retire('slow');
}
P.add({ update(dt) { if (inks) inks.step(dt); } });
P.onDrawn(() => {
  if (ripples) ripples.present();
  if (CONFIG.watchSpeed && (ripples || (inks && inks.well.live))) watch();
});
if (P.drawn && ripples) ripples.present();                  // a pond that is standing still has already been painted
document.addEventListener('visibilitychange', () => { if (!document.hidden && ripples) ripples.present(); });   // a tab that has been away may have had its picture dropped

})();

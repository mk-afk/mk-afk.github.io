/* ════════════════════════════════════════════════════════════
   visits.js · tells your visitor log about each page view
   (loaded by every page; does nothing until sendTo is filled in)

   The log itself is not on GitHub. It is worker.js, running on
   your Cloudflare account, and it has its own private page. This
   file only sends it a short note: which page, where the visitor
   came from, the size of their screen, their language and time
   zone, and on leaving, how long they stayed, how far down they
   read and which links they clicked. The log adds the rest: the
   time, the IP address, and that address's city and network.

   To keep one of your own browsers out of the log, open the site
   in it once as   mk-afk.github.io/#visits-off
   (#visits-on puts it back).

   To learn which application or message a visitor came from, give
   each one its own link:   mk-afk.github.io/?ref=any-name-you-like
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const CONFIG = {
  sendTo: 'https://visits.mkireeff.workers.dev', // EDIT: your Worker's address · '' = send nothing
  notice: 'This site keeps a log of visits.',    // added to the footer while the log is on · '' = say nothing
  honorOptOut: true,                             // skip visitors whose browser asks not to be tracked (Global Privacy Control, Do Not Track)
};

const here = document.currentScript;
const missing = !!(here && here.hasAttribute('data-missing'));   // the 404 page says so on its script tag
const foot = document.querySelector('.site-foot');
const say = words => { if (foot && words) { const p = document.createElement('p'); p.textContent = words; foot.append(p); } };   // a line of its own under the footer

// ── your own browser, kept out on request
let out = false;
try {
  if (location.hash === '#visits-off') localStorage.setItem('visits-off', '1');
  if (location.hash === '#visits-on') localStorage.removeItem('visits-off');
  out = localStorage.getItem('visits-off') === '1';
  if (/^#visits-o(ff|n)$/.test(location.hash)) {
    history.replaceState(null, '', location.pathname + location.search);
    if (!out && CONFIG.sendTo) say('Visits from this browser are logged again.');
  }
} catch (e) { /* no storage here, so this browser cannot be remembered */ }
if (out) { say('Visits from this browser are not logged.'); return; }

if (!CONFIG.sendTo) return;
if (location.protocol === 'file:' || navigator.webdriver) return;   // a preview from a folder, or a browser driven by a program
if (CONFIG.honorOptOut && (navigator.globalPrivacyControl || navigator.doNotTrack === '1')) return;
say(CONFIG.notice);

// ── sending
const to = CONFIG.sendTo.replace(/\/+$/, '') + '/hit';
const send = note => {
  const body = JSON.stringify(note);   // sent as plain text, which a browser lets through to another address without asking first
  try { if (navigator.sendBeacon && navigator.sendBeacon(to, body)) return; } catch (e) { /* fall through */ }
  try { fetch(to, { method: 'POST', body, mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => {}); } catch (e) { /* the log misses this one */ }
};

// ── on arriving: one note
const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');   // names this page view, nothing else
const asked = new URLSearchParams(location.search);
const tag = [...new Set(['ref', 'src', 'source', 'via', 'utm_campaign', 'utm_source'].map(k => asked.get(k)).filter(Boolean))].slice(0, 2).join(' / ');
let ref = '';
try {
  const r = document.referrer && new URL(document.referrer);
  if (r && r.origin !== location.origin) ref = r.origin + r.pathname;   // the page they came from, without its ?query: that part can hold private things
} catch (e) { /* not an address */ }
let zone = '';
try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* unknown */ }

send({
  id, page: location.pathname, missing: missing ? 1 : 0, ref, tag: tag.slice(0, 80),
  screen: screen.width + 'x' + screen.height, view: innerWidth + 'x' + innerHeight,
  dpr: Math.round((devicePixelRatio || 1) * 10) / 10,
  lang: navigator.language || '', tz: zone, touch: navigator.maxTouchPoints > 0 ? 1 : 0,
});

// ── on leaving: how it went
let seen = 0;                                                              // milliseconds the page was actually in view
let since = document.visibilityState === 'visible' ? performance.now() : 0;
let deep = 0;                                                              // the furthest point reached, as a percentage of the page
const clicks = [];
let last = '';

const tall = () => document.documentElement.scrollHeight > innerHeight * 1.5;   // a page that fits the screen has nothing to scroll
const depth = () => { if (tall()) deep = Math.max(deep, Math.min(100, Math.round((scrollY + innerHeight) / document.documentElement.scrollHeight * 100))); };
addEventListener('scroll', depth, { passive: true });

function more() {
  if (since) { seen += performance.now() - since; since = 0; }
  depth();
  const note = { id, more: 1, secs: Math.min(Math.round(seen / 1000), 10800), scroll: deep, clicks };
  const now = JSON.stringify(note);
  if (now === last) return;   // nothing new since the last note
  last = now;
  send(note);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') more();
  else if (!since) since = performance.now();
});
addEventListener('pagehide', more);
addEventListener('pageshow', e => { if (e.persisted && !since && document.visibilityState === 'visible') since = performance.now(); });

document.addEventListener('click', e => {
  const a = e.target.closest ? e.target.closest('a[href]') : null;
  if (!a || clicks.length >= 12) return;
  let label = '';
  if (a.classList.contains('mail') || /^mailto:/i.test(a.getAttribute('href'))) label = 'email address';   // that it was clicked, never the address itself
  else {
    try {
      const u = new URL(a.href, location.href);
      if (!/^https?:$/.test(u.protocol)) label = '';
      else if (u.origin !== location.origin) label = (u.host + u.pathname).replace(/^www\./, '').replace(/\/$/, '');
      else if (/\.pdf$/i.test(u.pathname)) label = u.pathname.split('/').pop();
      else if (u.pathname === location.pathname && u.hash.length > 1) label = u.hash;   // a jump to a section of this page
    } catch (err) { /* not an address */ }
  }
  if (label && !clicks.includes(label)) clicks.push(label.slice(0, 80));
}, true);

})();

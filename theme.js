/* ════════════════════════════════════════════════════════════
   theme.js · Night or Day, settled before anything is drawn
   (loaded first, by every page)

   The pond opens on Day while the sun is up where the visitor is,
   and on Night after dark. If they have used the Night | Day switch
   in the last twelve hours, their choice wins (pond.js saves it).
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ── CONFIG · EDIT freely ─────────────────────────────────── */
const OPEN_ON = 'clock';   // 'clock' = follow the visitor's time of day · 'night' or 'day' = always open that way

// Is the sun up? Nobody's location is looked up. This is the length of the
// day for the date at a middling northern latitude (40°, about Pittsburgh's),
// set against the visitor's own clock, with twenty minutes of twilight at
// each end. It lands within about twenty minutes of the real thing there.
function sunUp(now) {
  const year = now.getFullYear();
  const day = (now - new Date(year, 0, 0)) / 864e5;                           // day of the year
  const tilt = -0.4091 * Math.cos(2 * Math.PI * (day + 10) / 365);            // how far north of the equator the sun stands, in radians
  const half = Math.acos(-Math.tan(0.698) * Math.tan(tilt)) * 12 / Math.PI;   // half the day's length, in hours
  const winter = Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
  const noon = 12 + (winter - now.getTimezoneOffset()) / 60;                  // an hour later while the clocks are forward
  const hour = now.getHours() + now.getMinutes() / 60;
  return hour > noon - half - 0.33 && hour < noon + half + 0.33;
}

let theme = OPEN_ON === 'day' ? 'light' : OPEN_ON === 'night' ? 'dark' : sunUp(new Date()) ? 'light' : 'dark';
try {
  const [choice, until] = (localStorage.getItem('pond-theme') || '').split('|');
  if ((choice === 'light' || choice === 'dark') && +until > Date.now()) theme = choice;
} catch (e) { /* storage is switched off: follow the clock */ }
document.documentElement.dataset.theme = theme;

})();

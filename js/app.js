/* מסע המציאות – לוגיקת האפליקציה */
'use strict';
(function () {

/* ───────── עזרים ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STATIONS = window.STATIONS, SHOP = window.SHOP;

/* ───────── מצב שמור ───────── */
const KEY = 'eluMetziot.v1';
const DEF = () => ({ name: '', coins: 0, stars: {}, unlockAll: false, sound: true, owned: [], wear: {}, badges: [], missed: [], day: { last: '', n: 0 }, chest: '' });
const DEF_STATS = { right: 0, bestStreak: 0, fixed: 0, rushes: 0, rushBest: 0, medal: 0, bosses: 0, chests: 0, bought: 0 };
let ST;
try { ST = Object.assign(DEF(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { ST = DEF(); }
ST.stats = Object.assign({}, DEF_STATS, ST.stats);
function save() { checkBadges(); try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* פרטי */ } updateTopbar(); }
const nm = s => String(s).replace(/\{name\}/g, esc(ST.name || 'חבר'));
const totalStars = () => Object.values(ST.stars).reduce((a, b) => a + b, 0);
const isDone = i => !!ST.stars[STATIONS[i].id];
const isOpen = i => ST.unlockAll || i === 0 || isDone(i - 1);
const allDone = () => STATIONS.every((s, i) => isDone(i));

const PRAISE = ['מעולה!', 'כל הכבוד!', 'אלוף!', 'יפה מאוד!', 'גאון!', 'בול!', 'וואו!', 'מדהים!', 'צדיק!', 'תותח!'];
const praise = () => Math.random() < .3 && ST.name ? `${pick(PRAISE)} ${esc(ST.name)}!` : pick(PRAISE);

/* ───────── צלילים (WebAudio – בלי קבצים) ───────── */
const Sound = {
  ctx: null,
  ensure() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(f, d, type = 'sine', when = 0, vol = .18) {
    if (!ST.sound) return;
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + .05);
  },
  click() { this.tone(700, .07, 'triangle', 0, .1); },
  good() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .2, 'triangle', i * .07, .16)); },
  bad() { this.tone(240, .22, 'sawtooth', 0, .08); this.tone(170, .3, 'sawtooth', .12, .08); },
  coin() { this.tone(988, .08, 'square', 0, .06); this.tone(1319, .22, 'square', .07, .06); },
  flip() { this.tone(520, .06, 'triangle', 0, .08); },
  star(i) { this.tone(660 + i * 220, .3, 'triangle', 0, .2); this.tone(990 + i * 220, .3, 'sine', .08, .12); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, .28, 'triangle', i * .13, .17)); },
  whoosh() { this.tone(300, .15, 'sine', 0, .08); this.tone(600, .12, 'sine', .05, .06); },
  combo(n) { const b = 523 * Math.pow(2, Math.min(n, 12) / 12); [0, 4, 7, 12].forEach((s, i) => this.tone(b * Math.pow(2, s / 12), .14, 'square', i * .05, .05)); },
  hit() { this.tone(160, .18, 'square', 0, .12); this.tone(90, .3, 'sawtooth', .05, .1); },
  tick() { this.tone(1200, .04, 'square', 0, .04); },
  badge() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, .35, 'triangle', i * .1, .15)); },
};

/* ───────── הקראה (אם יש קול עברי במכשיר) ───────── */
const Speech = {
  voice: null,
  init() {
    if (!('speechSynthesis' in window)) return;
    const pickV = () => { this.voice = speechSynthesis.getVoices().find(v => /^(he|iw)/i.test(v.lang)) || null; };
    pickV(); speechSynthesis.onvoiceschanged = pickV;
  },
  ok() { return !!this.voice; },
  say(t) {
    if (!this.ok()) return;
    speechSynthesis.cancel();
    const div = document.createElement('div'); div.innerHTML = t;
    const u = new SpeechSynthesisUtterance(div.textContent); u.lang = 'he-IL'; u.voice = this.voice; u.rate = .9;
    speechSynthesis.speak(u);
  },
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
};

/* ───────── אפקטים ───────── */
const FX = {
  cv: null, cx: null, parts: [], raf: 0,
  init() {
    this.cv = $('#fx'); this.cx = this.cv.getContext('2d');
    const rs = () => { const d = Math.min(window.devicePixelRatio || 1, 2); this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; this.cx.setTransform(d, 0, 0, d, 0, 0); };
    rs(); addEventListener('resize', rs);
  },
  confetti(n = 140, ox, oy) {
    const cols = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#14b8a6', '#fb7185'];
    const x0 = ox ?? innerWidth / 2, y0 = oy ?? innerHeight * .35;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      this.parts.push({ x: x0, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, g: .22 + Math.random() * .1,
        w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: pick(cols), life: 0, max: 140 + Math.random() * 60, circ: Math.random() < .25 });
    }
    if (!this.raf) this.loop();
  },
  rain(n = 90) {
    const cols = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15'];
    for (let i = 0; i < n; i++) this.parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .6, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, g: .03,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: pick(cols), life: 0, max: 400, circ: Math.random() < .3 });
    if (!this.raf) this.loop();
  },
  loop() {
    const cx = this.cx; cx.clearRect(0, 0, innerWidth, innerHeight);
    this.parts = this.parts.filter(p => p.life < p.max && p.y < innerHeight + 40);
    for (const p of this.parts) {
      p.life++; p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.globalAlpha = Math.max(0, 1 - p.life / p.max); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
      if (p.circ) { cx.beginPath(); cx.arc(0, 0, p.w / 2, 0, 7); cx.fill(); } else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life / 8)) + 1);
      cx.restore();
    }
    this.raf = this.parts.length ? requestAnimationFrame(() => this.loop()) : 0;
    if (!this.raf) cx.clearRect(0, 0, innerWidth, innerHeight);
  },
  burst(x, y, emojis = ['⭐', '✨', '🌟'], n = 10) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.className = 'burst-p'; s.textContent = pick(emojis);
      const a = (Math.PI * 2 * i) / n + Math.random() * .4, d = 60 + Math.random() * 60;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      document.body.appendChild(s); setTimeout(() => s.remove(), 1000);
    }
  },
  center(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
};

/* ───────── יוני הבלש (יונה – עוף טהור) ───────── */
const OWL_SVG = `<svg viewBox="0 0 120 130" class="owl-svg" aria-hidden="true">
<ellipse cx="60" cy="125" rx="30" ry="4.5" fill="rgba(0,0,0,.15)"/>
<path d="M60 108 L40 124 Q60 116 80 124 Z" fill="#9aa6c0"/>
<g class="wing-r"><path d="M92 74 q26 10 18 40 q-20 0 -26 -18 q-2 -14 8 -22z" fill="#c9d2e5"/><path d="M104 100 q6 8 4 16 q-8 -2 -10 -10z" fill="#7d89a6"/></g>
<g class="wing-l"><path d="M28 74 q-26 10 -18 40 q20 0 26 -18 q2 -14 -8 -22z" fill="#c9d2e5"/><path d="M16 100 q-6 8 -4 16 q8 -2 10 -10z" fill="#7d89a6"/></g>
<ellipse cx="60" cy="90" rx="36" ry="32" fill="#eef1f8"/>
<ellipse cx="60" cy="98" rx="24" ry="22" fill="#fff"/>
<path d="M38 76 q22 12 44 0" stroke="#7dd3b8" stroke-width="6" fill="none" stroke-linecap="round" opacity=".75"/>
<path d="M38 76 q22 12 44 0" stroke="#b794f6" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<circle cx="60" cy="48" r="27" fill="#eef1f8"/>
<path d="M42 30 Q60 15 78 30 Q60 25 42 30Z" fill="#3b5bdb"/><path d="M44 29 Q60 19 76 29" stroke="#93c5fd" stroke-width="1.5" fill="none"/>
<circle cx="49" cy="48" r="8" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/><circle cx="71" cy="48" r="8" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>
<g class="pupils"><circle cx="50" cy="49" r="5" fill="#7c2d12"/><circle cx="72" cy="49" r="5" fill="#7c2d12"/><circle cx="50" cy="49" r="2.8" fill="#111827"/><circle cx="72" cy="49" r="2.8" fill="#111827"/><circle cx="51.8" cy="46.8" r="1.6" fill="#fff"/><circle cx="73.8" cy="46.8" r="1.6" fill="#fff"/></g>
<g class="lids"><ellipse cx="49" cy="48" rx="9" ry="9" fill="#eef1f8"/><ellipse cx="71" cy="48" rx="9" ry="9" fill="#eef1f8"/></g>
<path class="brows" d="M41 37 q7 -3 14 0 M65 37 q7 -3 14 0" stroke="#64748b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<circle cx="40" cy="60" r="4.5" fill="#fb7185" opacity=".4"/><circle cx="80" cy="60" r="4.5" fill="#fb7185" opacity=".4"/>
<ellipse cx="60" cy="56" rx="4.5" ry="2.5" fill="#fff" stroke="#cbd5e1" stroke-width="1"/>
<path d="M55.5 58 L64.5 58 L60 66 Z" fill="#fb923c" stroke="#c2410c" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M51 119 l-5 5 M51 119 v6 M51 119 l5 5 M69 119 l-5 5 M69 119 v6 M69 119 l5 5" stroke="#f472b6" stroke-width="3" stroke-linecap="round"/>
<g class="mag"><line x1="103" y1="108" x2="114" y2="124" stroke="#6b3f1d" stroke-width="6" stroke-linecap="round"/><circle cx="97" cy="98" r="13" fill="rgba(186,230,253,.55)" stroke="#475569" stroke-width="4"/><path d="M90 93 q4 -5 10 -4" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
</svg>`;
function owl(cls = '') {
  const acc = Object.entries(ST.wear || {}).map(([slot, id]) => { const it = SHOP.find(s => s.id === id); return it ? `<span class="acc acc-${slot}">${it.e}</span>` : ''; }).join('');
  return `<div class="owl ${cls}">${OWL_SVG}${acc}</div>`;
}

/* ───────── שלד ───────── */
const screen = $('#screen');
let SESS = null, RUN = null;
function setScreen(html, cls = '') {
  Speech.stop(); RUN = null;
  screen.className = 'screen ' + cls;
  screen.innerHTML = html;
  window.scrollTo(0, 0);
  void screen.offsetWidth; screen.classList.add('enter');
}
function updateTopbar() {
  const c = $('#tb-coins b'), s = $('#tb-stars b');
  if (c && c.textContent !== String(ST.coins)) { c.textContent = ST.coins; bump($('#tb-coins')); }
  if (s) s.textContent = totalStars();
  $('#tb-sound').textContent = ST.sound ? '🔊' : '🔇';
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function toast(msg) {
  const t = $('#toast'); t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 2200);
}
function addCoins(n, fromEl) {
  ST.coins += n; save();
  if (fromEl) {
    const [x, y] = FX.center(fromEl), [tx, ty] = FX.center($('#tb-coins'));
    for (let i = 0; i < Math.min(5, Math.ceil(n / 5)); i++) {
      const s = document.createElement('span'); s.className = 'fly-coin'; s.textContent = '🪙';
      s.style.left = x + 'px'; s.style.top = y + 'px'; document.body.appendChild(s);
      setTimeout(() => { s.style.transform = `translate(${tx - x}px, ${ty - y}px) scale(.6)`; s.style.opacity = '.3'; }, 30 + i * 90);
      setTimeout(() => s.remove(), 900 + i * 90);
    }
    setTimeout(() => Sound.coin(), 500);
  }
}
function artHTML(art) {
  if (!art) return '';
  return art.map((e, i) => `<span class="art-e" style="--d:${i * 120}ms">${e}</span>`).join('');
}
function speakBtn(id) { return Speech.ok() ? `<button class="speak" data-speak="${id}" aria-label="הקרא">🔊</button>` : ''; }
function bindSpeak(map) {
  $$('[data-speak]').forEach(b => b.onclick = e => { e.stopPropagation(); Sound.click(); Speech.say(map[b.dataset.speak]); });
}

/* ───────── מודאל ───────── */
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card">${'<button class="modal-x" aria-label="סגור">✕</button>'}${html}</div>`;
  m.classList.remove('hidden'); void m.offsetWidth; m.classList.add('show');
  $('.modal-x', m).onclick = closeModal;
  m.onclick = e => { if (e.target === m) closeModal(); };
}
function closeModal() { const m = $('#modal'); m.classList.remove('show'); setTimeout(() => m.classList.add('hidden'), 200); }

/* ───────── מסך פתיחה ───────── */
function renderWelcome() {
  $('#topbar').classList.add('hidden');
  setScreen(`
  <div class="welcome">
    <div class="floaters">${['🪙', '🍎', '🐑', '🫏', '📜', '⭐', '🔍', '🌾', '🐟', '🏺'].map((e, i) => `<span style="--x:${(i * 37) % 95}%;--d:${i * 0.7}s;--t:${8 + (i % 4) * 2}s">${e}</span>`).join('')}</div>
    <div class="logo-wrap">
      <div class="logo-sub">מִשְׁנָה • גְּמָרָא • הַרְפַּתְקָה</div>
      <h1 class="logo">מסע<br><span>המציאות</span></h1>
      <div class="logo-perek">פרק אֵלּוּ מְצִיאוֹת • בבא מציעא</div>
    </div>
    ${owl('xl bob wave')}
    <div class="bubble bubble-up">שלום! אני <b>יוֹנִי הבלש</b> 🕊️🔍<br>איך קוראים לך?</div>
    <input id="nameIn" class="name-in" maxlength="16" placeholder="השם שלי..." value="${esc(ST.name)}" autocomplete="off">
    <button id="go" class="btn big primary pulse">יוצאים למסע! 🚀</button>
  </div>`, 's-welcome');
  const go = () => {
    const v = $('#nameIn').value.trim();
    if (!v) { bump($('#nameIn')); $('#nameIn').focus(); Sound.bad(); return; }
    ST.name = v; save(); Sound.win(); FX.confetti(120);
    setTimeout(renderMap, 450);
  };
  $('#go').onclick = go;
  $('#nameIn').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ───────── מפת המסע ───────── */
function renderMap() {
  $('#topbar').classList.remove('hidden'); touchDay(); updateTopbar();
  const nodes = STATIONS.length + 1, GAP = 150, TOP = 90;
  const xs = [50, 26, 70, 30, 72, 28, 68, 50, 50, 30];
  const H = TOP + (nodes - 1) * GAP + 150;
  let cur = STATIONS.findIndex((s, i) => isOpen(i) && !isDone(i));
  if (cur < 0) cur = allDone() ? STATIONS.length : 0;
  const pts = Array.from({ length: nodes }, (_, i) => [xs[i % xs.length], TOP + i * GAP]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; d += ` C${x0} ${y0 + GAP * .55} ${x1} ${y1 - GAP * .55} ${x1} ${y1}`; }
  const deco = ['🌳', '🌲', '🏡', '🐑', '🌻', '⛲', '🐄', '🌴', '🏕️', '🌷', '🪨', '🐓'];
  const decoHTML = pts.slice(0, -1).map(([x, y], i) => {
    const dx = x < 50 ? 82 + (i % 2) * 6 : 10 + (i % 2) * 5;
    return `<span class="deco" style="left:${dx}%;top:${y + GAP / 2}px;--d:${i * .4}s">${deco[i % deco.length]}</span>`;
  }).join('');
  const nodeHTML = STATIONS.map((s, i) => {
    const st = isDone(i) ? 'done' : isOpen(i) ? 'open' : 'locked';
    const stars = ST.stars[s.id] || 0;
    return `<button class="node ${st} ${i === cur ? 'current' : ''}" data-i="${i}" style="left:${pts[i][0]}%;top:${pts[i][1]}px;--c:${s.color}">
      <span class="node-c"><span class="node-ic">${st === 'locked' ? '🔒' : s.icon}</span><span class="node-n">${i + 1}</span></span>
      <span class="node-label">${s.title}<small>${s.sub}</small></span>
      ${st === 'done' ? `<span class="node-stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span>` : ''}
    </button>`;
  }).join('') + (() => {
    const [x, y] = pts[nodes - 1], open = allDone();
    return `<button class="node final ${open ? 'open' : 'locked'} ${cur === STATIONS.length ? 'current' : ''}" data-i="final" style="left:${x}%;top:${y}px;--c:#eab308">
      <span class="node-c"><span class="node-ic">${open ? '🏆' : '🎁'}</span></span>
      <span class="node-label">סיום הפרק!<small>הדרן עלך</small></span></button>`;
  })();
  const [ox, oy] = pts[cur];
  const msgs = [
    `בוא נמשיך במסע! לחץ על התחנה שמהבהבת 👇`,
    `כל תחנה = משנה חדשה + משחקים 🎮`,
    `אסוף מטבעות 🪙 וקנה לי כובעים בחנות 🛍️`,
    `כל טעות היא הזדמנות ללמוד! 💡`,
    `3 תשובות נכונות ברצף = 🔥 קומבו ומטבעות כפולים!`,
    `נסה את ⚡ ריצת הבלש – כמה נקודות תשיג?`,
    `אל תשכח לפתוח את 🎁 תיבת האוצר היומית!`,
  ];
  setScreen(`
  <div class="map">
    <div class="map-hello">${owl('sm')}<div class="bubble bubble-side"><b>שלום ${esc(ST.name)}!</b><br>${allDone() ? 'סיימת את כל הפרק! 🎉 לחץ על הגביע 🏆' : pick(msgs)}</div></div>
    <div class="map-actions" id="mact"></div>
    <div class="map-track" style="height:${H}px">
      <span class="cloud" style="top:20px;--t:38s">☁️</span><span class="cloud" style="top:340px;--t:52s;--dl:-20s">☁️</span><span class="cloud" style="top:760px;--t:45s;--dl:-8s">☁️</span>
      <svg class="map-path" viewBox="0 0 100 ${H}" preserveAspectRatio="none"><path d="${d}" class="road"/><path d="${d}" class="road-dash"/></svg>
      ${decoHTML}${nodeHTML}
      <div class="map-owl" style="left:calc(${ox}% ${ox > 50 ? '-' : '+'} 62px);top:${oy - 58}px">${owl('xs bob')}</div>
    </div>
  </div>`, 's-map');
  $$('.node').forEach(b => b.onclick = () => {
    const i = b.dataset.i;
    if (i === 'final') {
      if (!allDone()) { Sound.bad(); bump(b); toast('🎁 הפרס מחכה בסוף – סיים את כל התחנות!'); return; }
      Sound.click(); return renderFinal();
    }
    if (!isOpen(+i)) { Sound.bad(); bump(b); toast('🔒 קודם מסיימים את התחנה הקודמת'); return; }
    Sound.click(); startStation(+i);
  });
  paintMapActions();
  const curEl = $('.node.current');
  if (curEl && cur > 0) setTimeout(() => curEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
}

/* ───────── תחנה: לימוד ───────── */
function startStation(i) {
  SESS = { i, st: STATIONS[i], mistakes: 0, correct: 0, earned: 0, gi: 0, streak: 0, best: 0 };
  renderLearn(0, 1);
}
function renderLearn(ci, dir = 1) {
  const st = SESS.st, c = st.cards[ci], n = st.cards.length;
  setScreen(`
  <div class="learn" style="--c:${st.color}">
    <div class="learn-head">
      <button class="x-btn" id="exit" aria-label="יציאה">✕</button>
      <div class="lh-title">${st.icon} ${st.title}</div>
      <div class="dots">${st.cards.map((_, k) => `<i class="${k < ci ? 'past' : k === ci ? 'now' : ''}"></i>`).join('')}</div>
    </div>
    <div class="lcard ${c.fact ? 'fact' : ''} ${dir < 0 ? 'from-left' : 'from-right'}" id="lcard">
      ${c.ref ? `<div class="ref-tag">${c.ref}</div>` : ''}
      ${c.scene ? `<div class="scene">${c.scene}</div>` : `<div class="art">${artHTML(c.art)}</div>`}
      ${c.title ? `<div class="concept">${c.title}</div>` : ''}
      ${c.text ? `<div class="mishna">${speakBtn('t')}<span>${c.text}</span></div>` : ''}
    </div>
    <div class="owl-talk">${owl('sm talk')}<div class="bubble bubble-side">${speakBtn('e')}${nm(c.explain)}</div></div>
    <div class="learn-nav">
      <button class="btn ghost" id="prev" ${ci === 0 ? 'disabled' : ''}>→ הקודם</button>
      <button class="btn primary ${ci === n - 1 ? 'pulse' : ''}" id="next">${ci === n - 1 ? '🎮 למשחקים!' : 'הבא ←'}</button>
    </div>
  </div>`, 's-learn');
  bindSpeak({ t: c.text || '', e: nm(c.explain) });
  const next = () => { Sound.whoosh(); ci < n - 1 ? renderLearn(ci + 1, 1) : nextGame(); };
  const prev = () => { if (ci > 0) { Sound.whoosh(); renderLearn(ci - 1, -1); } };
  $('#next').onclick = next; $('#prev').onclick = prev;
  $('#exit').onclick = () => { Sound.click(); renderMap(); };
  swipe($('#lcard'), dx => dx < 0 ? next() : prev());
}
function swipe(el, cb) {
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cb(dx);
  }, { passive: true });
}

/* ───────── זרימת המשחקים ───────── */
function nextGame() {
  const g = SESS.st.games[SESS.gi];
  if (!g) return renderResults();
  SESS.gi++;
  setScreen(`
  <div class="splash" style="--c:${SESS.st.color}">
    <div class="splash-tag">משחק ${SESS.gi} מתוך ${SESS.st.games.length}</div>
    <div class="splash-ic">${g.icon || '🎮'}</div>
    <h2>${g.title}</h2>
    <div class="owl-talk">${owl('sm talk')}<div class="bubble bubble-side">${g.instr}</div></div>
    <button class="btn big primary pulse" id="start">יאללה! ▶</button>
  </div>`, 's-splash');
  $('#start').onclick = () => { Sound.click(); GAMES[g.type](g, nextGame); };
}
function gameHead(title, i, n) {
  return `<div class="g-head">
    <button class="x-btn" id="exit" aria-label="יציאה">✕</button>
    <div class="g-title">${title}</div><div class="g-count">${i + 1}/${n}</div>
  </div><div class="pbar"><i style="width:${(i / n) * 100}%"></i></div>`;
}
function bindExit() { const b = $('#exit'); if (b) b.onclick = () => { Sound.click(); renderMap(); }; }
const color = () => (SESS && SESS.st ? SESS.st.color : '#6c4cf5');

function feedback(ok, html, onNext, label) {
  const fb = $('#fb');
  fb.className = 'fb show ' + (ok ? 'ok' : 'bad');
  fb.innerHTML = `${owl('xs ' + (ok ? 'happy' : 'sad'))}<div class="fb-txt">${html}</div><button class="btn ${ok ? 'success' : 'primary'}" id="fbNext">${label || 'הבא ←'}</button>`;
  $('#fbNext').onclick = () => { Sound.click(); onNext(); };
  setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

/* ───── חידון ───── */
function gameQuiz(g, done) {
  const qs = g.keep ? g.questions : shuffle(g.questions);
  let qi = 0;
  const show = () => {
    const q = qs[qi], opts = shuffle(q.o.map((t, k) => ({ t, ok: k === 0 })));
    setScreen(`
    <div class="game quiz" style="--c:${color()}">
      ${gameHead(g.title, qi, qs.length)}
      <div class="q-card">
        ${q.scene ? `<div class="scene">${q.scene}</div>` : `<div class="q-art">${artHTML(q.art)}</div>`}
        <div class="q-text">${speakBtn('q')}${nm(q.q)}</div>
      </div>
      <div class="q-opts">${opts.map((o, k) => `<button class="opt" data-k="${k}" style="--d:${k * 80}ms"><span class="opt-l">${'אבגד'[k]}</span><span>${o.t}</span></button>`).join('')}</div>
      <div class="fb" id="fb"></div>
    </div>`, 's-game');
    bindExit(); bindSpeak({ q: q.q });
    let locked = false;
    $$('.opt').forEach(b => b.onclick = () => {
      if (locked) return; locked = true;
      const o = opts[+b.dataset.k];
      $$('.opt').forEach(x => x.classList.add('dim'));
      const goOn = () => { qi++; qi < qs.length ? show() : done(); };
      if (o.ok) {
        b.classList.remove('dim'); b.classList.add('ok');
        Sound.good(); FX.burst(...FX.center(b)); const gain = hit(q._k); addCoins(gain, b);
        if (SESS) { SESS.correct++; SESS.earned += gain; }
        feedback(true, `<b>${praise()}</b>${multTag(gain)} ${q.why || ''}`, goOn);
      } else {
        b.classList.remove('dim'); b.classList.add('bad');
        const good = $$('.opt').find(x => opts[+x.dataset.k].ok); good.classList.remove('dim'); good.classList.add('ok', 'reveal');
        Sound.bad(); bump($('.q-card'));
        if (SESS) SESS.mistakes++;
        miss(q._k);
        feedback(false, `<b>לא נורא! 💡</b> ${q.why || ''}`, goOn, 'הבנתי ←');
      }
    });
  };
  show();
}

/* ───── מיון: שלו / להכריז ───── */
function gameSort(g, done) {
  let items = shuffle(g.items);
  if (g.count) {
    const half = Math.ceil(g.count / 2);
    items = shuffle([...items.filter(x => x.a === 'mine').slice(0, half), ...items.filter(x => x.a !== 'mine').slice(0, g.count - half)]);
  }
  let i = 0;
  setScreen(`
  <div class="game sort" style="--c:${color()}">
    <div id="sh"></div>
    <div class="sort-stage"><div class="sort-card" id="sc"></div></div>
    <div class="bins">
      <button class="bin bin-mine" data-a="mine"><span class="bin-ic">🎒</span><b>שלו!</b><small>אין סימן</small></button>
      <button class="bin bin-ann" data-a="ann"><span class="bin-ic">📢</span><b>חייב להכריז</b><small>יש סימן</small></button>
    </div>
    <div class="fb" id="fb"></div>
  </div>`, 's-game');
  const card = $('#sc');
  let locked = false;
  const show = () => {
    const it = items[i];
    $('#sh').innerHTML = gameHead(g.title, i, items.length); bindExit();
    $('#fb').className = 'fb';
    card.style.transition = 'none'; card.style.transform = ''; card.style.opacity = '';
    card.innerHTML = `<div class="si-e">${it.e}</div><div class="si-t">${it.t}</div><div class="si-hint">👈 גרור או לחץ 👉</div>`;
    card.className = 'sort-card'; void card.offsetWidth; card.classList.add('enter');
    locked = false;
  };
  const answer = a => {
    if (locked) return; locked = true;
    const it = items[i], ok = a === it.a, bin = $(`.bin[data-a="${a}"]`), right = $(`.bin[data-a="${it.a}"]`);
    $$('.bin').forEach(b => b.classList.remove('hot'));
    const goOn = () => { i++; i < items.length ? show() : done(); };
    if (ok) {
      const [bx, by] = FX.center(bin), [cx, cy] = FX.center(card);
      card.style.transition = 'transform .45s cubic-bezier(.5,-0.3,.7,1), opacity .45s';
      card.style.transform = `translate(${bx - cx}px, ${by - cy}px) scale(.15) rotate(${a === 'mine' ? -25 : 25}deg)`; card.style.opacity = '0';
      setTimeout(() => { bump(bin); FX.burst(bx, by, a === 'mine' ? ['🎒', '⭐', '✨'] : ['📢', '⭐', '✨'], 8); }, 380);
      Sound.good(); const gain = hit(it._k); addCoins(gain, bin);
      SESS.correct++; SESS.earned += gain;
      feedback(true, `<b>${praise()}</b>${multTag(gain)} ${it.why}`, goOn);
    } else {
      card.classList.remove('enter'); card.style.transform = ''; bump(card); card.classList.add('wrong');
      setTimeout(() => card.classList.remove('wrong'), 500);
      right.classList.add('hint-ok'); setTimeout(() => right.classList.remove('hint-ok'), 1600);
      Sound.bad(); SESS.mistakes++; miss(it._k);
      feedback(false, `<b>אופס!</b> התשובה: <b>${it.a === 'mine' ? '🎒 שלו' : '📢 חייב להכריז'}</b>. ${it.why}`, goOn, 'הבנתי ←');
    }
  };
  $$('.bin').forEach(b => b.onclick = () => answer(b.dataset.a));
  // גרירה
  let sx = null, dx = 0;
  const rightBin = () => { const [m, a] = $$('.bin'); return m.getBoundingClientRect().left > a.getBoundingClientRect().left ? m : a; };
  card.addEventListener('pointerdown', e => { if (locked) return; sx = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
  card.addEventListener('pointermove', e => {
    if (sx === null) return; dx = e.clientX - sx;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 14}deg)`;
    const rb = rightBin(), lb = $$('.bin').find(b => b !== rb);
    rb.classList.toggle('hot', dx > 50); lb.classList.toggle('hot', dx < -50);
  });
  const up = () => {
    if (sx === null) return; sx = null;
    $$('.bin').forEach(b => b.classList.remove('hot'));
    if (Math.abs(dx) > 80) { const rb = rightBin(), lb = $$('.bin').find(b => b !== rb); answer((dx > 0 ? rb : lb).dataset.a); }
    else { card.style.transition = 'transform .3s'; card.style.transform = ''; }
  };
  card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
  show();
}

/* ───── זיכרון ───── */
function gameMemory(g, done) {
  const cards = shuffle(g.pairs.flatMap((p, k) => [{ k, t: p.a, kind: 'term' }, { k, t: p.b, kind: 'def' }]));
  let open = [], matched = 0, moves = 0, busy = false;
  setScreen(`
  <div class="game memory" style="--c:${color()}">
    <div class="g-head"><button class="x-btn" id="exit" aria-label="יציאה">✕</button><div class="g-title">${g.title}</div><div class="g-count" id="mv">0 ניסיונות</div></div>
    <div class="pbar"><i id="mp" style="width:0%"></i></div>
    <div class="mem-grid">${cards.map((c, i) => `
      <button class="mcard" data-i="${i}" style="--d:${i * 40}ms" aria-label="קלף">
        <span class="mc-in"><span class="mc-front">🕊️</span><span class="mc-back ${c.kind}">${c.t}</span></span>
      </button>`).join('')}</div>
    <div class="fb" id="fb"></div>
  </div>`, 's-game');
  bindExit();
  $$('.mcard').forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    if (busy || b.classList.contains('flip') || b.classList.contains('matched')) return;
    b.classList.add('flip'); Sound.flip(); open.push(i);
    if (open.length < 2) return;
    moves++; $('#mv').textContent = `${moves} ניסיונות`;
    const [a, c] = open, ea = $(`.mcard[data-i="${a}"]`), ec = $(`.mcard[data-i="${c}"]`);
    if (cards[a].k === cards[c].k && cards[a].kind !== cards[c].kind) {
      open = []; matched++;
      setTimeout(() => {
        ea.classList.add('matched'); ec.classList.add('matched');
        Sound.good(); FX.burst(...FX.center(ec), ['✨', '⭐', '💫'], 8); addCoins(5, ec); SESS.earned += 5;
        $('#mp').style.width = (matched / g.pairs.length) * 100 + '%';
        if (matched === g.pairs.length) {
          setTimeout(() => { FX.confetti(90); Sound.win(); feedback(true, `<b>מצאת את כל הזוגות!</b> ב-${moves} ניסיונות 🎉`, done, 'ממשיכים ←'); }, 500);
        }
      }, 350);
    } else {
      busy = true;
      setTimeout(() => { ea.classList.add('nope'); ec.classList.add('nope'); }, 400);
      setTimeout(() => { ea.classList.remove('flip', 'nope'); ec.classList.remove('flip', 'nope'); open = []; busy = false; }, 1100);
    }
  });
}
const GAMES = { quiz: gameQuiz, sort: gameSort, memory: gameMemory };

/* ───────── רצף (קומבו), טעויות לחזרה ───────── */
const comboMult = s => s >= 8 ? 3 : s >= 4 ? 2 : 1;
const multTag = gain => gain > 10 ? ` <span class="mult">🔥 ×${gain / 10}</span>` : '';
function hit(k) {
  ST.stats.right++; unmiss(k);
  let mult = 1;
  if (SESS) {
    SESS.streak = (SESS.streak || 0) + 1;
    SESS.best = Math.max(SESS.best || 0, SESS.streak);
    ST.stats.bestStreak = Math.max(ST.stats.bestStreak, SESS.streak);
    mult = comboMult(SESS.streak);
    if (SESS.streak >= 3) comboPop(SESS.streak, mult);
  }
  save();
  return 10 * mult;
}
function miss(k) {
  if (SESS) SESS.streak = 0;
  if (k && !ST.missed.includes(k)) { ST.missed.push(k); if (ST.missed.length > 40) ST.missed.shift(); }
  save();
}
function unmiss(k) { const i = ST.missed.indexOf(k); if (i >= 0) { ST.missed.splice(i, 1); ST.stats.fixed++; } }
function comboPop(n, mult) {
  const el = document.createElement('div'); el.className = 'combo-pop' + (mult >= 3 ? ' hot' : '');
  el.innerHTML = `🔥 ${n} ברצף!${mult > 1 ? `<small>מטבעות ×${mult}</small>` : ''}`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1300);
  setTimeout(() => Sound.combo(n), 150);
}

/* ───────── מאגר כל השאלות (לריצה, לבוס ולחזרה) ───────── */
const POOL = [];
STATIONS.forEach((s, si) => s.games.forEach((g, gi) => {
  if (g.type === 'quiz') g.questions.forEach((q, k) => { q._k = `${s.id}.${gi}.${k}`; POOL.push(Object.assign({ si }, q)); });
  if (g.type === 'sort') g.items.forEach((it, k) => {
    it._k = `${s.id}.${gi}.${k}`;
    POOL.push({ si, _k: it._k, art: [it.e], q: `${it.t} – מה הדין?`, o: it.a === 'mine' ? ['🎒 שלו!', '📢 חייב להכריז'] : ['📢 חייב להכריז', '🎒 שלו!'], why: it.why });
  });
}));
const byKey = k => POOL.find(p => p._k === k);
ST.missed = ST.missed.filter(byKey);
const rushPool = () => POOL.filter(p => isDone(p.si) || ST.unlockAll);

/* ───────── ריצת הבלש ⚡ וקרב הבוס ⚔️ ───────── */
const MEDALS = [null, ['🥉', 'ארד'], ['🥈', 'כסף'], ['🥇', 'זהב'], ['💎', 'יהלום']];
const medalFor = acc => acc >= .95 ? 4 : acc >= .85 ? 3 : acc >= .7 ? 2 : 1;
function startRush(boss) {
  const pool = boss ? POOL.slice() : rushPool();
  if (!boss && pool.length < 6) { Sound.bad(); toast('⚡ ריצת הבלש נפתחת אחרי שמסיימים תחנה ראשונה'); return; }
  let queue = shuffle(pool); if (!boss) queue = queue.slice(0, 12);
  const B = boss ? { hp: 10, max: 10 } : null;
  const HEARTS = 5;
  let qi = 0, score = 0, right = 0, total = 0, hearts = HEARTS;
  SESS = { i: -1, st: null, mistakes: 0, correct: 0, earned: 0, streak: 0, best: 0 };
  const col = boss ? '#7c3aed' : '#f59e0b';
  setScreen(`
  <div class="game rush ${boss ? 'is-boss' : ''}" style="--c:${col}">
    <div class="g-head"><button class="x-btn" id="exit" aria-label="יציאה">✕</button>
      <div class="g-title">${boss ? '⚔️ קרב הבוס' : '⚡ ריצת הבלש'}</div>
      <div class="r-score"><b id="rs">0</b><small>נק׳</small></div></div>
    ${boss ? `<div class="boss"><div class="boss-e" id="be">🙈</div><div class="boss-info"><b>הַמִּתְעַלֵּם</b><small>רוצה שכולם יתעלמו מאבידות!</small><div class="hp"><i id="hp"></i></div></div><div class="hearts" id="hearts"></div></div>`
      : `<div class="r-meta"><span id="rn"></span><span class="r-combo" id="rc">×1</span></div>`}
    <div class="timer" id="tw"><i id="tm"></i></div>
    <div id="rq"></div>
  </div>`, 's-game');
  const run = {}; RUN = run;
  const alive = () => RUN === run;
  bindExit();
  const paint = () => {
    $('#rs').textContent = score.toLocaleString('en-US');
    if (boss) { $('#hp').style.width = (B.hp / B.max * 100) + '%'; $('#hearts').textContent = '❤️'.repeat(hearts) + '🖤'.repeat(HEARTS - hearts); }
    else {
      $('#rn').textContent = `שאלה ${Math.min(qi, queue.length)}/${queue.length}`;
      const rc = $('#rc'), m = '×' + comboMult(SESS.streak);
      if (rc.textContent !== m) { rc.textContent = m; rc.classList.toggle('on', m !== '×1'); bump(rc); }
    }
  };
  const pop = (txt, el) => {
    const [x, y] = FX.center(el), p = document.createElement('div');
    p.className = 'pts-pop'; p.textContent = txt; p.style.left = x + 'px'; p.style.top = y + 'px';
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
  };
  const next = () => {
    if (!alive()) return;
    if (boss ? (B.hp <= 0 || hearts <= 0) : qi >= queue.length) return end();
    if (boss && qi >= queue.length) queue = queue.concat(shuffle(pool));
    const q = queue[qi++]; total++;
    const opts = shuffle(q.o.map((t, k) => ({ t, ok: k === 0 })));
    $('#rq').innerHTML = `
      <div class="q-card r-card">${q.scene ? `<div class="scene">${q.scene}</div>` : `<div class="q-art">${artHTML(q.art)}</div>`}<div class="q-text">${nm(q.q)}</div></div>
      <div class="q-opts">${opts.map((o, k) => `<button class="opt" data-k="${k}" style="--d:${k * 60}ms"><span class="opt-l">${'אבגד'[k]}</span><span>${o.t}</span></button>`).join('')}</div>
      <div class="fb" id="fb"></div>`;
    paint();
    const T = (boss ? 22 : 18) * 1000, t0 = performance.now(), tw = $('#tw'), tm = $('#tm');
    let answered = false, lastSec = 99;
    const tick = () => {
      if (!alive() || answered) return;
      const left = Math.max(0, 1 - (performance.now() - t0) / T);
      tm.style.width = left * 100 + '%'; tw.classList.toggle('low', left < .25);
      const sec = Math.ceil(left * T / 1000);
      if (left < .25 && sec !== lastSec) { lastSec = sec; Sound.tick(); }
      if (left <= 0) return answer(null);
      requestAnimationFrame(tick);
    };
    const answer = b => {
      if (answered || !alive()) return; answered = true;
      const left = Math.max(0, 1 - (performance.now() - t0) / T), o = b ? opts[+b.dataset.k] : null;
      $$('#rq .opt').forEach(x => x.classList.add('dim'));
      if (o && o.ok) {
        b.classList.remove('dim'); b.classList.add('ok');
        const mult = hit(q._k) / 10, pts = 100 * mult + Math.round(left * 50);
        score += pts; right++; SESS.correct++;
        Sound.good(); pop(`+${pts}`, b); FX.burst(...FX.center(b), ['⭐', '✨'], 6);
        if (boss) {
          B.hp--; const be = $('#be');
          setTimeout(() => { Sound.hit(); be.classList.remove('ouch'); void be.offsetWidth; be.classList.add('ouch'); FX.burst(...FX.center(be), ['💥', '⭐', '💫'], 8); paint(); }, 250);
        }
        paint(); setTimeout(next, boss ? 950 : 800);
      } else {
        SESS.mistakes++; miss(q._k); Sound.bad();
        if (b) { b.classList.remove('dim'); b.classList.add('bad'); }
        const good = $$('#rq .opt').find(x => opts[+x.dataset.k].ok); good.classList.remove('dim'); good.classList.add('ok', 'reveal');
        if (boss) { hearts--; bump($('#hearts')); }
        paint();
        feedback(false, `<b>${o ? 'לא נורא! 💡' : '⏰ נגמר הזמן!'}</b> ${q.why || ''}`, next, 'המשך ←');
      }
    };
    $$('#rq .opt').forEach(b => b.onclick = () => answer(b));
    tick();
  };
  const end = () => {
    if (boss) return bossEnd(B.hp <= 0, score);
    const acc = right / total, medal = medalFor(acc), coins = Math.round(score / 40);
    const record = score > ST.stats.rushBest;
    ST.stats.rushes++; ST.stats.medal = Math.max(ST.stats.medal, medal);
    if (record) ST.stats.rushBest = score;
    ST.coins += coins; save();
    const [me, mn] = MEDALS[medal];
    setScreen(`
    <div class="results" style="--c:#f59e0b">
      <div class="medal-big">${me}</div>
      <h2>מדליית ${mn}!</h2>
      <div class="res-sub">ענית נכון על <b>${right}</b> מתוך ${total}</div>
      <div class="champ-score">${score.toLocaleString('en-US')}<small> נק׳</small></div>
      ${record ? `<div class="unlock gold">🏅 שיא חדש!</div>` : `<div class="res-sub">השיא שלך: ${ST.stats.rushBest.toLocaleString('en-US')}</div>`}
      <div class="res-stats">
        <div><b>${SESS.best}</b><small>🔥 רצף שיא</small></div>
        <div><b>${Math.round(acc * 100)}%</b><small>🎯 דיוק</small></div>
        <div><b>${coins}</b><small>🪙 מטבעות</small></div>
      </div>
      <div class="res-btns"><button class="btn big gold pulse" id="again">⚡ עוד ריצה</button><button class="btn ghost" id="toMap">🗺️ למפה</button></div>
    </div>`, 's-results');
    Sound.win(); FX.confetti(40 + medal * 40); if (record) setTimeout(() => FX.rain(80), 600);
    $('#again').onclick = () => { Sound.click(); startRush(false); };
    $('#toMap').onclick = () => { Sound.click(); renderMap(); };
  };
  next();
}
function startBoss() {
  setScreen(`
  <div class="splash" style="--c:#7c3aed">
    <div class="splash-tag">קרב הבוס</div>
    <div class="splash-ic boss-intro">🙈</div>
    <h2>הַמִּתְעַלֵּם</h2>
    <div class="owl-talk">${owl('sm talk')}<div class="bubble bubble-side">זהירות ${esc(ST.name)}! <b>המתעלם</b> רוצה שכולם יעברו ליד אבידות ו<b>יתעלמו</b>. אבל התורה אמרה "<b>לא תוכל להתעלם</b>"!<br>כל תשובה נכונה = מכה לבוס 💥 • יש לך 5 ❤️</div></div>
    <button class="btn big gold pulse" id="start">⚔️ להילחם!</button>
  </div>`, 's-splash');
  $('#start').onclick = () => { Sound.click(); startRush(true); };
}
function bossEnd(won, score) {
  if (won) { ST.stats.bosses++; ST.coins += 100; save(); }
  setScreen(`
  <div class="results" style="--c:#7c3aed">
    <div class="medal-big">${won ? '🏆' : '🙈'}</div>
    <h2>${won ? 'ניצחת את המתעלם!' : 'המתעלם ברח… הפעם!'}</h2>
    <div class="res-sub">${won ? `"השב תשיבם" – ${esc(ST.name)} לא מתעלם! 💪` : 'כל טעות מלמדת אותנו משהו. נסה שוב!'}</div>
    <div class="champ-score">${score.toLocaleString('en-US')}<small> נק׳</small></div>
    ${won ? `<div class="unlock gold">🪙 +100 מטבעות פרס!</div>` : ''}
    ${owl('md bob ' + (won ? 'happy' : ''))}
    <div class="res-btns"><button class="btn big gold pulse" id="again">⚔️ ${won ? 'עוד קרב' : 'נסה שוב'}</button><button class="btn ghost" id="toMap">🗺️ למפה</button></div>
  </div>`, 's-results');
  if (won) { Sound.win(); FX.confetti(200); setTimeout(() => FX.rain(120), 600); } else Sound.bad();
  $('#again').onclick = () => { Sound.click(); startRush(true); };
  $('#toMap').onclick = () => { Sound.click(); renderMap(); };
}

/* ───────── חזרה על טעויות 🔁 ───────── */
function startReview() {
  const qs = ST.missed.map(byKey).filter(Boolean).slice(-8);
  if (!qs.length) { toast('🎉 אין טעויות לחזור עליהן – מעולה!'); return; }
  SESS = { i: -1, st: null, mistakes: 0, correct: 0, earned: 0, streak: 0, best: 0 };
  gameQuiz({ title: '🔁 חזרה על טעויות', questions: shuffle(qs), keep: true }, () => {
    const left = ST.missed.length;
    setScreen(`
    <div class="results" style="--c:#0ea5e9">
      <div class="res-badge">🔁</div>
      <h2>${SESS.correct === qs.length ? 'תיקנת הכול!' : 'כל הכבוד על החזרה!'}</h2>
      <div class="res-sub">תיקנת <b>${SESS.correct}</b> מתוך ${qs.length} טעויות</div>
      <div class="unlock">${left ? `נשארו עוד <b>${left}</b> שאלות לחזרה 💪` : 'אין יותר טעויות לחזרה! 🧹✨'}</div>
      ${owl('md happy bob')}
      <div class="res-btns">${left ? `<button class="btn big primary pulse" id="again">🔁 עוד חזרה</button>` : ''}<button class="btn ${left ? 'ghost' : 'big primary pulse'}" id="toMap">🗺️ למפה</button></div>
    </div>`, 's-results');
    Sound.win(); FX.confetti(60 + SESS.correct * 15);
    if ($('#again')) $('#again').onclick = () => { Sound.click(); startReview(); };
    $('#toMap').onclick = () => { Sound.click(); renderMap(); };
  });
}

/* ───────── יום ברצף ותיבת אוצר יומית 🎁 ───────── */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function touchDay() {
  const t = dayKey(); if (ST.day.last === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  ST.day = { last: t, n: ST.day.last === dayKey(y) ? ST.day.n + 1 : 1 }; save();
}
function openChest() {
  if (ST.chest === dayKey()) { Sound.bad(); toast('🎁 כבר פתחת היום – חזור מחר לתיבה חדשה!'); return; }
  openModal(`
    <h3>🎁 תיבת האוצר היומית</h3>
    <div class="chest-wrap"><button class="chest" id="chest" aria-label="פתח תיבה">🧰</button></div>
    <div class="chest-msg" id="cm">לחץ על התיבה כדי לפתוח!</div>`);
  let taps = 0;
  $('#chest').onclick = e => {
    const c = e.currentTarget;
    if (ST.chest === dayKey()) return;
    taps++; Sound.flip(); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    if (taps < 3) { $('#cm').textContent = taps === 1 ? 'עוד קצת…' : 'כמעט נפתח!'; return; }
    const n = 15 + (Math.random() * 26 | 0), bonus = 5 * Math.min(ST.day.n, 7);
    ST.chest = dayKey(); ST.stats.chests++;
    c.textContent = '💰'; c.classList.add('open');
    FX.burst(...FX.center(c), ['🪙', '✨', '⭐', '💎'], 14); FX.confetti(100);
    addCoins(n + bonus, c); Sound.win();
    $('#cm').innerHTML = `קיבלת <b>${n}</b> 🪙${bonus ? `<br>+ בונוס רצף ${ST.day.n} ימים: <b>${bonus}</b> 🔥` : ''}<br><small>חזור מחר לתיבה חדשה!</small>`;
    paintMapActions();
  };
}

/* ───────── תגים 🏅 ───────── */
const doneCount = () => STATIONS.filter((s, i) => isDone(i)).length;
const BADGES = [
  { id: 'first', e: '🚀', name: 'יוצא לדרך', desc: 'סיימת תחנה ראשונה', test: () => doneCount() >= 1 },
  { id: 'half', e: '🧭', name: 'חצי הדרך', desc: 'סיימת 4 תחנות', test: () => doneCount() >= 4 },
  { id: 'all', e: '🏆', name: 'הדרן!', desc: 'סיימת את כל הפרק', test: () => allDone() },
  { id: 'perfect', e: '🌟', name: 'מושלם', desc: '3 כוכבים בתחנה', test: () => Object.values(ST.stars).some(v => v >= 3) },
  { id: 'allstars', e: '💫', name: 'כוכב על', desc: '3 כוכבים בכל התחנות', test: () => STATIONS.every(s => ST.stars[s.id] === 3) },
  { id: 'streak5', e: '🔥', name: 'בוער!', desc: '5 תשובות נכונות ברצף', test: () => ST.stats.bestStreak >= 5 },
  { id: 'streak12', e: '☄️', name: 'כוכב שביט', desc: '12 תשובות נכונות ברצף', test: () => ST.stats.bestStreak >= 12 },
  { id: 'right50', e: '✅', name: '50 תשובות', desc: 'ענית נכון 50 פעמים', test: () => ST.stats.right >= 50 },
  { id: 'right200', e: '🧠', name: 'תלמיד חכם', desc: 'ענית נכון 200 פעמים', test: () => ST.stats.right >= 200 },
  { id: 'rush', e: '⚡', name: 'בלש מהיר', desc: 'סיימת ריצת בלש', test: () => ST.stats.rushes >= 1 },
  { id: 'gold', e: '🥇', name: 'זהב!', desc: 'מדליית זהב בריצת בלש', test: () => ST.stats.medal >= 3 },
  { id: 'diamond', e: '💎', name: 'יהלום', desc: 'מדליית יהלום בריצת בלש', test: () => ST.stats.medal >= 4 },
  { id: 'boss', e: '⚔️', name: 'לא מתעלם!', desc: 'ניצחת את הבוס "המתעלם"', test: () => ST.stats.bosses >= 1 },
  { id: 'fix10', e: '🔁', name: 'לומד מטעויות', desc: 'תיקנת 10 טעויות', test: () => ST.stats.fixed >= 10 },
  { id: 'days3', e: '📆', name: '3 ימים ברצף', desc: 'למדת 3 ימים ברצף', test: () => ST.day.n >= 3 },
  { id: 'days7', e: '📅', name: 'שבוע שלם', desc: 'למדת 7 ימים ברצף', test: () => ST.day.n >= 7 },
  { id: 'chest5', e: '🎁', name: 'צייד אוצרות', desc: 'פתחת 5 תיבות יומיות', test: () => ST.stats.chests >= 5 },
  { id: 'shop', e: '🎩', name: 'אופנתי', desc: 'קנית פריט ליוני', test: () => ST.owned.length >= 1 },
  { id: 'rich', e: '💰', name: 'עשיר', desc: '300 מטבעות בבת אחת', test: () => ST.coins >= 300 },
];
const badgeQ = [];
function checkBadges() {
  if (!ST.name) return;
  const fresh = BADGES.filter(b => !ST.badges.includes(b.id) && b.test());
  if (!fresh.length) return;
  ST.badges.push(...fresh.map(b => b.id));
  const idle = !badgeQ.length; badgeQ.push(...fresh);
  if (idle) setTimeout(showBadge, 900);
}
function showBadge() {
  const b = badgeQ[0]; if (!b) return;
  const el = document.createElement('div'); el.className = 'badge-pop';
  el.innerHTML = `<span class="bp-e">${b.e}</span><div class="bp-t"><small>🏅 תג חדש!</small><b>${b.name}</b><span>${b.desc}</span></div>`;
  el.onclick = () => el.classList.add('out');
  document.body.appendChild(el); Sound.badge(); FX.confetti(50, innerWidth / 2, 70);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => { el.remove(); badgeQ.shift(); if (badgeQ.length) setTimeout(showBadge, 250); }, 3000);
}
function openBadges() {
  openModal(`
    <h3>🏅 התגים שלי</h3>
    <div class="shop-bal"><b>${ST.badges.length}</b> מתוך ${BADGES.length}</div>
    <div class="badge-grid">${BADGES.map(b => {
      const on = ST.badges.includes(b.id);
      return `<div class="bdg ${on ? 'on' : ''}"><span class="bdg-e">${on ? b.e : '🔒'}</span><b>${b.name}</b><small>${b.desc}</small></div>`;
    }).join('')}</div>`);
}

/* ───────── שורת הפעולות במפה ───────── */
function paintMapActions() {
  const el = $('#mact'); if (!el) return;
  const chestReady = ST.chest !== dayKey(), rushOk = rushPool().length >= 6, nm_ = ST.missed.length;
  el.innerHTML = `
    <div class="ma ma-streak"><span>🔥</span><small><b>${ST.day.n}</b> ${ST.day.n === 1 ? 'יום' : 'ימים'}</small></div>
    <button class="ma ${chestReady ? 'ready' : 'used'}" id="ma-chest"><span>${chestReady ? '🎁' : '✅'}</span><small>תיבה יומית</small></button>
    <button class="ma ${rushOk ? 'ready' : 'off'}" id="ma-rush"><span>⚡</span><small>ריצת בלש</small></button>
    <button class="ma ${nm_ ? '' : 'off'}" id="ma-rev"><span>🔁</span><small>חזרה</small>${nm_ ? `<i class="ma-n">${nm_}</i>` : ''}</button>
    <button class="ma" id="ma-bdg"><span>🏅</span><small>${ST.badges.length}/${BADGES.length}</small></button>`;
  $('#ma-chest').onclick = () => { Sound.click(); openChest(); };
  $('#ma-rush').onclick = () => { Sound.click(); startRush(false); };
  $('#ma-rev').onclick = () => { Sound.click(); startReview(); };
  $('#ma-bdg').onclick = () => { Sound.click(); openBadges(); };
}

/* ───────── תוצאות תחנה ───────── */
function renderResults() {
  const st = SESS.st, m = SESS.mistakes;
  const stars = m <= 1 ? 3 : m <= 4 ? 2 : 1;
  const wasDone = isDone(SESS.i), prev = ST.stars[st.id] || 0;
  ST.stars[st.id] = Math.max(prev, stars);
  const bonus = stars * 10; ST.coins += bonus; save();
  const nextSt = STATIONS[SESS.i + 1];
  const unlockedNew = !wasDone && !ST.unlockAll;
  const finishedAll = allDone() && !wasDone;
  setScreen(`
  <div class="results" style="--c:${st.color}">
    <div class="res-badge">${st.icon}</div>
    <h2>${stars === 3 ? 'מושלם!' : stars === 2 ? 'כל הכבוד!' : 'סיימת!'} ${esc(ST.name)}</h2>
    <div class="res-sub">סיימת את התחנה "${st.title}"</div>
    <div class="big-stars">${[0, 1, 2].map(k => `<span class="bs" data-on="${k < stars ? 1 : 0}">★</span>`).join('')}</div>
    <div class="res-stats">
      <div><b>${SESS.correct}</b><small>✅ נכונות</small></div>
      <div><b>${SESS.best || 0}</b><small>🔥 רצף שיא</small></div>
      <div><b id="earn">0</b><small>🪙 מטבעות</small></div>
    </div>
    ${finishedAll ? `<div class="unlock gold">🏆 סיימת את כל התחנות! התעודה מחכה לך!</div>`
      : unlockedNew && nextSt ? `<div class="unlock">🔓 נפתחה תחנה חדשה: <b>${nextSt.icon} ${nextSt.title}</b></div>` : ''}
    ${owl('md happy bob')}
    <div class="res-btns">
      ${finishedAll ? `<button class="btn big gold pulse" id="toFinal">🏆 לתעודה!</button>` : `<button class="btn big primary pulse" id="toMap">🗺️ למפה</button>`}
      <button class="btn ghost" id="again">🔁 שוב את התחנה</button>
    </div>
  </div>`, 's-results');
  Sound.win(); FX.confetti(160);
  $$('.bs').forEach((s, k) => setTimeout(() => { s.classList.add('show'); if (s.dataset.on === '1') { Sound.star(k); FX.burst(...FX.center(s), ['⭐', '✨'], 6); } }, 500 + k * 450));
  const total = SESS.earned + bonus; let c = 0; const step = Math.max(1, Math.round(total / 30));
  const ct = setInterval(() => { c = Math.min(total, c + step); const e = $('#earn'); if (!e) return clearInterval(ct); e.textContent = c; if (c >= total) clearInterval(ct); }, 40);
  if ($('#toMap')) $('#toMap').onclick = () => { Sound.click(); renderMap(); };
  if ($('#toFinal')) $('#toFinal').onclick = () => { Sound.click(); renderFinal(); };
  $('#again').onclick = () => { Sound.click(); startStation(SESS.i); };
}

/* ───────── סיום: תעודה ───────── */
function hebDate() {
  try { return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); }
  catch (e) { return new Date().toLocaleDateString('he-IL'); }
}
function renderFinal() {
  setScreen(`
  <div class="final">
    <div class="cert">
      <div class="cert-ribbon">🏆</div>
      <div class="cert-h">תְּעוּדַת סִיּוּם</div>
      <div class="cert-p">מוענקת בגאווה ל</div>
      <div class="cert-name">${esc(ST.name)}</div>
      <div class="cert-p">על לימוד פרק</div>
      <div class="cert-perek">אֵלּוּ מְצִיאוֹת</div>
      <div class="cert-p">מסכת בבא מציעא • פרק שני</div>
      <div class="hadran">הַדְרָן עֲלָךְ פֶּרֶק אֵלּוּ מְצִיאוֹת<br>וְהַדְרָךְ עֲלָן!</div>
      <div class="cert-foot"><span>⭐ ${totalStars()} / ${STATIONS.length * 3}</span><span>${hebDate()}</span><span>🕊️ יוני הבלש</span></div>
    </div>
    <div class="final-btns">
      <button class="btn big gold pulse" id="champ">⚔️ קרב הבוס!</button>
      <button class="btn primary" id="toMap">🗺️ למפה</button>
    </div>
  </div>`, 's-final');
  Sound.win(); FX.confetti(200); setTimeout(() => FX.rain(120), 700); setTimeout(() => FX.confetti(120, innerWidth * .2, innerHeight * .3), 1500); setTimeout(() => FX.confetti(120, innerWidth * .8, innerHeight * .3), 2100);
  $('#toMap').onclick = () => { Sound.click(); renderMap(); };
  $('#champ').onclick = () => { Sound.click(); startBoss(); };
}

/* ───────── חנות ───────── */
function openShop() {
  const draw = () => {
    openModal(`
    <h3>🛍️ החנות של יוני</h3>
    <div class="shop-owl">${owl('md bob')}</div>
    <div class="shop-bal">יש לך <b>${ST.coins}</b> 🪙</div>
    <div class="shop-grid">${SHOP.map(it => {
      const own = ST.owned.includes(it.id), on = ST.wear[it.slot] === it.id;
      return `<button class="shop-it ${own ? 'own' : ''} ${on ? 'on' : ''} ${!own && ST.coins < it.cost ? 'poor' : ''}" data-id="${it.id}">
        <span class="si-ic">${it.e}</span><span>${it.name}</span>
        <small>${on ? '✔ לובש' : own ? 'ללבוש' : `🪙 ${it.cost}`}</small></button>`;
    }).join('')}</div>`);
    $$('.shop-it').forEach(b => b.onclick = () => {
      const it = SHOP.find(s => s.id === b.dataset.id);
      if (ST.owned.includes(it.id)) {
        if (ST.wear[it.slot] === it.id) delete ST.wear[it.slot]; else ST.wear[it.slot] = it.id;
        Sound.click(); save(); draw(); refreshOwls();
      } else if (ST.coins >= it.cost) {
        ST.coins -= it.cost; ST.owned.push(it.id); ST.wear[it.slot] = it.id; save();
        Sound.win(); FX.confetti(80); draw(); refreshOwls(); toast(`🎉 קנית ${it.name}!`);
      } else { Sound.bad(); bump(b); toast(`חסרים לך ${it.cost - ST.coins} 🪙 – תמשיך לשחק!`); }
    });
  };
  draw();
}
function refreshOwls() {
  $$('#screen .owl').forEach(o => { const cls = o.className; const tmp = document.createElement('div'); tmp.innerHTML = owl(cls.replace(/^owl\s*/, '')); o.replaceWith(tmp.firstChild); });
}

/* ───────── הגדרות ───────── */
function openSettings() {
  openModal(`
  <h3>⚙️ הגדרות</h3>
  <label class="set-row">השם שלי<input id="setName" class="name-in sm" maxlength="16" value="${esc(ST.name)}"></label>
  <button class="btn primary" id="saveName">💾 שמור שם</button>
  <hr>
  <div class="set-note">👨‍👩‍👦 להורים</div>
  <button class="btn ghost" id="unlock">${ST.unlockAll ? '🔒 נעל תחנות לפי הסדר' : '🔓 פתח את כל התחנות'}</button>
  <button class="btn danger" id="reset">🗑️ התחל מחדש (מחק התקדמות)</button>
  <div class="set-foot">מסע המציאות • נבנה באהבה ללימוד פרק אלו מציאות 💙</div>`);
  $('#saveName').onclick = () => { const v = $('#setName').value.trim(); if (v) { ST.name = v; save(); toast('✔ נשמר!'); closeModal(); renderMap(); } };
  $('#unlock').onclick = () => { ST.unlockAll = !ST.unlockAll; save(); closeModal(); renderMap(); };
  let armed = false;
  $('#reset').onclick = e => {
    if (!armed) { armed = true; e.target.textContent = '⚠️ בטוח? לחץ שוב למחיקה'; return; }
    const sound = ST.sound; ST = Object.assign(DEF(), { sound, stats: Object.assign({}, DEF_STATS) }); save(); closeModal(); renderWelcome();
  };
}

/* ───────── אתחול ───────── */
function init() {
  FX.init(); Speech.init();
  $('#tb-home').onclick = () => { Sound.click(); closeModal(); renderMap(); };
  $('#tb-sound').onclick = () => { ST.sound = !ST.sound; save(); Sound.click(); };
  $('#tb-shop').onclick = () => { Sound.click(); openShop(); };
  $('#tb-set').onclick = () => { Sound.click(); openSettings(); };
  document.addEventListener('pointerdown', () => Sound.ensure(), { once: true });
  updateTopbar();
  ST.name ? renderMap() : renderWelcome();
}
init();
})();

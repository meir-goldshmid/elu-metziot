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
const DEF = { name: '', coins: 0, stars: {}, unlockAll: false, sound: true, owned: [], wear: {} };
let ST;
try { ST = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { ST = Object.assign({}, DEF); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* פרטי */ } updateTopbar(); }
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

/* ───────── הינשוף ───────── */
const OWL_SVG = `<svg viewBox="0 0 120 130" class="owl-svg" aria-hidden="true">
<ellipse cx="60" cy="125" rx="32" ry="4.5" fill="rgba(0,0,0,.15)"/>
<path d="M24 52 L27 16 L50 36 Z" fill="#7a4a26"/><path d="M96 52 L93 16 L70 36 Z" fill="#7a4a26"/>
<g class="wing-r"><path d="M100 70 q16 24 -6 46 q-8 -22 6 -46z" fill="#7a4a26"/></g>
<g class="wing-l"><path d="M20 70 q-16 24 6 46 q8 -22 -6 -46z" fill="#7a4a26"/></g>
<ellipse cx="60" cy="78" rx="43" ry="46" fill="#9c6236"/>
<ellipse cx="60" cy="93" rx="28" ry="30" fill="#f3d9b1"/>
<path d="M44 86q4 4 8 0M56 94q4 4 8 0M68 86q4 4 8 0M50 104q4 4 8 0M62 104q4 4 8 0" stroke="#d6a86f" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M44 35 Q60 22 76 35 Q60 31 44 35Z" fill="#3b5bdb"/><path d="M46 34 Q60 26 74 34" stroke="#93c5fd" stroke-width="1.5" fill="none"/>
<circle cx="42" cy="57" r="17" fill="#fff" stroke="#6b3f1d" stroke-width="3"/><circle cx="78" cy="57" r="17" fill="#fff" stroke="#6b3f1d" stroke-width="3"/>
<g class="pupils"><circle cx="44" cy="59" r="8" fill="#1e1b4b"/><circle cx="80" cy="59" r="8" fill="#1e1b4b"/><circle cx="47" cy="55.5" r="2.8" fill="#fff"/><circle cx="83" cy="55.5" r="2.8" fill="#fff"/></g>
<g class="lids"><ellipse cx="42" cy="57" rx="18.5" ry="18.5" fill="#9c6236"/><ellipse cx="78" cy="57" rx="18.5" ry="18.5" fill="#9c6236"/></g>
<path class="brows" d="M28 38 q12 -6 22 0 M70 38 q10 -6 22 0" stroke="#5a3418" stroke-width="3.5" fill="none" stroke-linecap="round"/>
<circle cx="25" cy="74" r="5.5" fill="#fb7185" opacity=".45"/><circle cx="95" cy="74" r="5.5" fill="#fb7185" opacity=".45"/>
<path d="M53 69 L67 69 L60 81 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M48 120 l-5 5 M48 120 v6 M48 120 l5 5 M72 120 l-5 5 M72 120 v6 M72 120 l5 5" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
<g class="mag"><line x1="103" y1="108" x2="114" y2="124" stroke="#6b3f1d" stroke-width="6" stroke-linecap="round"/><circle cx="97" cy="98" r="13" fill="rgba(186,230,253,.55)" stroke="#475569" stroke-width="4"/><path d="M90 93 q4 -5 10 -4" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
</svg>`;
function owl(cls = '') {
  const acc = Object.entries(ST.wear || {}).map(([slot, id]) => { const it = SHOP.find(s => s.id === id); return it ? `<span class="acc acc-${slot}">${it.e}</span>` : ''; }).join('');
  return `<div class="owl ${cls}">${OWL_SVG}${acc}</div>`;
}

/* ───────── שלד ───────── */
const screen = $('#screen');
let SESS = null;
function setScreen(html, cls = '') {
  Speech.stop();
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
    <div class="bubble bubble-up">שלום! אני <b>ינשופי הבלש</b> 🔍<br>איך קוראים לך?</div>
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
  $('#topbar').classList.remove('hidden'); updateTopbar();
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
  ];
  setScreen(`
  <div class="map">
    <div class="map-hello">${owl('sm')}<div class="bubble bubble-side"><b>שלום ${esc(ST.name)}!</b><br>${allDone() ? 'סיימת את כל הפרק! 🎉 לחץ על הגביע 🏆' : pick(msgs)}</div></div>
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
  const curEl = $('.node.current');
  if (curEl && cur > 0) setTimeout(() => curEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
}

/* ───────── תחנה: לימוד ───────── */
function startStation(i) {
  SESS = { i, st: STATIONS[i], mistakes: 0, correct: 0, earned: 0, gi: 0 };
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
        Sound.good(); FX.burst(...FX.center(b)); addCoins(10, b);
        if (SESS) { SESS.correct++; SESS.earned += 10; }
        feedback(true, `<b>${praise()}</b> ${q.why || ''}`, goOn);
      } else {
        b.classList.remove('dim'); b.classList.add('bad');
        const good = $$('.opt').find(x => opts[+x.dataset.k].ok); good.classList.remove('dim'); good.classList.add('ok', 'reveal');
        Sound.bad(); bump($('.q-card'));
        if (SESS) SESS.mistakes++;
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
      Sound.good(); addCoins(10, bin);
      SESS.correct++; SESS.earned += 10;
      feedback(true, `<b>${praise()}</b> ${it.why}`, goOn);
    } else {
      card.classList.remove('enter'); card.style.transform = ''; bump(card); card.classList.add('wrong');
      setTimeout(() => card.classList.remove('wrong'), 500);
      right.classList.add('hint-ok'); setTimeout(() => right.classList.remove('hint-ok'), 1600);
      Sound.bad(); SESS.mistakes++;
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
        <span class="mc-in"><span class="mc-front">🦉</span><span class="mc-back ${c.kind}">${c.t}</span></span>
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
      <div><b>${m}</b><small>💡 למדתי מטעויות</small></div>
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
      <div class="cert-foot"><span>⭐ ${totalStars()} / ${STATIONS.length * 3}</span><span>${hebDate()}</span><span>🦉 ינשופי הבלש</span></div>
    </div>
    <div class="final-btns">
      <button class="btn big gold pulse" id="champ">⚡ חידון האלופים</button>
      <button class="btn primary" id="toMap">🗺️ למפה</button>
    </div>
  </div>`, 's-final');
  Sound.win(); FX.confetti(200); setTimeout(() => FX.rain(120), 700); setTimeout(() => FX.confetti(120, innerWidth * .2, innerHeight * .3), 1500); setTimeout(() => FX.confetti(120, innerWidth * .8, innerHeight * .3), 2100);
  $('#toMap').onclick = () => { Sound.click(); renderMap(); };
  $('#champ').onclick = () => { Sound.click(); startChamp(); };
}

/* ───────── חידון האלופים: שאלות מכל הפרק ───────── */
function startChamp() {
  const pool = [];
  STATIONS.forEach(s => s.games.forEach(g => {
    if (g.type === 'quiz') pool.push(...g.questions);
    if (g.type === 'sort') g.items.forEach(it => pool.push({ art: [it.e], q: `${it.t} – מה הדין?`, o: it.a === 'mine' ? ['🎒 שלו!', '📢 חייב להכריז'] : ['📢 חייב להכריז', '🎒 שלו!'], why: it.why }));
  }));
  SESS = { i: -1, st: null, mistakes: 0, correct: 0, earned: 0, champ: true };
  gameQuiz({ title: '⚡ חידון האלופים', questions: shuffle(pool).slice(0, 10), keep: true }, () => {
    const sc = SESS.correct;
    setScreen(`
    <div class="results" style="--c:#eab308">
      <div class="res-badge">⚡</div>
      <h2>${sc >= 9 ? 'אלוף הפרק!' : sc >= 7 ? 'מצוין!' : 'יפה מאוד!'}</h2>
      <div class="res-sub">ענית נכון על <b>${sc}</b> מתוך 10</div>
      <div class="champ-score">${sc}<small>/10</small></div>
      ${owl('md happy bob')}
      <div class="res-btns"><button class="btn big gold pulse" id="again">⚡ עוד סיבוב</button><button class="btn ghost" id="toMap">🗺️ למפה</button></div>
    </div>`, 's-results');
    Sound.win(); FX.confetti(sc * 20 + 40);
    $('#again').onclick = () => { Sound.click(); startChamp(); };
    $('#toMap').onclick = () => { Sound.click(); renderMap(); };
  });
}

/* ───────── חנות ───────── */
function openShop() {
  const draw = () => {
    openModal(`
    <h3>🛍️ החנות של ינשופי</h3>
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
    const sound = ST.sound; ST = Object.assign({}, DEF, { sound }); save(); closeModal(); renderWelcome();
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

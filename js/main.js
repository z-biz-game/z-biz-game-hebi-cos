// Wiring: DOM, pointer + keyboard input, the clock, storage, and the `window.hebi` surface the
// verification harness drives. No rule about the board lives here — every judgement comes from
// js/engine/ through js/ui/game.js.
//
// 默认 seed 取自存档里的自增游标，绝不取 Date.now()：页面上印着 "seed 7" 就必须能用
// 同一个 7 + 同一档重新出同一张盘。闸里那条断言量的是这个（见 tools/scenarios.js 的 seed 段）。

import { Palette, applyThemeVars, setReduceMotion, systemPrefersReducedMotion, GLYPH, Cell } from './theme.js';
import { Sound } from './audio/synth.js';
import { Store } from './store.js';
import * as Hebi from './engine/hebi.js';
import * as Gen from './engine/generate.js';
import { solvePencil } from './engine/pencil.js';
import { candidates, countSolutions } from './engine/count.js';
import { mulberry32, shuffled } from './engine/rng.js';
import { BoardView } from './render/board.js';
import { Game, TIERS, tierOf, tierFor, build, rebuild, UND, BLANK, OUT_OF_MENU } from './ui/game.js';

const VERSION = '1.0.0';
// 每个文档一个身份：片段跳转不换文档，所以这一个身份在 hash 导航后必须还在、
// 真重载后必须消失。它是"续局这一腿跑在新文档里"的证人之一。
const DOC = 'doc' + Math.random().toString(36).slice(2, 10);

const $ = (sel) => document.querySelector(sel);
const el = {
  viewMenu: $('#view-menu'),
  viewGame: $('#view-game'),
  tiers: $('#tier-list'),
  records: $('#record-list'),
  resumeCard: $('#resume-card'),
  resumeName: $('#resume-name'),
  resumeMeta: $('#resume-meta'),
  name: $('#stat-name'),
  tier: $('#stat-tier'),
  seed: $('#stat-seed'),
  time: $('#stat-time'),
  moves: $('#stat-moves'),
  hints: $('#stat-hints'),
  filled: $('#stat-filled'),
  remaining: $('#stat-remaining'),
  snakes: $('#stat-snakes'),
  conflicts: $('#stat-conflicts'),
  score: $('#stat-score'),
  genms: $('#stat-genms'),
  hintRule: $('#hint-rule'),
  hintLine: $('#hint-line'),
  hintCount: $('#hint-count'),
  stateLine: $('#state-line'),
  winVeil: $('#win-veil'),
  winMeta: $('#win-meta'),
  winRecord: $('#win-record'),
  wrap: $('#board-wrap'),
  canvas: $('#board'),
};

const view = new BoardView(el.canvas);
let game = null;
let pulse = null;
let startedAt = 0;
let baseElapsed = 0;
let ticker = 0;
// 状态行的优先级：一次性通知（"这格是黑格，改不了"）> 违反读数 > 空。
// 第一版没有这一层，拒答的那句话被 syncStats 的违反文本当场盖掉——玩家点了黑格，
// 屏幕上只看到"6 条违反"，完全不知道自己要的那一步为什么没落下去。
let notice = '';
const say = (s) => {
  notice = s || '';
};
const keys = { seen: 0, handled: 0, repeated: 0, last: '', by: {} };

const clock = () => baseElapsed + (startedAt ? Date.now() - startedAt : 0);
const running = () => !!startedAt;

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function availBox() {
  const narrow = window.innerWidth <= 900;
  const w = narrow ? window.innerWidth - 40 : el.viewGame.clientWidth - 340;
  return { w: Math.max(240, w), h: Math.max(240, window.innerHeight - 260) };
}

function draw() {
  if (!game) return;
  const { w, h } = availBox();
  view.resize(game, w, h);
  view.draw(game, { pulse });
}

// One place writes the readouts, so a stat can never be updated by half the file.
function syncStats() {
  if (!game) return;
  const st = game.state();
  el.name.textContent = `${st.name} · ${game.R}×${game.C} · ${st.clues} 条线索`;
  el.tier.textContent = st.name;
  el.tier.dataset.tier = st.tier;
  el.seed.textContent = `seed ${st.seed}`;
  el.seed.dataset.seed = String(st.seed);
  el.time.textContent = fmtMs(clock());
  el.moves.textContent = st.moves;
  el.hints.textContent = st.hints;
  el.hintCount.textContent = st.hints;
  el.filled.textContent = `${st.filled}/${st.total}`;
  el.remaining.textContent = st.remaining;
  el.snakes.textContent = `${st.snakes}/${st.snakesTotal}`;
  el.conflicts.textContent = st.conflicts;
  el.score.textContent = st.score;
  el.genms.textContent = `${st.genMs} ms`;
  el.conflicts.closest('.stat').classList.toggle('bad', st.conflicts > 0);
  el.remaining.closest('.stat').classList.toggle('bad', st.status !== 'won' && st.remaining > 0);
  el.snakes.closest('.stat').classList.toggle('bad', st.status !== 'won' && st.snakes < st.snakesTotal);
  const first = st.conflicts ? game.errs[0] : '';
  el.stateLine.textContent = notice
    ? notice
    : st.conflicts
      ? `${st.conflicts} 条违反：${first}`
      : st.snakes < st.snakesTotal && st.remaining === 0
        ? `数字都定完了，但蛇还没排满 ${st.snakesTotal} 条：留空和数字都要写完。`
        : '';
  for (const b of document.querySelectorAll('.digits .digit')) {
    const v = b.classList.contains('blank') ? BLANK : Number(b.textContent);
    b.setAttribute('aria-pressed', String(game.cursor >= 0 && game.st[game.cursor] === v));
  }
}

function syncAll() {
  syncStats();
  draw();
}

function flushResume() {
  if (!game || game.status === 'won') return;
  Store.saveResume(game.puzzle, game.codes(), clock(), { moves: game.moves, hints: game.hints });
}

function startClock() {
  startedAt = Date.now();
  clearInterval(ticker);
  ticker = setInterval(() => {
    el.time.textContent = fmtMs(clock());
    if (pulse) draw();
  }, 1000);
}

function stopClock() {
  baseElapsed = clock();
  startedAt = 0;
  clearInterval(ticker);
  ticker = 0;
}

function showHint(info) {
  if (!info) return;
  if (info.stalled) {
    el.hintRule.textContent = '推不动了';
    el.hintLine.textContent = info.text;
    return;
  }
  if (info.conflict) {
    el.hintRule.textContent = '这里和题面矛盾';
    el.hintLine.textContent = info.conflict;
    Sound.conflict();
    return;
  }
  el.hintRule.textContent = `规则：${info.rule}`;
  el.hintLine.textContent = info.text;
  pulse = { cell: info.cell };
  const mine = pulse;
  setTimeout(() => {
    if (pulse === mine) pulse = null;
    draw();
  }, 1600);
  Sound.hint();
}

function onWin() {
  stopClock();
  const ms = clock();
  const better = Store.recordBest(game.puzzle.tier, {
    ms,
    hints: game.hints,
    moves: game.moves,
    size: `${game.R}×${game.C}`,
  });
  Store.recordSolve(ms, game.hints);
  Store.clearResume();
  const f = game.winFacts();
  el.winMeta.textContent = `${tierFor(game.puzzle.tier).name} · ${game.R}×${game.C} · seed ${game.puzzle.seed} · ${fmtMs(ms)} · ${game.moves} 步 · 提示 ${game.hints} 次`;
  el.winRecord.textContent =
    `判据 ${f.errs} 条违反 · 白格全定 ${f.decided}/${f.white} · 与唯一解逐格相同（${f.mismatch} 处不同） · ` +
    (better ? '新纪录：这一局比存档里的更不求人。' : '未破纪录：同档先比提示次数。');
  el.winVeil.hidden = false;
  el.stateLine.textContent = '';
  Sound.win();
  renderRecords();
}

function afterStep(soundKey) {
  syncAll();
  if (game.status === 'won') onWin();
  else {
    flushResume();
    if (soundKey) Sound[soundKey]();
    if (game.errs.length) Sound.conflict();
  }
}

function useHint() {
  if (!game || game.status === 'won') return null;
  const before = game.hints;
  const info = game.hint();
  if (!info) return null;
  // An unproductive hint is not a purchase: nothing was written, nothing is charged.
  if (info.stalled || info.conflict) {
    showHint(info);
    return info;
  }
  showHint(info);
  if (game.hints !== before) afterStep('place');
  return info;
}

function undo() {
  if (!game) return null;
  const step = game.undo();
  if (!step) return null;
  pulse = null;
  Sound.undo();
  syncAll();
  flushResume();
  return step;
}

// 写一格：数字 1–5、BLANK（钉成留空）或 UND（收回未定）。
// 黑格会被 Game.set 挡回来，并把挡回来的那句话写进状态行——玩家得看得见"为什么没落子"。
function write(i, v) {
  if (!game) return null;
  const r = game.set(i, v);
  if (r.refused) {
    say(r.refused);
    Sound.refuse();
    syncAll();
    return null;
  }
  if (r.noop) return null;
  say('');
  game.select(i);
  if (v >= 1) Sound.digit(v);
  else if (v === BLANK) Sound.blank();
  else Sound.erase();
  afterStep(null);
  return r.step;
}

function select(i) {
  if (!game || i < 0) return false;
  const ok = game.select(i);
  say(ok ? '' : `${game.B.name(i)} 是黑格：选不中，也改不了。`);
  syncAll();
  return ok;
}

// ---- 出题：seed 只来自存档游标 ----

function nextSeed(used) {
  Store.advanceSeed(used);
  return Store.peekSeed();
}

function begin({ tier = 'sho', seed = null, resume = null } = {}) {
  const spec = tierFor(tier);
  let request = seed;
  if (request === null || !Number.isInteger(request)) request = Store.peekSeed();
  let puzzle = null;
  let probe = request;
  // 游标那一号出不了货就往后推：这里没有"换个随机种子再试一次"的余地，
  // 因为那等于让页面上的 seed 变成一句假话。
  for (let k = 0; k < 5 && !puzzle; k++) {
    puzzle = build(spec, probe);
    if (!puzzle) probe++;
  }
  if (!puzzle) {
    el.stateLine.textContent = `这一档连着 5 号 seed 都没出货（${spec.name} ${spec.R}×${spec.C}），换一档试试。`;
    return null;
  }
  if (resume) {
    // 续局照存档里的题面重建，不重新出题：省掉那一笔实测的生成耗时，也让"同一 seed 同一盘"
    // 与"续上昨天那一局"是两件分别成立的事。
    const rb = rebuild(spec, resume.bl);
    puzzle.B = rb.B;
    puzzle.black = rb.black;
  }
  game = new Game(puzzle);
  pulse = null;
  el.winVeil.hidden = true;
  baseElapsed = 0;
  if (resume) {
    game.moves = resume.moves || 0;
    game.hints = resume.hints || 0;
    baseElapsed = resume.elapsedMs || 0;
    game.loadCodes(resume.cells);
    game.cursor = game.white.find((i) => game.st[i] === UND) ?? game.white[0];
  } else {
    game.cursor = game.white[0];
  }
  nextSeed(puzzle.seed);
  show('game');
  startClock();
  el.hintRule.textContent = '提示理由';
  el.hintLine.textContent = '按 提示 会说出当前能推的一格，以及它依据哪条命名规则。';
  say('');
  syncAll();
  flushResume();
  renderResumeCard();
  writeHash();
  return game;
}

function writeHash() {
  if (!game) return;
  const h = `#t=${game.puzzle.tier}&s=${game.puzzle.seed}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

// 只认这一种形状：#t=<档>&s=<seed>。其余的 hash（例如闸里用来证明"片段导航不是重载"的
// #gate-fragment-nav）一律不碰盘面。
function parseHash() {
  const m = /^#t=([a-z]+)&s=(\d+)$/.exec(location.hash || '');
  if (!m) return null;
  const seed = Number(m[2]);
  return { tier: m[1], seed: Number.isInteger(seed) && seed >= 1 ? seed : null };
}

function show(which) {
  el.viewMenu.hidden = which !== 'menu';
  el.viewGame.hidden = which !== 'game';
  if (which === 'menu') {
    stopClock();
    renderMenu();
  }
  if (which === 'game') draw();
  return which;
}

function renderMenu() {
  renderTiers();
  renderRecords();
  renderResumeCard();
}

const TIER_NOTE = {
  sho: '蛇少线索密，一格一数就推得完',
  chuu: '要开始用"围"和"眼"把白格钉成留空',
  gao: '八八盘、五条蛇，箭头读数要连着看好几处',
};

function renderTiers() {
  el.tiers.innerHTML = '';
  for (const t of TIERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tier';
    b.dataset.tier = t.key;
    b.innerHTML =
      `<span class="tier-name">${t.name}</span>` +
      `<span class="tier-note">${TIER_NOTE[t.key] || ''}</span>` +
      `<span class="tier-size mono">${t.R}×${t.C} · ${t.K} 条蛇 · 实测推理 ${t.med.steps} 步 / ${t.med.ms} ms</span>`;
    b.addEventListener('click', () => begin({ tier: t.key }));
    el.tiers.appendChild(b);
  }
  const out = document.createElement('p');
  out.className = 'tier-out mono';
  out.id = 'tier-out';
  out.textContent = OUT_OF_MENU.why;
  el.tiers.appendChild(out);
}

function renderRecords() {
  el.records.innerHTML = '';
  for (const t of TIERS) {
    const li = document.createElement('li');
    const best = Store.best(t.key);
    li.dataset.tier = t.key;
    li.innerHTML =
      `<b>${t.name}</b>` +
      (best
        ? `<span class="mono">${fmtMs(best.ms)}</span> · 提示 ${best.hints} · ${best.moves} 步<br><span>${best.size}</span>`
        : '<span>还没有纪录</span>');
    el.records.appendChild(li);
  }
}

function renderResumeCard() {
  const r = Store.resume(tierOf);
  // Do not offer "继续" for the board already on screen.
  const live = game && game.status !== 'won' && running();
  if (!r || (live && r.seed === game.puzzle.seed && r.tier === game.puzzle.tier)) {
    el.resumeCard.hidden = true;
    return;
  }
  el.resumeCard.hidden = false;
  el.resumeName.textContent = `继续 ${tierFor(r.tier).name} ${r.R}×${r.C} 的一局`;
  el.resumeMeta.textContent = `seed ${r.seed} · ${fmtMs(r.elapsedMs)} · ${r.moves} 步 · 提示 ${r.hints} 次`;
}

function applySettings() {
  Sound.setEnabled(Store.setting('sound'));
  const reduce = !!Store.setting('reduceMotion') || systemPrefersReducedMotion();
  setReduceMotion(!!Store.setting('reduceMotion'));
  document.body.classList.toggle('reduce-motion', reduce);
  $('#btn-sound').setAttribute('aria-pressed', String(!!Store.setting('sound')));
  $('#btn-sound').textContent = Store.setting('sound') ? '音效 开' : '音效 关';
  $('#btn-motion').setAttribute('aria-pressed', String(!!Store.setting('reduceMotion')));
  $('#btn-motion').textContent = reduce ? '动效 省' : '动效 全';
}

// ---- pointer: 一次点选一个格，鼠标与触屏走同一条路径 ----

function onPointerDown(ev) {
  if (!game || game.status === 'won') return;
  const i = view.hitCell(ev.clientX, ev.clientY);
  if (i < 0) return;
  ev.preventDefault();
  el.canvas.focus?.({ preventScroll: true });
  select(i);
}

el.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
el.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

$('#btn-d0').addEventListener('click', () => game && write(game.cursor, BLANK));
$('#btn-d1').addEventListener('click', () => game && write(game.cursor, 1));
$('#btn-d2').addEventListener('click', () => game && write(game.cursor, 2));
$('#btn-d3').addEventListener('click', () => game && write(game.cursor, 3));
$('#btn-d4').addEventListener('click', () => game && write(game.cursor, 4));
$('#btn-d5').addEventListener('click', () => game && write(game.cursor, 5));
$('#btn-hint').addEventListener('click', useHint);
$('#btn-undo').addEventListener('click', undo);
$('#btn-new').addEventListener('click', () => begin({ tier: game ? game.puzzle.tier : 'sho' }));
$('#btn-menu').addEventListener('click', () => {
  flushResume();
  show('menu');
});
$('#btn-menu-2').addEventListener('click', () => show('menu'));
$('#btn-again').addEventListener('click', () => begin({ tier: game ? game.puzzle.tier : 'sho' }));
$('#btn-resume').addEventListener('click', () => {
  const r = Store.resume(tierOf);
  if (!r) return;
  begin({ tier: r.tier, seed: r.seed, resume: r });
});
$('#btn-sound').addEventListener('click', () => {
  Store.setSetting('sound', !Store.setting('sound'));
  applySettings();
  Sound.place();
});
$('#btn-motion').addEventListener('click', () => {
  Store.setSetting('reduceMotion', !Store.setting('reduceMotion'));
  applySettings();
});
$('#btn-reset').addEventListener('click', () => {
  Store.reset();
  applySettings();
  game = null;
  show('menu');
});

window.addEventListener('keydown', (ev) => {
  keys.seen++;
  keys.last = ev.key;
  // 门禁要能分辨"浏览器把一次按键发了 N 遍"（自动重复）和"游戏漏收"：两者都会让
  // "派发 6 个 → 到达 6 个"这条断言红，但只有前者会带上 repeat 标志。
  if (ev.repeat) keys.repeated++;
  keys.by[ev.key] = (keys.by[ev.key] || 0) + 1;
  if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
  if (!game) return;
  const k = ev.key;
  if (k >= '1' && k <= '5') {
    write(game.cursor, Number(k));
    ev.preventDefault();
    keys.handled++;
  } else if (k === '0' || k === ' ') {
    write(game.cursor, BLANK);
    ev.preventDefault();
    keys.handled++;
  } else if (k === 'Backspace' || k === 'Delete') {
    write(game.cursor, UND);
    ev.preventDefault();
    keys.handled++;
  } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
    moveCursor(k);
    ev.preventDefault();
    keys.handled++;
  } else if (k === 'h' || k === 'H') {
    useHint();
    keys.handled++;
  } else if (k === 'z' || k === 'Z') {
    undo();
    keys.handled++;
  }
});

// 方向键在选择框里走：跳过黑格，但走到盘边就停住——把光标弹到对侧会让人以为按错了。
function moveCursor(k) {
  const [r, c] = game.B.rc(game.cursor < 0 ? game.white[0] : game.cursor);
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
  let rr = r,
    cc = c;
  for (let step = 0; step < Math.max(game.R, game.C); step++) {
    rr += d[0];
    cc += d[1];
    if (!game.B.inb(rr, cc)) return;
    const i = game.B.id(rr, cc);
    if (!game.black.has(i)) {
      game.cursor = i;
      syncAll();
      return;
    }
  }
}

window.addEventListener('resize', draw);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushResume();
});
window.addEventListener('pagehide', flushResume);

applyThemeVars();
applySettings();
renderMenu();

const deep = parseHash();
if (deep && deep.seed && tierOf(deep.tier)) begin({ tier: deep.tier, seed: deep.seed });
else if (deep && tierOf(deep.tier)) begin({ tier: deep.tier });

window.hebi = {
  version: VERSION,
  doc: DOC,
  timeOrigin: performance.timeOrigin,
  view,
  get game() {
    return game;
  },
  show,
  begin,
  useHint,
  undo,
  select,
  write,
  keyHits: () => ({ ...keys, by: { ...keys.by } }),
  persistNow: flushResume,
  state: () => (game ? { ...game.state(), elapsedMs: clock(), errs: game.errs.slice(0, 3) } : null),
  winFacts: () => (game ? game.winFacts() : null),
  hintScript: () => (game ? game.pencil().p.log.slice(0, 40) : []),
  cellXY: (i) => (game ? game.B.rc(i) : null),
  engine: {
    ...Hebi,
    ...Gen,
    solvePencil,
    candidates,
    countSolutions,
    mulberry32,
    shuffled,
    TIERS,
    tierOf,
    tierFor,
    OUT_OF_MENU,
    Game,
    Store,
    build,
    rebuild,
    UND,
    BLANK,
    GLYPH,
    doc: DOC,
    theme: { ...Palette, Cell },
  },
};

// ---- 全屏开关 ----
//
// 绑到 index.html 的 HUD 里真实存在的 #btn-fullscreen。
// 只在 js 里留一串 requestFullscreen 能骗过字符串扫描，但按钮不在 DOM 里就是死代码：
// 玩家按不到，功能等于没做。所以 id 必须与 HTML 里的按钮对得上，缺失时要在控制台喊出来。
//
// 三套 API 一律**特性探测**，不做 UA 判断：iPhone 版 Safari 压根没有元素全屏（只有 <video> 能全屏），
// 老 Edge 只认 ms 前缀，Firefox 认 moz 前缀。UA 字符串是猜的，方法在不在是量的，猜错就静默失效。
function fsRoot() {
  return document.documentElement;
}

function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function fsRequest(root) {
  // 老 Edge 的 msRequestFullscreen 挂在元素上，和标准名同一个位置，所以并排取即可。
  return root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen || null;
}

// iOS Safari 会把非 video 元素的请求直接 reject 成 NotAllowedError。
// 这个 promise 没人接就升级成 unhandledrejection，冒到 window.onerror——离屏预载时足以把整页判死。
// 因此凡是可能返回 promise 的调用，返回值一律就地吞掉，绝不让拒绝逃出这一层。
function fsQuiet(p) {
  if (p && typeof p.catch === 'function') p.catch(() => {});
  return p;
}

// 返回 true=请求进入，false=请求退出，null=不支持（调用方据此禁用按钮）。
function toggleFullscreen(root) {
  const req = fsRequest(root);
  if (!req) return null;
  if (fsElement()) {
    // 退出侧同样要兜底：老 Edge 是 msExitFullscreen；万一三者皆无就当无事发生，不抛。
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) fsQuiet(exit.call(document));
    return false;
  }
  // 部分实现（如被 Permissions-Policy 挡住的 iframe）会同步抛，所以 catch 和 .catch 两头都要接。
  try {
    fsQuiet(req.call(root));
  } catch (err) {
    // 拒绝即降级：静默保持当前形态，不冒泡、不打断这一局的其余逻辑。
  }
  return true;
}

function bindFullscreen(btn) {
  const root = fsRoot();

  // 状态回写：Esc 和 iOS 下滑手势退出时不会经过按钮，
  // 只有 fullscreenchange 事件能把按钮的文案/字形拉回正确状态，否则它会一直假装自己在全屏里。
  const sync = () => {
    const on = !!fsElement();
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? "退出全屏" : "全屏";
    btn.title = on ? "退出全屏 (F)" : "全屏 (F)";
    document.body.classList.toggle('is-fullscreen', on);
    return on;
  };

  if (!fsRequest(root)) {
    // 不支持就要说明为什么：只把按钮变灰，玩家会以为这活根本没做完。
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.title = '这个浏览器不提供元素全屏（iOS Safari 请用「添加到主屏幕」）';
    return;
  }

  btn.addEventListener('click', () => {
    toggleFullscreen(root);
    sync();
  });

  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);

  window.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // 正在输入框里打字时不劫持按键，否则会打不出 f。
    if (ev.target && /^(input|textarea|select)$/i.test(ev.target.tagName)) return;
    if (ev.key === "f" || ev.key === "F") {
      ev.preventDefault();
      toggleFullscreen(root);
      sync();
    }
  });

  sync();
}

function bootFullscreen() {
  const btn = document.getElementById("btn-fullscreen");
  if (!btn) {
    // 按钮被谁删掉了？在控制台喊出来，别让这个坑静默地烂在下一棒手里。
    console.warn('[fullscreen] index.html 里找不到 #' + "btn-fullscreen" + '，全屏开关没有入口');
    return;
  }
  bindFullscreen(btn);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootFullscreen);
} else {
  bootFullscreen();
}

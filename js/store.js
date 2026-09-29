// Persistence. Everything lives under one key `hebi-cos:v1` so a reset is one line, and a run in
// progress is stored as (tier, origin seed, the clue set, what the player has written, what the
// run has cost) — never the solution. The clue set travels because regenerating an 8×8 costs
// ~260 ms measured, and a resume should not re-pay that; the seed travels because it is the only
// thing that makes "再来一局" reproducible.
//
// Every field is checked before it is trusted. A payload from another repo, a truncated string or
// a hand-edited JSON must fall back to "no save" rather than crash the first frame — the farm's
// rule is that storage is untrusted input.

const KEY = 'hebi-cos:v1';

// 白格三态在存档里各占一个字符：'.' 未定、'x' 钉成留空、'1'–'5' 数字。
// 一张 8×8 的整盘状态因此是 64 个字符，而不是 64 项 JSON 数组。
const CODES = '.x12345';

const defaults = () => ({
  v: 1,
  settings: { sound: true, reduceMotion: false },
  best: {},
  resume: null,
  totals: { solved: 0, hints: 0, ms: 0, generated: 0 },
  // 自增种子游标。默认 seed 绝不取日期/时间：那会让 UI 上印着的"seed 1234"变成一个
  // 明天就对不上号的数字。游标存在存档里，所以"这一档下一局"是可复跑的。
  seedCounter: 1,
});

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

function validBlack(raw, R, C) {
  if (!Array.isArray(raw) || !raw.length || raw.length > R * C) return null;
  const seen = new Set();
  const out = [];
  for (const e of raw) {
    if (!Array.isArray(e) || e.length !== 3) return null;
    const [i, arrow, num] = e;
    if (!isInt(i) || i < 0 || i >= R * C || seen.has(i)) return null;
    if (!(arrow === null || (typeof arrow === 'string' && 'UDLR'.includes(arrow) && arrow.length === 1))) return null;
    if (arrow === null) {
      if (num !== null) return null;
    } else if (!(num === 0 || (isInt(num) && num >= 1 && num <= 5))) {
      return null;
    }
    seen.add(i);
    out.push([i, arrow, num]);
  }
  return out;
}

function validCells(raw, R, C) {
  if (typeof raw !== 'string' || raw.length !== R * C) return null;
  for (const ch of raw) if (!CODES.includes(ch)) return null;
  return raw;
}

function readResume(raw, tierOf) {
  if (!raw || typeof raw !== 'object') return null;
  const tier = typeof raw.tier === 'string' ? raw.tier : '';
  const spec = tierOf(tier);
  // 尺寸必须与档位声明一致：这一条把"别的仓/别的盘"的存档直接挡掉，
  // 而不是等到 mkBoard 拿一个没见过的 R×C 去画空棋盘。
  if (!spec) return null;
  const R = raw.R, C = raw.C;
  if (!isInt(R) || !isInt(C) || R !== spec.R || C !== spec.C) return null;
  if (R * C > 400) return null;
  if (!isInt(raw.seed) || raw.seed < 1 || raw.seed > 1e9) return null;
  const bl = validBlack(raw.bl, R, C);
  const cells = validCells(raw.cells, R, C);
  if (!bl || !cells) return null;
  const n = (v) => (isInt(v) && v >= 0 ? v : 0);
  return {
    tier,
    seed: raw.seed,
    R,
    C,
    bl,
    cells,
    moves: n(raw.moves),
    hints: n(raw.hints),
    elapsedMs: n(raw.elapsedMs),
  };
}

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
    const settings =
      parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...settings },
      totals: { ...base.totals, ...(parsed.totals || {}) },
      seedCounter: isInt(parsed.seedCounter) && parsed.seedCounter >= 1 ? parsed.seedCounter : 1,
      best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
      // 结构不过就丢，不抛：坏档的表现必须是"没有存档"，不是白屏。
      resume: parsed.resume && typeof parsed.resume === 'object' ? parsed.resume : null,
    };
  } catch {
    return base;
  }
}

export const Store = {
  data: load(),
  key: KEY,

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode / quota — the game is still playable, just forgetful */
    }
  },

  setting(name) {
    return this.data.settings[name];
  },
  setSetting(name, value) {
    this.data.settings[name] = value;
    this.save();
  },

  // ---- seed counter (the default seed is this cursor, never the clock) ----

  peekSeed() {
    return this.data.seedCounter;
  },
  // 出货后把游标推到"实际用掉的那个 seed 的下一号"：makePuzzle 在退货时会内部 seed++，
  // 推到位才不会连着两次按"换一局"拿到同一张盘。
  advanceSeed(to) {
    const next = isInt(to) && to + 1 > this.data.seedCounter ? to + 1 : this.data.seedCounter + 1;
    this.data.seedCounter = Math.min(next, 1e9);
    this.save();
    return this.data.seedCounter;
  },

  best(tier) {
    const b = this.data.best[tier];
    return b && isInt(b.ms) && isInt(b.hints) && isInt(b.moves) ? b : null;
  },
  // Best time is decided by *least help taken* first: a record must mean "I worked this board
  // out myself", and a fast run built on six hints is not that.
  recordBest(tier, { ms, hints, moves, size }) {
    const cur = this.best(tier);
    const better =
      !cur ||
      hints < cur.hints ||
      (hints === cur.hints && (moves < cur.moves || (moves === cur.moves && ms < cur.ms)));
    if (better) this.data.best[tier] = { ms, hints, moves, size, at: Date.now() };
    this.save();
    return better;
  },

  recordSolve(ms, hints) {
    const t = this.data.totals;
    t.solved++;
    t.hints += hints;
    t.ms += ms;
    this.save();
  },

  // black: Map(i -> {arrow, num}); codes: per-cell charset string built by the caller.
  saveResume(puzzle, codes, elapsedMs, run) {
    const bl = [];
    for (const [i, b] of puzzle.black) bl.push([i, b.arrow, b.num]);
    bl.sort((a, b) => a[0] - b[0]);
    this.data.resume = {
      tier: puzzle.tier,
      seed: puzzle.seed,
      R: puzzle.B.R,
      C: puzzle.B.C,
      bl,
      cells: codes,
      // The cost of the run travels with the board. Without it a player could take six hints,
      // close the tab, come back, and finish with a clean 提示 0 record — the number that
      // decides the best time is counted from actions, and actions are not saved.
      moves: run.moves,
      hints: run.hints,
      elapsedMs,
      at: Date.now(),
    };
    this.save();
  },

  // null on "no save" and on "unusable save"; the caller never has to try/catch.
  resume(tierOf) {
    return readResume(this.data.resume, tierOf);
  },

  clearResume() {
    this.data.resume = null;
    this.save();
  },

  reset() {
    // 游标也归零：纪录清空后"下一局"应当从可复跑的第 1 号重新开始，而不是接着今天抽到的号。
    this.data = defaults();
    this.save();
  },
};

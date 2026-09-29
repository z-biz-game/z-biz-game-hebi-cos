// The playable state machine: what a digit does, what an undo takes back, when a board counts as
// solved, and what a hint is allowed to say.
//
// Two deliberate bindings to js/engine/:
//   * the win check is `B.check(black, digits)` — the clause table R1..R4, written from the rules
//     of the game rather than from this file's bookkeeping — plus "every white cell is decided"
//     plus "the decided digits are the unique solution". A board that merely looks full cannot win.
//   * hints come out of `solvePencil` run on the *player's* state, so a hint can only say what the
//     clue set plus what you have already written forces. It is the same solver the generator used
//     to accept the board, so a hint is never a fact the clues do not force.
//
// TIERS lives here because the ladder is a UI promise with a measured number behind it: these step
// medians came off `node tools/balance.mjs 20` on 2026-09-29, and B5 there re-measures them each run.

import { mkBoard, LEN } from '../engine/hebi.js';
import { makePuzzle, difficulty } from '../engine/generate.js';
import { solvePencil } from '../engine/pencil.js';
import { GLYPH } from '../theme.js';

export const UND = -1; // 未定：既不是数字也没有钉成留空
export const BLANK = 0; // 钉成留空：白格的合法状态之一，官方 5×5 例题 20 个白格里 10 个是空的

export const TIERS = [
  { key: 'sho', name: '初', R: 5, C: 5, K: 2, maxClues: 20, med: { steps: 32, ms: 13 } },
  { key: 'chuu', name: '中', R: 6, C: 6, K: 3, maxClues: 26, med: { steps: 49, ms: 40 } },
  { key: 'gao', name: '高', R: 8, C: 8, K: 5, maxClues: 40, med: { steps: 86, ms: 257 } },
];

// 10×10 出局的原因要写在页面上，不能只写在设计文档里：菜单上每一档都承诺"零猜测推得到底"，
// 而那个尺寸上铅笔停在平台期（tools/balance.mjs 的观测段：6 张只出 0 张货）。
export const OUT_OF_MENU = {
  R: 10,
  C: 10,
  K: 8,
  why: '10×10 不在菜单里：零猜测铅笔在这个尺寸停在平台期，推不满就不出货，这一档没有可给的承诺。',
};

export const tierOf = (key) => TIERS.find((t) => t.key === key) || null;
export const tierFor = (key) => tierOf(key) || TIERS[0];

const DIGITS = [0, 1, 2, 3, 4, 5];

// 一张盘的完整出货：makePuzzle 的返回值 + 档位声明 + 难度分。null 就是这一号 seed 出不了货，
// 由调用方（"换一局"）决定是报错还是往前推一号——它绝不退回到"用时间当 seed"。
export function build(spec, seed) {
  const pz = makePuzzle({ R: spec.R, C: spec.C, K: spec.K, maxClues: spec.maxClues, seed });
  if (!pz) return null;
  return {
    tier: spec.key,
    spec,
    B: pz.B,
    black: pz.black,
    sol: pz.sol,
    seed: pz.seed,
    stats: pz.stats,
    score: difficulty(pz.stats),
  };
}

// 从题面的 black 数组重建 Map：续局走这条路，不重新出题（省掉那一笔实测的生成耗时）。
export function rebuild(spec, bl) {
  const B = mkBoard(spec.R, spec.C);
  const black = new Map();
  for (const [i, arrow, num] of bl) black.set(i, { arrow, num });
  return { B, black };
}

export function valueName(v) {
  if (v === UND) return '未定';
  if (v === BLANK) return '留空';
  return String(v);
}

export class Game {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.B = puzzle.B;
    this.black = puzzle.black;
    this.R = this.B.R;
    this.C = this.B.C;
    this.st = new Int8Array(this.B.N).fill(UND);
    this.white = this.B.cells.filter((i) => !this.black.has(i));
    this.wset = new Set(this.white);
    this.steps = [];
    this.moves = 0;
    this.hints = 0;
    this.status = 'playing';
    this.cursor = -1;
    this.lastHint = null;
    this.recompute();
  }

  // 一条链的头：从这一格往回走 v-1，走到 1 就是头。走不到头的数字是"断在半路"的，
  // 它必须有另一种归属色，否则玩家会把它当成一条完整的蛇。
  headOf(i, at) {
    let cur = i;
    const seen = new Set([cur]);
    while (at(cur) > 1) {
      const want = at(cur) - 1;
      const nx = this.B.nbrs(cur).filter((x) => this.wset.has(x) && at(x) === want && !seen.has(x));
      if (!nx.length) return { head: -1, len: seen.size };
      cur = nx[0];
      seen.add(cur);
    }
    return { head: at(cur) === 1 ? cur : -1, len: seen.size };
  }

  // 蛇的分组只读玩家自己写的数字：同一个头走出来的格子就是同一条蛇，颜色是玩家的分组回显，
  // 不是答案的泄露。断链（走不到 1）单独成组，好让它看得出是断的。
  groupSnakes() {
    const at = (i) => this.st[i];
    const group = new Map();
    const complete = new Set();
    const heads = this.white.filter((i) => at(i) === 1);
    for (const h of heads) {
      const path = [h];
      let cur = h;
      for (let want = 2; want <= LEN; want++) {
        const nx = this.B.nbrs(cur).filter((x) => this.wset.has(x) && at(x) === want && !path.includes(x));
        if (!nx.length) break;
        cur = nx[0];
        path.push(cur);
      }
      if (path.length === LEN) complete.add(h);
      for (const x of path) if (!group.has(x)) group.set(x, h);
    }
    // 剩下的数字格：往回找不到 1 的就是断链，各自成组（key 用负数=该格自身）
    for (const i of this.white) {
      if (group.has(i) || at(i) < 1) continue;
      const { head } = this.headOf(i, at);
      // 往回能找到 1 的就归到那条蛇；找不到的自成一格，好让它看得出是断的。
      group.set(i, head >= 0 ? head : -1 - i);
    }
    const ids = [...new Set([...group.values()].filter((v) => v >= 0))];
    return { group, complete, heads: heads.length, ids, dangling: [...group.values()].filter((v) => v < 0).length };
  }

  digitMap() {
    const m = new Map();
    for (const i of this.white) if (this.st[i] >= 1) m.set(i, this.st[i]);
    return m;
  }

  recompute() {
    const raw = this.B.check(this.black, this.digitMap());
    // 空盘不报违反：一个数字都没写时，R4 的"实际第一个数字是 0"说的是射线上还什么都没有，
    // R1/R2 也只是在数 0 个数字格——那是"还没做"，不是"做错了"。整屏在开局就报三条违反，
    // 玩家只会以为题面坏了。这里过滤的只是给玩家看的那一份；
    // 胜负判定用未过滤的 rawErrs（见 winFacts），一条都不能少。
    this.rawErrs = raw;
    this.errs = this.white.some((i) => this.st[i] >= 1) ? raw : [];
    this.sn = this.groupSnakes();
    // 违反的格从引擎的句子名字里取：判据说什么，画面就画什么，渲染器不参与判断。
    const bad = new Set();
    for (const e of this.errs) for (const m of String(e).matchAll(/r(\d+)c(\d+)/g)) bad.add(this.B.id(+m[1] - 1, +m[2] - 1));
    this.bad = bad;
    this.decided = this.white.filter((i) => this.st[i] !== UND).length;
    this.remaining = this.white.length - this.decided;
    this.filled = this.white.filter((i) => this.st[i] >= 1).length;
    this.blanks = this.white.filter((i) => this.st[i] === BLANK).length;
    return this;
  }

  select(i) {
    if (i < 0 || i >= this.B.N) return false;
    if (this.black.has(i)) return false;
    this.cursor = i;
    return true;
  }

  // 黑格永远不可编辑：它是题面，不是玩家的落子处。
  set(i, v) {
    if (this.status === 'won') return { refused: '这一局已经推完了。' };
    if (i < 0 || i >= this.B.N) return { refused: '没有这一格。' };
    if (this.black.has(i)) return { refused: `${this.B.name(i)} 是黑格：箭头与数字是题面印的，不能改。` };
    if (!(v === UND || v === BLANK || (v >= 1 && v <= LEN))) return { refused: '只能写 1–5、留空，或收回未定。' };
    const from = this.st[i];
    if (from === v) return { noop: true };
    this.st[i] = v;
    this.steps.push({ kind: 'set', writes: [{ cell: i, from, to: v }] });
    this.moves++;
    this.recompute();
    this.checkWin();
    return { step: this.steps[this.steps.length - 1] };
  }

  loadCodes(codes) {
    for (let i = 0; i < this.B.N && i < codes.length; i++) {
      const ch = codes[i];
      if (this.black.has(i)) continue;
      this.st[i] = ch === '.' ? UND : ch === 'x' ? BLANK : Number(ch);
    }
    this.recompute();
    this.checkWin();
    return this;
  }

  codes() {
    let s = '';
    for (let i = 0; i < this.B.N; i++) s += this.black.has(i) ? '.' : this.st[i] === UND ? '.' : this.st[i] === BLANK ? 'x' : String(this.st[i]);
    return s;
  }

  undo() {
    const step = this.steps.pop();
    if (!step) return null;
    for (const w of step.writes) this.st[w.cell] = w.from;
    // A hint taken back is still a hint that was taken: records rank runs by help used, so
    // refunding the counter would let a player undo their way to a clean 提示 0.
    if (step.kind !== 'hint') this.moves = Math.max(0, this.moves - 1);
    this.recompute();
    return step;
  }

  // 铅笔在"玩家当前状态"上再推一轮：候选由已写的格钉死，未定的格拿满候选。
  // 返回的第一条新结论就是提示——它必须带规则名，因为"能推"和"推得出名字"是两件事。
  pencil() {
    const candIn = new Map();
    for (const i of this.white) {
      const v = this.st[i];
      candIn.set(i, v === UND ? new Set(DIGITS) : new Set([v]));
    }
    const p = solvePencil(this.B, this.black, candIn);
    const assign = new Map();
    for (const line of p.log) {
      const m = /^(.*) -> (r\d+c\d+)=(\d+)$/.exec(line);
      if (!m) continue;
      const key = m[2];
      if (!assign.has(key)) assign.set(key, { why: m[1], v: Number(m[3]) });
    }
    return { p, assign };
  }

  hint() {
    if (this.status === 'won') return null;
    const { p, assign } = this.pencil();
    if (p.contradiction) {
      return { conflict: `你写的数字和题面矛盾了：${p.contradiction}。撤销一步再想。`, cell: this.cursor };
    }
    for (const i of p.cells) {
      const s = [...p.cand.get(i)];
      if (s.length !== 1) continue;
      if (this.st[i] !== UND) continue; // 已经是玩家写的，不算新进展
      const v = s[0];
      const rec = assign.get(this.B.name(i));
      const rule = rec ? /^(P\d-?\S*)/.exec(rec.why)[1] : 'P1-链';
      const why = rec ? rec.why : `P1-链 ${this.B.name(i)}`;
      const from = this.st[i];
      this.st[i] = v;
      this.steps.push({ kind: 'hint', writes: [{ cell: i, from, to: v }] });
      this.hints++;
      this.recompute();
      this.checkWin();
      const info = {
        rule,
        why: `${why} → ${this.B.name(i)} = ${v === BLANK ? '留空' : v}`,
        cell: i,
        value: v,
        charged: true,
        text: `这条规则的原文：${why}，所以 ${this.B.name(i)} ${v === BLANK ? '必须留空' : '必须是 ' + v}。`,
      };
      this.lastHint = info;
      return info;
    }
    return { stalled: true, text: '命名规则推不出新的一格了：剩下的要么靠你再看一眼题面，要么就是已经推完了。' };
  }

  checkWin() {
    const won = this.winFacts();
    this.status = won.ok ? 'won' : 'playing';
    return won;
  }

  // 三个条件缺一不可，而且每一条都可单独读数：判据 0 条 / 白格全定 / 数字与唯一解逐格相同。
  // 只写"看起来满了"的判定，就是让一个填满但排错的盘冒充通关。
  winFacts() {
    // 这里读的是未过滤的那一份：开局"没写就不算违反"的宽容只给状态行和读数，不给胜负判定。
    const errs = (this.rawErrs || this.errs).length;
    const allDecided = this.remaining === 0;
    let mismatch = 0;
    for (const i of this.white) {
      const want = this.puzzle.sol.get(i) ?? BLANK;
      if (this.st[i] !== want) mismatch++;
    }
    return {
      ok: errs === 0 && allDecided && mismatch === 0,
      errs,
      allDecided,
      mismatch,
      remaining: this.remaining,
      decided: this.decided,
      white: this.white.length,
    };
  }

  // 只给验收台架与"我自己不想推了"用：一轮一轮问提示，直到推完或推不动。
  // 它写的每一格都是铅笔点名的格子，所以这条路本身就是"零猜测可推"的证据。
  solveWithLogic({ cap = 400 } = {}) {
    let k = 0;
    const rules = new Set();
    while (this.status !== 'won' && k++ < cap) {
      const h = this.hint();
      if (!h || h.stalled || h.conflict) break;
      if (h.rule) rules.add(h.rule);
    }
    return { status: this.status, steps: k, rules: [...rules], hints: this.hints };
  }

  state() {
    return {
      tier: this.puzzle.tier,
      name: tierFor(this.puzzle.tier).name,
      seed: this.puzzle.seed,
      moves: this.moves,
      hints: this.hints,
      status: this.status,
      filled: this.filled,
      blanks: this.blanks,
      total: this.white.length,
      remaining: this.remaining,
      snakes: this.sn.complete.size,
      snakesTotal: this.puzzle.spec ? this.puzzle.spec.K : 0,
      heads: this.sn.heads,
      conflicts: this.errs.length,
      score: this.puzzle.score,
      genMs: this.puzzle.stats ? this.puzzle.stats.ms : 0,
      clues: this.black.size,
      steps: this.steps.length,
      cursor: this.cursor,
    };
  }
}

export { GLYPH };

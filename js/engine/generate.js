// 出题器：铺一条合法解 → 按"铅笔还能多钉几格"下刀挖线索 → 推满之后只数一遍穷尽证明唯一。
// 为什么目标函数是推理进度而不是解数（同一批 5x5 盘、同一个 seed 实测）：
//   按"解数掉得最狠"挖 = 出货率 2/60，每张要付 396 次穷尽计数 ≈ 19 s；
//   按推理进度挖 + 最后只数一遍 = 20/30，每张 19 ms。
// 把"证明唯一"的代价付在搜索里，成本是题材的十倍，而且付的那笔钱对玩家一点用没有。
import { mkBoard, ARROWS } from './hebi.js';
import { candidates, countSolutions } from './count.js';
import { solvePencil } from './pencil.js';
import { mulberry32, shuffled } from './rng.js';

const cloneBlk = blk => new Map([...blk].map(([k, v]) => [k, { ...v }]));

// 每加一个黑格，所有线索的数字都要照解读重算：新黑格会**截断别人的射线**，
// 那条线索原来读到的数字可能已经落到黑格后面，题面就成了"印着 3 却谁也读不到 3"的死盘。
// （第一版没做这一步，5x5 上 3 盘里 2 盘在挖到第 7~12 步时铺出来的解不再合法。）
export function reRead(B, blk, sol) {
  for (const [i, b] of blk) {
    if (b.arrow === null) { b.num = null; continue; }
    b.num = 0;
    for (const j of B.ray(i, b.arrow, blk)) { const v = sol.get(j); if (v) { b.num = v; break; } }
  }
}

// 在"所有候选蛇"上做随机序回溯。贪心一条一条放装不下：10x10 放 8 条蛇，
// 4000 次整盘重启 0/3 成功，因为第一条落歪了后面全堵死；改成回溯一次成。
function tryLay(B, rnd, K, black, cands, budget = 400000) {
  const val = new Uint8Array(B.N);
  const chosen = [];
  const order = shuffled(rnd, cands.map((_, i) => i));
  const compat = c => {
    for (let p = 0; p < c.length; p++) {
      const j = c[p];
      if (val[j] || black.has(j)) return false;
      for (const y of B.nbrs(j)) if (val[y] && c.indexOf(y) === -1) return false;
    }
    const d = B.eyeRay(c[0], c[1]);
    let [r, cc] = B.rc(c[0]); r += d[0]; cc += d[1];
    while (B.inb(r, cc)) { const j = B.id(r, cc); if (black.has(j)) break; if (val[j]) return false; r += d[0]; cc += d[1]; }
    for (const o of chosen) {
      const od = B.eyeRay(o[0], o[1]);
      let [a, b] = B.rc(o[0]);
      for (;;) { a += od[0]; b += od[1]; if (!B.inb(a, b)) break; const j = B.id(a, b); if (black.has(j)) break; if (c.includes(j)) return false; }
    }
    return true;
  };
  let work = 0;
  const rec = from => {
    if (chosen.length === K) return true;
    for (let i = from; i < order.length; i++) {
      if (++work > budget) return false;
      const c = cands[order[i]];
      if (!compat(c)) continue;
      for (let p = 0; p < c.length; p++) val[c[p]] = p + 1;
      chosen.push(c);
      if (rec(i + 1)) return true;
      for (const j of c) val[j] = 0;
      chosen.pop();
    }
    return false;
  };
  if (!rec(0)) return null;
  const m = new Map();
  for (const c of chosen) for (let p = 0; p < c.length; p++) m.set(c[p], p + 1);
  if (B.check(black, m).length) return null;
  return m;
}

export function laySnakes(B, rnd, K, blackIn = new Map(), restarts = 400) {
  const { cands } = candidates(B, blackIn);
  for (let rest = 0; rest < restarts; rest++) {
    const sol = tryLay(B, rnd, K, blackIn, cands);
    if (sol) return { sol, cands };
  }
  return null;
}

// 打分：先要"多钉几格"，钉不动时退而求其次要"少留候选"。
// 只看 forced 的第一版一进平台期就撒手（10x10 上钉到 74/77 就停），
// 而平台期恰恰是有便宜下刀口的地方。
const scorePencil = (B, p) => p.contradiction ? -1e9 : p.forced * 10000 - p.cells.reduce((t, i) => t + p.cand.get(i).size, 0);

// 按推理进度下刀挖线索：每次把 (空格 × 4 箭头) 全试一遍，留让铅笔钉得最多（平手取剩余候选最少）的那条。
// 提前收手也走这条路 —— balance 的"多解盘样本"就是这样造的，和生产用同一把刀，不另写一套。
export function digClues(B, laid, maxClues, blackIn = new Map()) {
  const black = blackIn;
  let cur = solvePencil(B, black), n = 0, why = '';
  while (n < maxClues && !cur.solved) {
    const free = B.cells.filter(i => !black.has(i) && !laid.sol.has(i));
    if (!free.length) { why = '无空格可挖'; break; }
    let best = null;
    for (const cell of free) for (const arrow of ARROWS) {
      const trial = cloneBlk(black);
      trial.set(cell, { arrow, num: 0 });
      reRead(B, trial, laid.sol);
      if (B.check(trial, laid.sol).length) continue; // 读数必须仍认铺出来的那张解
      const pp = solvePencil(B, trial);
      const sc = scorePencil(B, pp);
      if (best === null || sc > best.sc) best = { cell, arrow, sc, p: pp };
    }
    if (!best || best.sc <= scorePencil(B, cur)) { why = `铅笔推不动(钉 ${cur.forced}/${cur.white})`; break; }
    black.set(best.cell, { arrow: best.arrow, num: 0 });
    reRead(B, black, laid.sol);
    cur = best.p; n++;
  }
  return { black, cur, n, why };
}

// 一张盘的完整生成：返回题面、唯一解、以及这一张的全部实测指纹（难度分就从这里来）。
export function makePuzzle(opts = {}) {
  const R = opts.R ?? 5, C = opts.C ?? R, K = opts.K ?? 2;
  const maxClues = opts.maxClues ?? Math.round(R * C * 0.6);
  const cap = opts.cap ?? 2000000, maxSol = opts.maxSol ?? 40;
  const t0 = Date.now();
  let seed = opts.seed ?? 1;
  const tries = [];
  for (let attempt = 0; attempt < (opts.attempts ?? 400); attempt++, seed++) {
    // 每张出货盘的 ms 必须是**这一张**的耗时：第一版把表计放在重试循环外面，
    // 于是一张被退货三次的盘把自己的时间记成了三份，探针口径和仓内口径差到看不出谁在说谎。
    const tA = Date.now();
    const B = mkBoard(R, C);
    const rnd = mulberry32(seed * 100003 + 7);
    const laid = laySnakes(B, rnd, K);
    if (!laid) { tries.push('铺不出'); continue; }
    const d = digClues(B, laid, maxClues);
    const black = d.black, cur = d.cur, n = d.n;
    if (!cur.solved) { tries.push(d.why || `${n} 条线索仍未推满`); continue; }
    const { cands } = candidates(B, black);
    const r = countSolutions(B, black, cands, { cap, maxSol });
    if (r.viol) { tries.push(`计数器与判据不一致：${r.viol}`); continue; }
    if (r.bounded || r.solutions !== 1) { tries.push(`推满但计数 ${r.read}`); continue; }
    const sol = r.sols[0];
    const steps = cur.log.filter(l => /^P\d/.test(l)).length;
    const ruleKinds = new Set(cur.log.map(l => { const m2 = /^(P\d-?\S*)/.exec(l); return m2 ? m2[1] : null; }).filter(Boolean));
    return {
      B, black, sol, seed,
      stats: {
        clues: n, attempts: attempt + 1, lays: tries.length,
        pencilSteps: steps, ruleKinds: ruleKinds.size, pencilRounds: cur.rounds,
        countNodes: r.nodes, white: cur.white,
        nodes: r.nodes, ms: Date.now() - tA, msTotal: Date.now() - t0, rejected: tries.slice(0, 6),
      },
    };
  }
  return null;
}

// 难度分 = 铅笔推完这张盘要走的推理步数（实测单调：5x5 med 32 → 6x6 45 → 8x8 82）。
// 不用"蛇的条数/黑格数"当难度：那两头都能靠堆料伪装，步数是真的要推。
export function difficulty(stats) {
  return stats ? stats.pencilSteps : 0;
}

// 穷尽计数器：把"这盘有几个解"问成可证伪的读数。
// 三个终局必须分开打印，不许混（LITS 那轮的教训：没数完的 0 是下界不是无解）：
//   穷尽    bounded=false，read 是真值
//   数满    stopped=true（撞到 maxSol），read = ≥maxSol
//   耗尽    capped=true（撞到节点预算），read = ≥已找到数(预算耗尽)
import { LEN } from './hebi.js';

// 白格里所有长度 5 的不自交路径；路径下标即蛇头，蛇的格序就是 1..5。
export function candidates(B, black) {
  const white = B.cells.filter(i => !black.has(i));
  const wset = new Set(white);
  const out = [];
  const seen = new Set();
  for (const s of white) {
    const stack = [[s, [s]]];
    while (stack.length) {
      const [cur, path] = stack.pop();
      if (path.length === LEN) {
        const key = path.join(',');
        if (!seen.has(key)) { seen.add(key); out.push(path.slice()); }
        continue;
      }
      for (const nx of B.nbrs(cur)) {
        if (!wset.has(nx) || path.includes(nx)) continue;
        path.push(nx); stack.push([nx, path.slice()]); path.pop();
      }
    }
  }
  return { cands: out, white };
}

// 按候选下标递增地加蛇 ⇒ 每组蛇只被枚举一次（不依赖"蛇彼此可换"的对称性去重）。
export function countSolutions(B, black, cands, opts = {}) {
  const cap = opts.cap ?? 2000000;
  const maxSol = opts.maxSol ?? 40;
  const prune = opts.prune !== false;
  const clues = [...black.entries()].filter(([, b]) => b.arrow !== null)
    .map(([i, b]) => ({ i, arrow: b.arrow, num: b.num, ray: B.ray(i, b.arrow, black) }));
  const val = new Uint8Array(B.N);
  const own = new Int32Array(B.N).fill(-1);
  const placed = [];
  const sols = [];
  let nodes = 0, capped = false, stopped = false, viol = null;

  // R4 的三态：0 = 这条线索还没定，1 = 已满足，-1 = 此刻读数不对
  function clueState(cl) {
    for (const j of cl.ray) if (val[j]) return val[j] === cl.num ? 1 : -1;
    return 0;
  }
  const stopAt = cl => { for (let p = 0; p < cl.ray.length; p++) if (val[cl.ray[p]]) return p; return cl.ray.length; };
  // 前瞻：还没成的 k>0 线索，必须在"下标 ≥ 当前"的候选蛇里存在一条把 num 放进第一个占用格之前。
  // 预处理成 (候选下标升序, 该蛇能放的最小射线位) + 后缀最小值，查询是一次二分。
  const look = clues.map(cl => {
    const idx = [], pos = [];
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      let p = -1;
      for (let q = 0; q < cl.ray.length; q++) { const t = c.indexOf(cl.ray[q]); if (t === cl.num - 1 && (p < 0 || q < p)) p = q; }
      if (p >= 0) { idx.push(k); pos.push(p); }
    }
    const suf = new Array(pos.length + 1).fill(1e9);
    for (let i = pos.length - 1; i >= 0; i--) suf[i] = Math.min(pos[i], suf[i + 1]);
    return { idx, suf };
  });
  function stillReachable(ci, from, stop) {
    const { idx, suf } = look[ci];
    let lo = 0, hi = idx.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (idx[mid] < from) lo = mid + 1; else hi = mid; }
    return suf[lo] < stop;
  }
  function addSnake(ci) {
    const c = cands[ci];
    for (const j of c) { val[j] = c.indexOf(j) + 1; own[j] = ci; }
    placed.push(ci);
  }
  function delSnake() {
    const ci = placed.pop(), c = cands[ci];
    for (const j of c) { val[j] = 0; own[j] = -1; }
  }
  // 只查涉及新蛇的 R2/R3，祖先节点已查过
  function okAdd(c, ci) {
    for (const j of c) for (const y of B.nbrs(j)) if (own[y] >= 0 && own[y] !== ci) return false;
    const d = B.eyeRay(c[0], c[1]);
    let [r, cc] = B.rc(c[0]); r += d[0]; cc += d[1];
    while (B.inb(r, cc)) { const y = B.id(r, cc); if (black.has(y)) break; if (own[y] >= 0 && own[y] !== ci) return false; r += d[0]; cc += d[1]; }
    for (const oi of placed) {
      const o = cands[oi], od = B.eyeRay(o[0], o[1]);
      let [a, b] = B.rc(o[0]);
      for (;;) { a += od[0]; b += od[1]; if (!B.inb(a, b)) break; const y = B.id(a, b); if (black.has(y)) break; if (c.includes(y)) return false; }
    }
    return true;
  }
  function record() {
    const m = new Map();
    for (const ci of placed) { const c = cands[ci]; for (let p = 0; p < c.length; p++) m.set(c[p], p + 1); }
    const errs = B.check(black, m);
    if (errs.length) { viol = errs[0]; return; } // 判据与计数器不一致 = 计数器写坏了
    if (sols.length < maxSol) sols.push(m);
  }
  function dfs(from) {
    nodes++;
    if (capped || stopped) return;
    if (nodes > cap) { capped = true; return; }
    let allOk = true;
    for (const cl of clues) {
      const s = clueState(cl);
      // -1 分两种，只有印 0 的那一种是死路：往后只会往射线里放更多数字，0 再也读不出来；
      // 而印 k>0 的线索"此刻第一个数字不是 k"**不等于**没救 —— 后面还有蛇可以坐到它前面去把读数顶成 k。
      // 第一版在这里对两种 -1 一律 return，把可修的分支剪掉了：一张判据说合法、8 条蛇全在候选表里的
      // 10x10 盘被数成"穷尽 0 解"。
      if (s === -1) { allOk = false; if (cl.num === 0) return; }
      else if (s === 0 && cl.num !== 0) allOk = false;
    }
    if (allOk) record();
    if (sols.length >= maxSol) { stopped = true; return; }
    for (let k = from; k < cands.length; k++) {
      if (capped || stopped) return;
      let bad = false;
      for (let ci = 0; ci < clues.length; ci++) {
        const cl = clues[ci];
        if (prune && cl.num > 0 && clueState(cl) !== 1 && !stillReachable(ci, k, stopAt(cl))) { bad = true; break; }
      }
      if (bad) continue;
      const c = cands[k];
      let hit = false;
      for (const j of c) if (val[j]) { hit = true; break; }
      if (hit) continue;
      if (!okAdd(c, k)) continue;
      addSnake(k); dfs(k + 1); delSnake();
    }
  }
  dfs(0);
  const bounded = capped || stopped;
  const read = stopped ? `≥${maxSol}` : capped ? `≥${sols.length}(预算耗尽)` : String(sols.length);
  return { solutions: sols.length, capped, stopped, bounded, read, nodes, sols, viol, cands: cands.length };
}

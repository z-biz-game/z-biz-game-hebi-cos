// 命名规则铅笔：只用写得出名字的规则推，不许猜，不许全局计数。
// 规则清单（每条都以名字出现在 log 里，推不出来时要能怪到某一条头上）：
//   P4-零   印 0 的黑格：箭头射线上所有格子留空。
//   P4-挡   印 k>0 的黑格：若射线前面某格已经"不可能留空"，它后面的格就不能再当那个 k。
//   P4-独   印 k>0 的黑格：若整条射线只有一个格还能放 k，那它前面的格子全部留空。
//   P4-尽   印 k>0 的黑格：射线上一格都放不了 k = 矛盾。
//   P1-链   某格定为 v：v-1 / v+1 的候选唯一就钉死，其余邻居排除该值。
//   P1-弧   某格还可能是 v：若四邻没有一个还能是 v±1，把这个 v 划掉。
//   P2-邻   两格都已定成数字且共边 ⇒ 必属同一条蛇 ⇒ 上一条/下一条的名额不能被第三格占走。
//   P2-围   一条蛇走满 1..5 ⇒ 它四邻里不属于它的格子一律留空（别的蛇挨过来就违反 R2）。
//   P3-眼   一条蛇走满 1..5 ⇒ 它的眼（2→1 延长线）到下一个黑格/边界为止全部留空。
//   P0-区   还可能非空的格子做连通块，块 < 5 格 ⇒ 这块全空（只用"蛇是 5 格连通路"这一条事实）。
// 蛇的条数题面不给、空白格合法，所以铅笔不许用"剩下几格刚好放得下 N 条蛇"这种**全局**计数；
// P0-区 是它的局部版本。这条禁用就是 8x8 以上推不完的原因，见 DESIGN 的"不承诺"。
const DIG = [0, 1, 2, 3, 4, 5];
const LEN = 5;

export function solvePencil(B, black, candIn = null) {
  const white = B.cells.filter(i => !black.has(i));
  const cand = new Map(white.map(i => [i, new Set(candIn ? [...candIn.get(i)] : DIG)]));
  const log = [];
  let contradiction = null;
  const single = i => { const s = cand.get(i); return s && s.size === 1 ? [...s][0] : null; };
  const setTo = (i, v, why) => {
    const s = cand.get(i);
    if (!s.has(v)) { contradiction = contradiction || `${why}：${B.name(i)} 已不可能是 ${v}`; return false; }
    if (s.size > 1) { cand.set(i, new Set([v])); log.push(`${why} -> ${B.name(i)}=${v}`); mutated = true; }
    return true;
  };
  const del = (i, v, why) => {
    const s = cand.get(i);
    if (!s.has(v)) return false;
    s.delete(v);
    if (!s.size) { contradiction = contradiction || `${why}：${B.name(i)} 候选被清空`; cand.set(i, new Set([0])); s.add(0); return true; }
    log.push(`${why} -> 划掉 ${B.name(i)} 的 ${v}`);
    mutated = true;
    return true;
  };
  // 每一轮的真实改动由 setTo/del 记在 mutated 上、轮末一次性结算。
  // 第一版在 P1 里无条件写 changed = true，于是永远"有改动"，500 轮打转后被误读成死局。
  let changed = true, rounds = 0, mutated = false;
  while (changed && !contradiction) {
    changed = false; mutated = false; rounds++;
    if (rounds > 200) { contradiction = '铅笔打转（>200 轮）'; break; }
    for (const [i, b] of black) {
      if (b.arrow === null) continue;
      const ray = B.ray(i, b.arrow, black);
      if (b.num === 0) { for (const j of ray) setTo(j, 0, `P4-零 ${B.name(i)}`); continue; }
      const poss = [];
      for (let p = 0; p < ray.length; p++) if (cand.get(ray[p]).has(b.num)) poss.push(p);
      if (!ray.length || !poss.length) { contradiction = contradiction || `P4-尽 ${B.name(i)} 印 ${b.num}，但射线 ${ray.map(B.name).join(',')} 上没有一格还能放 ${b.num}`; continue; }
      for (const p of poss) {
        for (let q = 0; q < p; q++) if (!cand.get(ray[q]).has(0)) { del(ray[p], b.num, `P4-挡 ${B.name(i)}：${B.name(ray[q])} 不能留空`); break; }
      }
      const poss2 = [];
      for (let p = 0; p < ray.length; p++) if (cand.get(ray[p]).has(b.num)) poss2.push(p);
      if (poss2.length === 1) {
        const p = poss2[0];
        if (!setTo(ray[p], b.num, `P4-独 ${B.name(i)}`)) continue;
        for (let q = 0; q < p; q++) setTo(ray[q], 0, `P4-独 ${B.name(i)}`);
      }
    }
    if (contradiction) break;
    for (const i of white) {
      const v = single(i);
      if (v === null || v === 0) continue;
      for (const [d, nm] of [[-1, 'P1-链 上一条'], [1, 'P1-链 下一条']]) {
        const want = v + d;
        if (want < 1 || want > LEN) continue;
        const nb = B.nbrs(i).filter(j => !black.has(j));
        const can = nb.filter(j => cand.get(j).has(want));
        if (!can.length) { contradiction = contradiction || `${nm} ${B.name(i)}=${v}：四邻 ${nb.map(B.name).join(',')} 没有一格还能是 ${want}`; break; }
        if (can.length === 1 && !setTo(can[0], want, `${nm} ${B.name(i)}=${v}`)) break;
      }
      if (contradiction) break;
    }
    if (contradiction) break;
    for (const i of white) {
      const v = single(i);
      if (v === null || v === 0) continue;
      for (const d of [-1, 1]) {
        const want = v + d;
        if (want < 1 || want > LEN) continue;
        const can = B.nbrs(i).filter(j => !black.has(j) && cand.get(j).has(want));
        if (can.length > 1) {
          const fixed = can.filter(j => single(j) === want);
          if (fixed.length === 1) for (const j of can) if (j !== fixed[0]) del(j, want, `P2-邻 ${B.name(i)}=${v} 的 ${want} 已定在 ${B.name(fixed[0])}`);
        }
      }
    }
    if (contradiction) break;
    for (const i of white) {
      const s = cand.get(i);
      for (const v of [...s]) {
        if (v === 0) continue;
        const nb = B.nbrs(i).filter(j => !black.has(j));
        if (v > 1 && !nb.some(j => cand.get(j).has(v - 1))) del(i, v, `P1-弧 ${B.name(i)}=${v}：没有邻居还能是 ${v - 1}`);
        if (v < LEN && !nb.some(j => cand.get(j).has(v + 1))) del(i, v, `P1-弧 ${B.name(i)}=${v}：没有邻居还能是 ${v + 1}`);
      }
    }
    // P2-围 / P3-眼：题面不给蛇的条数，所以"钉死一条完整蛇"能立刻把它的四邻和视线清空，
    // 剩下的白格被一格一格隔开。官方例题少了这两条只能推 6/20 格。
    for (const i of white) {
      if (single(i) !== 1) continue;
      const path = [i];
      let cur = i;
      for (let want = 2; want <= LEN; want++) {
        const nx = B.nbrs(cur).find(j => single(j) === want);
        if (nx === undefined) { path.length = 0; break; }
        path.push(nx); cur = nx;
      }
      if (path.length !== LEN) continue;
      const on = new Set(path);
      for (const j of path) for (const y of B.nbrs(j)) if (!black.has(y) && !on.has(y)) setTo(y, 0, `P2-围 ${B.name(i)} 这条蛇已满`);
      const d = B.eyeRay(path[0], path[1]);
      let [r, c] = B.rc(path[0]);
      for (;;) {
        r += d[0]; c += d[1];
        if (!B.inb(r, c)) break;
        const y = B.id(r, c);
        if (black.has(y)) break;
        if (!on.has(y)) setTo(y, 0, `P3-眼 ${B.name(path[0])}`);
      }
    }
    // P0-区：地皮必须含"已钉成数字"的格子 —— 蛇的那 5 格里本来就有已经定死的。
    // 第一版把已钉格从地皮上挖掉，连通块被人为切碎，于是官方例题上冒出一条假矛盾
    // （P1-链 说 r2c2=4 的邻居里没有 3，其实 3 就在这条蛇自己身上）。
    const pool = white.filter(i => [...cand.get(i)].some(v => v > 0));
    const inPool = new Set(pool);
    const vis = new Set();
    for (const s0 of pool) {
      if (vis.has(s0)) continue;
      const comp = [s0]; vis.add(s0);
      for (let h = 0; h < comp.length; h++) for (const y of B.nbrs(comp[h])) if (inPool.has(y) && !vis.has(y)) { vis.add(y); comp.push(y); }
      if (comp.length < LEN) for (const j of comp) setTo(j, 0, `P0-区 ${comp.length} 格连通块`);
    }
    changed = mutated;
  }
  const left = white.filter(i => cand.get(i).size > 1);
  return {
    cand, cells: white, left, rounds, log, contradiction,
    solved: !contradiction && left.length === 0,
    forced: white.length - left.length,
    white: white.length,
    sol: !contradiction && left.length === 0
      ? new Map(white.filter(i => single(i) > 0).map(i => [i, single(i)]))
      : null,
  };
}

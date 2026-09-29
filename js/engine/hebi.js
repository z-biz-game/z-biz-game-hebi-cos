// 规则判据 R1–R4，尺寸无关，浏览器与 node 共用。
// 两条源文本逐字（DESIGN.md 记来源与取证过程）：
//   Nikoli EN https://www.nikoli.co.jp/en/puzzles/hebi/
//     1. Place numbers in squares (parts of snakes) so that the figures from 1 (head) to 5 (tail)
//        are sequentially connected one by one in the white squares.
//     2. Snakes cannot touch (share a side with) other snakes, if they do territorial fights will erupt.
//     3. Seen from the 2→1 direction of a snake (the snake's direction of view), a part of another snake
//        can not be in the squares to the next black square or to the rim of the grid.
//     4. The numbers in the black squares show the number in the nearest square in the direction of the
//        arrow. 0 shows that there is no snake from this square to the next black square or outer rim.
//   Cross+A https://crossa.peatix.com/ #HebiIchigo
//     "The snake's eyes are located on a side of the head (cell with number 1), opposite from the side
//      its body (cell with number 2) is connected to."
// 两源单读文字对"箭头是谁的"有歧义（黑格自带 or 蛇眼投过来的），官方规则图把它钉死成前者：
// 箭头与数字都印在黑格里，是题面给的；蛇眼只管第 3 条。
// 题面**不给**蛇的条数，也**不要求**白格填满 —— 空白格是合法状态。
export const DIR = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
export const LEN = 5;
export const ARROWS = ['U', 'D', 'L', 'R'];

export function mkBoard(R, C = R) {
  const id = (r, c) => r * C + c;
  const rc = i => [Math.floor(i / C), i % C];
  const inb = (r, c) => r >= 0 && r < R && c >= 0 && c < C;
  const nbrs = i => {
    const [r, c] = rc(i);
    return [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dr, dc]) => [r + dr, c + dc])
      .filter(([a, b]) => inb(a, b))
      .map(([a, b]) => id(a, b));
  };
  const name = i => { const [r, c] = rc(i); return `r${r + 1}c${c + 1}`; };
  const cells = []; for (let i = 0; i < R * C; i++) cells.push(i);

  // 沿箭头从黑格走出的射线（不含黑格自身），遇到下一个黑格或边界为止
  const ray = (i, arrow, black) => {
    const [dr, dc] = DIR[arrow];
    let [r, c] = rc(i); r += dr; c += dc;
    const out = [];
    while (inb(r, c)) { const j = id(r, c); if (black.has(j)) break; out.push(j); r += dr; c += dc; }
    return out;
  };
  // 蛇眼方向：从 2 指向 1，再往前就是视线
  const eyeRay = (head, cell2) => {
    const [hr, hc] = rc(head), [br, bc] = rc(cell2);
    return [hr - br, hc - bc];
  };
  const walkHead = (h, black, at) => {
    const path = [h];
    let cur = h;
    for (let want = 2; want <= LEN; want++) {
      const nx = nbrs(cur).filter(x => !black.has(x) && at(x) === want);
      if (!nx.length) return { path, ok: false };
      cur = nx[0];
      path.push(cur);
    }
    return { path, ok: true };
  };

  // black: Map(i -> {arrow|null, num|null})，sol: Map(i -> 1..5)。返回违反条款的清单，0 条即合法。
  // 每条都以 R1..R4 开头，engine-test 的反例要求"被自己那一条抓到"，所以前缀是断言的一部分。
  function check(black, sol) {
    const errs = [];
    const at = i => sol.get(i) ?? null;
    const heads = [...sol.entries()].filter(([, v]) => v === 1).map(([i]) => i);
    const seen = new Map();
    for (const h of heads) {
      const { path, ok } = walkHead(h, black, at);
      if (!ok) errs.push(`R1 ${name(h)} 这条蛇连不满 ${LEN} 格（只到 ${path.length}）`);
      for (const x of path) { if (seen.has(x)) errs.push(`R1 格 ${name(x)} 被两条蛇共用`); seen.set(x, h); }
    }
    if (seen.size !== sol.size) errs.push(`R1 题面有 ${sol.size} 个数字格，只有 ${seen.size} 个落在完整蛇身上`);
    for (const i of seen.keys()) for (const y of nbrs(i)) {
      if (!seen.has(y)) continue;
      if (seen.get(i) !== seen.get(y)) errs.push(`R2 ${name(i)} 与 ${name(y)} 是两条蛇却共边`);
    }
    for (const h of heads) {
      const b2 = nbrs(h).find(x => !black.has(x) && at(x) === 2);
      if (b2 === undefined) continue;
      const d = eyeRay(h, b2);
      let [r, c] = rc(h); r += d[0]; c += d[1];
      while (inb(r, c)) {
        const i = id(r, c);
        if (black.has(i)) break;
        if (seen.has(i) && seen.get(i) !== h) { errs.push(`R3 ${name(h)} 的眼看见了别的蛇 ${name(i)}`); break; }
        r += d[0]; c += d[1];
      }
    }
    for (const [i, b] of black) {
      if (b.arrow === null) continue;
      let got = 0;
      for (const j of ray(i, b.arrow, black)) { const v = at(j); if (v) { got = v; break; } }
      if (got !== b.num) errs.push(`R4 ${name(i)} 印的是 ${b.num}，沿 ${b.arrow} 实际第一个数字是 ${got}`);
    }
    return errs;
  }

  return { R, C, N: R * C, id, rc, inb, nbrs, name, cells, ray, eyeRay, walkHead, check };
}

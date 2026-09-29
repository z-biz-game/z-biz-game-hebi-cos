// 引擎闸：每条断言都要能在引擎写坏时变红（阴性自证），只打印读数不算闸。
// 用法：node tools/engine-test.mjs [seeds]
import { mkBoard, LEN, ARROWS } from '../js/engine/hebi.js';
import { candidates, countSolutions } from '../js/engine/count.js';
import { solvePencil } from '../js/engine/pencil.js';
import { makePuzzle, laySnakes, reRead } from '../js/engine/generate.js';
import { mulberry32 } from '../js/engine/rng.js';

let fail = 0, pass = 0;
const VERBOSE = !!process.env.VERBOSE;
// 逐盘断言在闸里是**计数**不是日志：12 盘 × 3 尺寸 × 3 条 = 一百多行"ok"会把真正要看的
// 汇总和红灯淹掉，所以默认只在失败时打印，通过只累加。
const note = (cond, label, extra = '') => {
  if (cond) pass++;
  else { fail++; console.log(`  **FAIL** ${label}${extra ? ' · ' + extra : ''}`); }
  if (cond && VERBOSE) console.log(`  ok   ${label}${extra ? ' · ' + extra : ''}`);
};
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}${extra ? ' · ' + extra : ''}`); }
  else { fail++; console.log(`  **FAIL** ${label}${extra ? ' · ' + extra : ''}`); }
};

// ---------- 官方 5x5 例题（Nikoli 规则页的 gif：题面 01 / 解答 03，逐格抄）----------
const B5 = mkBoard(5, 5);
const id5 = B5.id;
const OFFICIAL_BLACK = new Map([
  [id5(1, 0), { arrow: null, num: null }],
  [id5(1, 3), { arrow: 'R', num: 3 }],
  [id5(2, 2), { arrow: 'U', num: 5 }],
  [id5(3, 1), { arrow: 'D', num: 0 }],
  [id5(3, 4), { arrow: 'U', num: 4 }],
]);
const OFFICIAL_SOL = new Map([
  [id5(0, 3), 1], [id5(0, 4), 2], [id5(1, 4), 3], [id5(2, 4), 4], [id5(2, 3), 5],
  [id5(3, 0), 1], [id5(2, 0), 2], [id5(2, 1), 3], [id5(1, 1), 4], [id5(1, 2), 5],
]);

// ---------- 1. 判据：会绿也得会红 ----------
console.log('判据 R1–R4');
ok(B5.check(OFFICIAL_BLACK, OFFICIAL_SOL).length === 0, '官方 5x5 解答合法', `${B5.check(OFFICIAL_BLACK, OFFICIAL_SOL).length} 条违规`);
// 每条反例必须被**自己那一条**抓到（允许同时抓到别的，但那条不能在反例上沉默）。
// R2/R3 的反例不能在官方例题上改——多出来的那个数字格会先撞上 R1 的覆盖检查，
// 而 R2/R3 只遍历"完整蛇身上的格"，于是永远看不见它。所以这两条各造一张独立盘：
// black = 空（R4 沉默）、两条蛇各自 1..5 连满（R1 沉默），只剩被测的那条会红。
// A 蛇照官方例题那条平移一格：头 (0,2)、身 2 在 (0,3) ⇒ 眼朝西，视线 (0,1) -> (0,0) -> 边界。
const SNAKE_A = [[id5(0, 2), 1], [id5(0, 3), 2], [id5(0, 4), 3], [id5(1, 4), 4], [id5(2, 4), 5]];
// B 的尾巴 (1,2) 与 A 的头 (0,2) 共边（违 R2），但不在 A 的西向视线上（R3 应当不响）
const SNAKE_B_TOUCH = [[id5(4, 1), 1], [id5(3, 1), 2], [id5(2, 1), 3], [id5(1, 1), 4], [id5(1, 2), 5]];
// B 整条压在 0 列上，尾巴 (0,0) 坐在 A 的视线尽头，而 (0,0) 与 (0,2) 隔一格、不共边（违 R3，R2 不响）
const SNAKE_B_INEYE = [[id5(4, 0), 1], [id5(3, 0), 2], [id5(2, 0), 3], [id5(1, 0), 4], [id5(0, 0), 5]];
// 反向证人：同一张双蛇盘把 B 挪到既不共边也不在视线上的位置，R2/R3 必须一起闭嘴。
// 少了这条，"R2/R3 被抓到"可能只是它们在合成盘上无条件报错。
const SNAKE_B_CLEAN = [[id5(4, 4), 1], [id5(4, 3), 2], [id5(4, 2), 3], [id5(4, 1), 4], [id5(4, 0), 5]];
const EMPTY_BLACK = new Map();
ok(B5.check(EMPTY_BLACK, new Map([...SNAKE_A, ...SNAKE_B_CLEAN])).length === 0, '合成双蛇盘（合法形态）');

const muts = [
  ['R1 链断了', new Map(OFFICIAL_BLACK), new Map([...OFFICIAL_SOL].filter(([k]) => k !== id5(2, 3))), 'R1'],
  ['R2 两条蛇共边', EMPTY_BLACK, new Map([...SNAKE_A, ...SNAKE_B_TOUCH]), 'R2'],
  ['R3 眼里有别的蛇', EMPTY_BLACK, new Map([...SNAKE_A, ...SNAKE_B_INEYE]), 'R3'],
  ['R4 数字看错', new Map([...OFFICIAL_BLACK, [id5(1, 3), { arrow: 'R', num: 5 }]]), OFFICIAL_SOL, 'R4'],
  ['R4 该 0 却印 1', new Map([...OFFICIAL_BLACK, [id5(3, 1), { arrow: 'D', num: 1 }]]), OFFICIAL_SOL, 'R4'],
  ['R4 箭头方向读反', new Map([...OFFICIAL_BLACK, [id5(2, 2), { arrow: 'D', num: 5 }]]), OFFICIAL_SOL, 'R4'],
];
for (const [label, black, sol, want] of muts) {
  const errs = B5.check(black, sol);
  const hit = errs.filter(e => e.startsWith(want));
  ok(errs.length > 0 && hit.length > 0, label, hit.length ? `${want} ${hit.length} 条 / 共 ${errs.length} 条` : `漏网（总错误 ${errs.length}）`);
}

// ---------- 2. 两条独立路在已公布题面上必须一致 ----------
console.log('官方 5x5：计数器 × 铅笔');
{
  const { cands } = candidates(B5, OFFICIAL_BLACK);
  const r = countSolutions(B5, OFFICIAL_BLACK, cands, { cap: 2000000, maxSol: 50 });
  ok(!r.bounded && r.solutions === 1, '穷尽数出 1 解', `${r.nodes} 节点 · 候选蛇 ${cands.length} · 读数 ${r.read}`);
  ok(r.sols.length === 1 && [...OFFICIAL_SOL.entries()].every(([k, v]) => r.sols[0].get(k) === v) && r.sols[0].size === OFFICIAL_SOL.size,
    '计数器认出的那个解 == 官方解答');
  ok(r.viol === null, '计数器与判据无冲突', r.viol || '');
  const p = solvePencil(B5, OFFICIAL_BLACK);
  ok(p.solved && !p.contradiction, '铅笔 0 猜推满', `${p.forced}/${p.white} 白格 · ${p.rounds} 轮`);
  ok(p.sol && [...OFFICIAL_SOL.entries()].every(([k, v]) => p.sol.get(k) === v) && p.sol.size === OFFICIAL_SOL.size,
    '铅笔推出来的 == 官方解答');
}

// ---------- 3. 出题器：每张出货盘都要两条路同时点头 ----------
console.log('出题器不变量');
const SEEDS = +(process.argv[2] || 12);
const SIZES = [[5, 5, 2], [6, 6, 3], [8, 8, 5]];
const perSize = [];
for (const [R, C, K] of SIZES) {
  let shipped = 0, steps = [], clues = [], nodes = [], ms = [];
  for (let s = 1; s <= SEEDS; s++) {
    const pz = makePuzzle({ R, C, K, seed: s * 977 + R });
    if (!pz) { continue; }
    shipped++;
    const errs = pz.B.check(pz.black, pz.sol);
    note(errs.length === 0, `${R}x${C} seed ${pz.seed} 出货盘合法`, errs[0] || '');
    // 出货盘的解必须由铅笔独立推出来，且与计数器那个唯一解逐格相同
    const p = solvePencil(pz.B, pz.black);
    note(p.solved && p.sol && p.sol.size === pz.sol.size && [...pz.sol.entries()].every(([k, v]) => p.sol.get(k) === v),
      `${R}x${C} seed ${pz.seed} 铅笔推满 == 计数器唯一解`, `钉 ${p.forced}/${p.white}`);
    const { cands } = candidates(pz.B, pz.black);
    const r = countSolutions(pz.B, pz.black, cands, { cap: 2000000, maxSol: 40 });
    note(!r.bounded && r.solutions === 1, `${R}x${C} seed ${pz.seed} 唯一性证完`, `${r.read} / ${r.nodes} 节点`);
    steps.push(pz.stats.pencilSteps); clues.push(pz.stats.clues); nodes.push(r.nodes); ms.push(pz.stats.ms);
  }
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : NaN;
  perSize.push({ R, C, K, shipped, medSteps: med(steps), medClues: med(clues), maxNodes: Math.max(0, ...nodes), medMs: med(ms) });
  console.log(`  ${R}x${C} K=${K}：出货 ${shipped}/${SEEDS} · 线索 med ${med(clues)} · 推理步 med ${med(steps)} · 唯一性节点 max ${Math.max(0, ...nodes)} · 每张 med ${med(ms)} ms`);
}

// ---------- 4. 确定性：同一个 seed 必须画同一张盘 ----------
console.log('seed 确定性');
for (const [R, C, K] of SIZES) {
  const a = makePuzzle({ R, C, K, seed: 4242 });
  const b = makePuzzle({ R, C, K, seed: 4242 });
  const same = !!a && !!b && a.sol.size === b.sol.size && [...a.sol.entries()].every(([k, v]) => b.sol.get(k) === v)
    && [...a.black.keys()].length === [...b.black.keys()].length
    && [...a.black.entries()].every(([k, v]) => b.black.get(k) && b.black.get(k).arrow === v.arrow && b.black.get(k).num === v.num);
  ok(same, `${R}x${C} 同 seed 两次生成逐格相同`, a ? `${a.stats.clues} 条线索` : '没出货');
}

// ---------- 5. 阴性自证：闸自己也得能红 ----------
// 把出货盘的某条线索数字改错一格，count / pencil / check 三条路都要翻脸；
// 哪一条沉默，就说明它其实没在检查这件事。
console.log('阴性自证');
{
  const pz = makePuzzle({ R: 5, C: 5, K: 2, seed: 99001 });
  if (!pz) { fail++; console.log('  **FAIL** 阴性自证拿不到出货盘'); }
  else {
    const [k, b] = [...pz.black.entries()].find(([, x]) => x.arrow !== null);
    const bad = new Map(pz.black);
    bad.set(k, { arrow: b.arrow, num: b.num === 5 ? 4 : b.num + 1 });
    ok(pz.B.check(bad, pz.sol).some(e => e.startsWith('R4')), '改错一个线索数字 -> 判据 R4 红');
    const { cands } = candidates(pz.B, bad);
    const r = countSolutions(pz.B, bad, cands, { cap: 200000, maxSol: 10 });
    ok(!r.viol && r.solutions === 0, '改错线索 -> 计数器不再数出解', `${r.read} / ${r.nodes} 节点`);
    ok(!solvePencil(pz.B, bad).solved, '改错线索 -> 铅笔不再"推满"（它会说谎才算绿）');
  }
}

console.log(`\n合计 ${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);

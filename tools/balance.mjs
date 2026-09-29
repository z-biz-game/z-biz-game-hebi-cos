// 成本与难度：把出货率、每张耗时、难度带、以及"铅笔会不会说谎"量成有红线的表。
// 每条红线都要能在实现变坏时变红；反过来，红线只卡"变坏"，不卡"变好"——
// 10x10 那一段只打印观测值不设红线，因为"铅笔哪天推得满 10x10"是进步，不是回归。
// 用法：node tools/balance.mjs [样本数]，或 SAMPLES=<n> —— CI 的 Difficulty ladder 一步设的是
// 环境变量，所以这个 knob 必须真的接到样本数上（tools/doctest.mjs 的 D7 拿子进程验它）。
import { mkBoard } from '../js/engine/hebi.js';
import { candidates, countSolutions } from '../js/engine/count.js';
import { solvePencil } from '../js/engine/pencil.js';
import { makePuzzle, laySnakes, digClues } from '../js/engine/generate.js';
import { mulberry32 } from '../js/engine/rng.js';

const argn = +process.argv[2];
const envn = +process.env.SAMPLES;
const N = Number.isInteger(argn) && argn > 0 ? argn : Number.isInteger(envn) && envn > 0 ? envn : 20;
const MENU = [
  { name: '初', R: 5, C: 5, K: 2, maxClues: 20 },
  { name: '中', R: 6, C: 6, K: 3, maxClues: 26 },
  { name: '高', R: 8, C: 8, K: 5, maxClues: 40 },
];
const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : NaN;
const p95 = a => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : NaN;
let red = 0;
const line = (cond, label, detail) => {
  console.log(`  ${cond ? 'ok  ' : '**RED**'} ${label} · ${detail}`);
  if (!cond) red++;
};

console.log(`菜单三档 × ${N} 张（seed 从 5000 起，逐张递增，可复跑）`);
const rows = [];
for (const m of MENU) {
  const st = { ship: 0, ms: [], steps: [], clues: [], nodes: [], attempts: [] };
  const t0 = Date.now();
  for (let s = 0; s < N; s++) {
    const pz = makePuzzle({ R: m.R, C: m.C, K: m.K, maxClues: m.maxClues, seed: 5000 + s });
    if (!pz) continue;
    st.ship++;
    st.ms.push(pz.stats.ms); st.steps.push(pz.stats.pencilSteps);
    st.clues.push(pz.stats.clues); st.nodes.push(pz.stats.nodes); st.attempts.push(pz.stats.attempts);
  }
  const rate = st.ship / N;
  rows.push({ ...m, rate, medSteps: med(st.steps), p95Steps: p95(st.steps), p10Steps: st.steps.slice().sort((a, b) => a - b)[Math.floor(st.steps.length * 0.1)], medMs: med(st.ms), p95Ms: p95(st.ms), maxNodes: Math.max(0, ...st.nodes), medAttempts: med(st.attempts) });
  console.log(`  ${m.name} ${m.R}x${m.C} K=${m.K}：出货 ${st.ship}/${N} = ${(100 * rate).toFixed(0)}% · 要牌张数 med ${med(st.attempts)} · 线索 med ${med(st.clues)} · 推理步 med ${med(st.steps)} p95 ${p95(st.steps)} · 每张 med ${med(st.ms)} ms p95 ${p95(st.ms)} ms · 唯一性节点 max ${Math.max(0, ...st.nodes)} · 墙钟 ${Date.now() - t0} ms`);
}

// B1 成本红线：每一档 p95 都必须停在"点换一局不觉得卡"的那一侧。
// 数值直接抄本轮实测的 p95 上浮一点，不预测、不外推。
console.log('红线');
for (const r of rows) {
  const budget = { 5: 400, 6: 900, 8: 3000 }[r.R];
  line(r.p95Ms <= budget, `B1 ${r.R}x${r.C} 出题 p95 <= ${budget} ms`, `实测 p95 ${r.p95Ms} ms · med ${r.medMs} ms`);
  line(r.rate >= 0.2, `B2 ${r.R}x${r.C} 出货率 >= 20%`, `实测 ${(100 * r.rate).toFixed(0)}%（低于两成＝每按一次按钮要等好几张退货）`);
}
// B3 难度轴：三档推理步数必须单调，否则"档位"就是格数换皮。
line(rows[0].medSteps < rows[1].medSteps && rows[1].medSteps < rows[2].medSteps,
  'B3 难度带单调（按实测推理步数）', `${rows.map(r => `${r.R}x${r.C} med ${r.medSteps}`).join(' < ')}`);
line(rows[0].p95Steps < rows[2].p10Steps, 'B3b 首末两档的区间不重叠', `${rows[0].R}x${rows[0].C} p95 ${rows[0].p95Steps} < ${rows[2].R}x${rows[2].C} p10 ${rows[2].p10Steps}`);

// B4 铅笔的选择性：在**没推满**的盘上它当然不推满；要证伪的是它会不会把多解盘推满。
// 造法：照旧下刀但**提前收手**（只挖 nClues 条），于是盘上大概率还有 >=2 个解。
console.log('B4 铅笔不说谎（对着多解盘）');
{
  let multi = 0, lied = 0, unreadable = 0, cases = 0;
  for (const [R, C, K, nClues] of [[5, 5, 2, 3], [6, 6, 3, 5], [8, 8, 5, 8]]) {
    const B = mkBoard(R, C);
    for (let s = 0; s < Math.max(4, N >> 2); s++) {
      const rnd = mulberry32(90000 + s * 7919 + R);
      const laid = laySnakes(B, rnd, K);
      if (!laid) continue;
      // 和生产同一把刀，只是提前收手：挖 nClues 条就停，故意留一张多半还多解的盘
      const d = digClues(B, laid, nClues);
      const { cands } = candidates(B, d.black);
      // 这条红线要的事实是"**有两个不同的解**"，不是"总共只有两个解" —— 所以拿**见证**就够了，
      // 数满（bounded）也照用：maxSol=6 意味着"至少 6 个解里取了几个"，只要 >=2 就是多解盘。
      // 第一版写成"没数完就不算样本"，于是 15 张盘全部被跳过，B4 成了一盏永远绿的灯。
      const r = countSolutions(B, d.black, cands, { cap: 400000, maxSol: 6 });
      const p = d.cur;
      cases++;
      if (r.solutions >= 2) {
        multi++;
        if (p.solved) { lied++; console.log(`    **RED** ${R}x${C} seed ${s}：这张盘至少有 ${r.solutions} 个解，却被铅笔推满了`); }
      } else if (r.bounded) unreadable++;
    }
  }
  line(lied === 0, 'B4 铅笔从不把多解盘推满（选择性）', `样本 ${cases} · 见证多解盘 ${multi} · 被推满 ${lied}`);
  line(multi >= 3, 'B4 的样本真的含多解盘（否则 B4 空转）', `见证多解盘 ${multi}/${cases}`);
}

// 观测，不设红线：大尺寸上是铅笔先没电，不是计数器。
console.log('观测：10x10 K=8（不在菜单里）');
{
  let ship = 0;
  const t0 = Date.now();
  for (let s = 0; s < 6; s++) {
    const pz = makePuzzle({ R: 10, C: 10, K: 8, maxClues: 70, seed: 7777 + s, attempts: 1 });
    if (pz) { ship++; console.log(`  盘 ${s} 出货：${pz.stats.clues} 线索 · ${pz.stats.pencilSteps} 步`); }
    else console.log(`  盘 ${s} 没出货（铅笔推到平台期）`);
  }
  console.log(`  出货 ${ship}/6 · 墙钟 ${Date.now() - t0} ms —— 这条只是披露：哪天推得满了是进步，不该让闸变红`);
}

// B5/B6：两处"实测"字样得有闸读。
//   选档页那句「实测推理 N 步」直接印 js/ui/game.js 的 TIERS.med（js/main.js:369），
//   generate.js 的注释也自称实测单调 —— 写了"实测"的数字就没有资格和实测不一致。
//   ms 不进等式：那是机器速度，只卡方向（B5b）；步数由 seed 阶梯决定，逐档要求相等。
{
  const { readFileSync } = await import('node:fs');
  const { TIERS } = await import('../js/ui/game.js');
  const mds = rows.map(r => r.medSteps);
  line(TIERS.length === rows.length && TIERS.every((t, i) => t.med.steps === mds[i]),
    'B5 选档页印的「实测 N 步」等于本轮实测', `菜单 ${TIERS.map(t => t.med.steps).join('/')} vs 实测 ${mds.join('/')}`);
  line(TIERS.every((t, i) => i === 0 || t.med.ms > TIERS[i - 1].med.ms),
    'B5b 菜单耗时只卡方向（ms 是机器速度，不进等式）', TIERS.map(t => t.med.ms).join(' < '));
  const src = readFileSync(new URL('../js/engine/generate.js', import.meta.url), 'utf8');
  const m = src.match(/实测单调：(\d+)x(\d+) med (\d+) → (\d+)x(\d+) (\d+) → (\d+)x(\d+) (\d+)/);
  line(!!m, 'B6 读到了 generate.js 注释里的步数（读不到＝这条红线空转）', m ? '读到 3 档' : '注释改了措辞或删了数字，红线得跟着改');
  if (m) line(+m[3] === mds[0] && +m[6] === mds[1] && +m[9] === mds[2],
    'B6 generate.js 注释里的步数等于本轮实测', `注释 ${[m[3], m[6], m[9]].join('/')} vs 实测 ${mds.join('/')}`);
}

console.log(`\n合计红线 ${red} 条破口`);
process.exit(red ? 1 : 0);

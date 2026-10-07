// 文档是被断言的面：README 印出去的每一个「现值」都必须等于代码/脚本里的现在值。
//
// 为什么要有这个文件：引擎断言、bake 出来的数据、balance 的红线都有命令去重测，
// 而一段散文没有。它可以一直抄下去，直到某天代码改了字、文档还在引用上一个世界的数。
// 本仓的 README 里有一整类这样的数——三档表、腿与形态的条数、端口、节点预算、
// CI 里到底跑了哪几条门禁、`SAMPLES` 旋钮的值——它们每一个都能由一条等式钉住，
// 于是这里钉住它们。
//
// 规矩（和 tools/balance.mjs 的 B5/B6 一样）：
//   * 每一条等式都配一条「解析到的条数」的反空转断言——正则没命中不是绿，是红；
//   * 只比现值，不比读数：ms、出货率、节点数这类本机测量在这里只作为「文档写的数
//     与代码里的界」的关系出现（D5），不去复测它们；
//   * 破坏试验台账（README 最后一节）逐条验过这里的刀真的会红。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TIERS } from '../js/ui/game.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const fail = [];
let rows = 0;
// D12e 数的是"这一次真的跑过哪些组"，所以组号在 ok() 里顺手记下来：标签是唯一的真相来源，
// 整段删掉一组，那一格就从这里消失。
const emitted = new Set();
const ok = (cond, label, detail) => {
  rows++;
  const g = /(?:^|[^A-Za-z0-9_])D(\d+)/.exec(label);
  if (g) emitted.add(+g[1]);
  if (!cond) fail.push(label);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label} · ${detail}`);
};

const README = read('README.md');
const DESIGN = read('DESIGN.md');
const DOCS = README + '\n' + DESIGN;
const CI = read('.github/workflows/ci.yml');
const BAL = read('tools/balance.mjs');
const VERIFY = read('tools/verify.sh');
const PKG = JSON.parse(read('package.json'));
const GEN = read('js/engine/generate.js');
const PENCIL = read('js/engine/pencil.js');
const GAME = read('js/ui/game.js');
const PLAYTEST = read('tools/playtest.cjs');

// ---- D1 三档菜单表：页面印给玩家的那张表 == TIERS 的现值 ----
const tierRows = [...README.matchAll(/^\| (初|中|高) \| (\d+)×(\d+) \| (\d+) \| (\d+) 步 \/ \d+ ms/gm)];
ok(tierRows.length === TIERS.length, 'D1a README 的三档表解析到的行数等于 TIERS 的档数',
  `解析 ${tierRows.length} 行 vs TIERS ${TIERS.length} 档（解析不到不等于通过）`);
for (const t of TIERS) {
  const row = tierRows.find((m) => m[1] === t.name);
  const dims = row && +row[2] === t.R && +row[3] === t.C && +row[4] === t.K;
  const steps = row && +row[5] === t.med.steps;
  ok(!!row && dims && steps, `D1 ${t.name} ${t.R}×${t.C} K=${t.K} ${t.med.steps} 步：文档那行等于 TIERS`,
    row ? `文档 ${row[2]}×${row[3]} K=${row[4]} ${row[5]} 步 vs 代码 ${t.R}×${t.C} K=${t.K} ${t.med.steps} 步`
        : 'README 的三档表里没有这一档');
}

// ---- D2 铅笔的 10 条命名规则：文档列的名字集 == 实现头部的清单，且每条在实现体里再现一次 ----
const implRules = [...PENCIL.matchAll(/^\/\/ {3}(P\d-\S+)/gm)].map((m) => m[1]);
const docRules = (README.match(/一共 10 条：\n?\s*`([^`]+)`/) || [])[1];
const docRuleList = docRules ? docRules.trim().split(/\s+/) : [];
ok(implRules.length === 10 && docRuleList.length === 10,
  'D2a 两边都解析到 10 条规则名（少一条就是解析器空转）',
  `实现清单 ${implRules.length} 条 · 文档 ${docRuleList.length} 条`);
ok(implRules.length === docRuleList.length && implRules.every((r, i) => docRuleList[i] === r),
  'D2 README 列的规则名逐条等于 pencil.js 头部清单',
  `实现 ${implRules.join(' ')} vs 文档 ${docRuleList.join(' ')}`);
// 名字必须出现在**非注释行**里：整份文件一起数会被头部注释凑够次数，
// 那样「不只活在注释里」这句标签就在说谎（P0-区 的注释出现 3 次，代码里只有 1 次）。
const PENCIL_BODY = PENCIL.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const ghost = implRules.filter((r) => PENCIL_BODY.split(r).length - 1 < 1);
ok(ghost.length === 0, 'D2b 每条规则名都不只活在注释里（非注释行里至少出现一次）',
  ghost.length ? `只有声明没有实现：${ghost.join(' ')}` : `10 条名字在 pencil.js 的非注释行里各出现 ≥1 次`);

// ---- D3 闸的形状：腿数、形态数、每形态报告数、合计，全部从脚本现值推 ----
const legsM = VERIFY.match(/LEGS=\$\{LEGS:-([^}]*)\}/);
const legs = legsM ? legsM[1].trim().split(/\s+/) : [];
const shapesM = VERIFY.match(/SHAPES=\(([^)]*)\)/);
const shapes = shapesM ? (shapesM[1].match(/"([^"]+)"/g) || []).length : 0;
const reportsPerShape = (VERIFY.match(/^\s*run_scenario [a-z]+/gm) || []).length
  + (VERIFY.match(/^\s*run_cmd [a-z]+/gm) || []).length;
const shapeDoc = DOCS.match(/闸的形状：腿 (\d+) 条 · 形态 (\d+) 种 · 每形态 (\d+) 份报告 · 合计 (\d+) 份/);
ok(legs.length >= 5 && shapes >= 1 && reportsPerShape >= 5 && !!shapeDoc,
  'D3a 脚本与文档两边都解析到了闸的形状',
  `verify.sh: ${legs.length} 腿 × ${shapes} 形态 × ${reportsPerShape} 报告 · 文档句 ${shapeDoc ? '在' : '不在'}`);
ok(!!shapeDoc && +shapeDoc[1] === legs.length, `D3 文档写的腿数等于 LEGS 默认值（${legs.join(' ')}）`,
  shapeDoc ? `文档 ${shapeDoc[1]} vs 脚本 ${legs.length}` : '解析不到');
ok(!!shapeDoc && +shapeDoc[2] === shapes, 'D3b 文档写的形态数等于 SHAPES 的条目数',
  shapeDoc ? `文档 ${shapeDoc[2]} vs 脚本 ${shapes}` : '解析不到');
ok(!!shapeDoc && +shapeDoc[3] === reportsPerShape,
  `D3c 文档写的每形态报告数等于脚本里的 run_scenario+run_cmd 次数（${reportsPerShape}）`,
  shapeDoc ? `文档 ${shapeDoc[3]} vs 脚本 ${reportsPerShape}` : '解析不到');
ok(!!shapeDoc && +shapeDoc[4] === reportsPerShape * shapes, 'D3d 合计份数 == 每形态 × 形态数',
  shapeDoc ? `文档 ${shapeDoc[4]} vs ${reportsPerShape}×${shapes}=${reportsPerShape * shapes}` : '解析不到');

// ---- D4 端口：文档那一句 == package.json / verify.sh / playtest.cjs 的现值 ----
const httpM = VERIFY.match(/HTTP=\$\{HTTP_PORT:-(\d+)\}/);
const cdpM = VERIFY.match(/PORT=\$\{CDP_PORT:-(\d+)\}/);
const devM = (PKG.scripts?.dev || '').match(/server\.cjs\s+(\d+)/);
const phM = PLAYTEST.match(/CDP_PORT \|\| (\d+)/);
const pbM = PLAYTEST.match(/BASE_URL \|\| 'http:\/\/127\.0\.0\.1:(\d+)/);
const portDoc = DOCS.match(/端口：本地 (\d+) · CDP (\d+)/);
ok(httpM && cdpM && devM && phM && pbM && portDoc,
  'D4a 五个来源都解析到了端口（少一个就说明接线改了形状）',
  `verify ${httpM?.[1]}/${cdpM?.[1]} · package ${devM?.[1]} · playtest ${pbM?.[1]}/${phM?.[1]} · 文档 ${portDoc?.[1]}/${portDoc?.[2]}`);
const httpVals = [httpM?.[1], devM?.[1], pbM?.[1]];
const cdpVals = [cdpM?.[1], phM?.[1]];
ok(!!portDoc && httpVals.every((v) => +v === +portDoc[1]), `D4 HTTP 端口三处一致且等于文档（${httpVals.join('/')}）`,
  portDoc ? `文档 ${portDoc[1]}` : '解析不到');
ok(!!portDoc && cdpVals.every((v) => +v === +portDoc[2]), `D4b CDP 端口两处一致且等于文档（${cdpVals.join('/')}）`,
  portDoc ? `文档 ${portDoc[2]}` : '解析不到');

// ---- D5 唯一性预算：文档写的读数必须真的小于代码里的 cap ----
const capM = GEN.match(/opts\.cap \?\? (\d+)/);
const capDoc = README.match(/唯一性计数本轮最大 (\d+) 节点，预算 (\d+) 节点/);
ok(!!capM && !!capDoc, 'D5a 两边都读到了节点预算',
  `代码 opts.cap ${capM?.[1]} · 文档读数 ${capDoc?.[1]} / 界 ${capDoc?.[2]}`);
ok(!!capM && !!capDoc && +capDoc[2] === +capM[1], 'D5 文档写的预算等于 generate.js 的 opts.cap',
  capM && capDoc ? `文档 ${capDoc[2]} vs 代码 ${capM[1]}` : '解析不到');
ok(!!capM && !!capDoc && +capDoc[1] < +capM[1], 'D5b 「远没花完预算」这句散文是真的：读数 < cap',
  capM && capDoc ? `${capDoc[1]} < ${capM[1]}，余量 ${((1 - +capDoc[1] / +capM[1]) * 100).toFixed(1)}%` : '解析不到');

// ---- D6 CI 覆盖表：文档声称在 CI 跑的门禁，必须真在那个 job 里 ----
const jobBlocks = {};
// 只在 jobs: 那一段里找 job——`on:` 与 `permissions:` 下也是两空格缩进的 key，
// 整份文件一起匹配会把 push/pull_request 当成 job 名。
const jobsSrc = CI.slice(CI.indexOf('\njobs:'));
for (const m of jobsSrc.matchAll(/^ {2}([A-Za-z0-9_-]+):([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:|\n(?=\S)|(?![\s\S]))/gm)) {
  jobBlocks[m[1]] = m[2];
}
const ciRows = [...README.matchAll(/^\| (`[^`]+`|GATE_SELFTEST=1 bash tools\/verify\.sh) \| (check|browser) \| `([^`]+)`/gm)];
const listedTokens = new Set();
ok(Object.keys(jobBlocks).length >= 2 && ciRows.length >= 4,
  'D6a CI 的 job 块与文档的覆盖表都解析到了东西',
  `job ${Object.keys(jobBlocks).join('/')} · 覆盖表 ${ciRows.length} 行`);
for (const r of ciRows) {
  const block = jobBlocks[r[2]] || '';
  const cmd = r[1].replace(/`/g, '');
  listedTokens.add(r[3]);
  ok(block.includes(r[3]) && block.includes(cmd.split(' ').slice(-2).join(' ')),
    `D6 覆盖表那一行真在 ${r[2]} job 里：${cmd}`, `步骤名 ${r[3]}`);
}
const ciCommands = [...CI.matchAll(/node tools\/([\w.-]+\.mjs)/g)].map((m) => m[1]);
const unlisted = [...new Set(ciCommands)].filter((c) => ![...ciRows].some((r) => r[1].includes(c)));
ok(unlisted.length === 0, 'D6b ci.yml 里跑的每个 tools 门禁都被覆盖表列了（文档不许比门禁松）',
  unlisted.length ? `漏了：${unlisted.join(' ')}` : `runner 里 ${[...new Set(ciCommands)].join(' ')} 全在表上`);

// ---- D6d 语法那一步只许调 leg，而且 leg 自己的根要真的盖住树 ----
// 这一步以前手抄了三份 `for f in $(git ls-files …)` 循环。抄本的坏处不是啰嗦，是"两份真相"：
// leg 改了抄本不会跟着红。更糟的是抄本自己漏东西——根目录的 `sw.js` 既不在那三份的 glob 里，
// 也不在 `check` leg 的 find 根里，于是一份解析不了的服务工作脚本能一路绿到上线（本轮实测）。
const syntaxStep = (CI.match(/- name: Syntax check every source\n([\s\S]*?)(?=\n {6}- name:)/) || [])[1] || '';
const legCallsCheck = /\brun:\s*(?:\|\s*\n)?\s*npm run check\b/.test(syntaxStep);
const legRoots = (((PKG.scripts.check || '').match(/find\s+(.+?)\s+-type f/) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
const srcFiles = [];
(function walk(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '_scratch') continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(join(dir, e.name), p);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) srcFiles.push(p);
  }
})(ROOT, '');
const outside = srcFiles.filter((f) => !legRoots.some((r) => f === r || f.startsWith(`${r}/`)));
ok(legCallsCheck && legRoots.length >= 4 && outside.length === 0,
  'D6d CI 的 `Syntax check every source` 那一步直接调 `npm run check`，而那条 leg 自己的 find 根盖住树上每个源码文件（手抄一份 loop 就是第二份真相：leg 改了抄本不红，抄本漏一个根＝那个文件从此没人 `node --check`）',
  `CI 那一步实到 ${JSON.stringify((syntaxStep.split('\n').map((s) => s.trim()).filter((s) => s && s !== 'run: |')[0] || '解析不到'))} · leg 根 ${legRoots.join(' ') || '解析不到'} · 根外的源码文件 ${outside.length ? outside.join(' ') : '0 个'}（树上一共 ${srcFiles.length} 个）`);

// D6c 钉的是"有人跑台账"这句话本身。台账是个文件，文件躺在仓里不等于 CI 会跑它——
// 所以四处各查一遍，缺任何一处就红，而 H14 这把刀砍的正是 CI 里那一步（少了它 D6c 必须自己变红）。
const SAB = existsSync(join(ROOT, 'tools/sabotage.py')) ? read('tools/sabotage.py') : '';
const sabWires = {
  ci: /run: python3 tools\/sabotage\.py/.test(jobBlocks.browser || ''),
  pkg: ((PKG.scripts || {}).sabotage || '').trim() === 'python3 tools/sabotage.py',
  readme: /python3 tools\/sabotage\.py/.test(README),
  knife: /'D6c'/.test(SAB),
};
ok(Object.values(sabWires).every(Boolean),
  'D6c 破坏台账接进了 browser job、package.json 与 README，而且这条接线自己有一把刀（砍掉任何一处它就只是一段代码）',
  Object.entries(sabWires).map(([k, v]) => `${k}=${v ? '在' : '缺'}`).join(' · ') + (SAB ? '' : ' · 台架文件不在树里'));

// ---- D7 SAMPLES 旋钮：ci.yml 的值 == 文档引用的值 == 不接线时的默认，且 env 真的接得上 ----
const ciSamples = (CI.match(/SAMPLES: "(\d+)"/) || [])[1];
const docSamples = (README.match(/CI 用 SAMPLES=(\d+) 跑 balance\.mjs/) || [])[1];
const defaultN = (BAL.match(/const N = [^\n]*[:?]\s*(\d+);/) || [])[1];
ok(!!ciSamples && !!docSamples && !!defaultN, 'D7a 三处都读到了样本数',
  `ci.yml ${ciSamples} · 文档 ${docSamples} · 默认 ${defaultN}`);
ok(ciSamples && docSamples && +ciSamples === +docSamples && +ciSamples === +defaultN,
  'D7 CI 的 SAMPLES == 文档引用的那个值 == 不设 env 时的默认',
  `${ciSamples} / ${docSamples} / ${defaultN}`);
const probe = await new Promise((resolve) => {
  const child = spawn(process.execPath, [join(ROOT, 'tools/balance.mjs')], { env: { ...process.env, SAMPLES: '3' } });
  let buf = '';
  const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(buf || '(no output)'); }, 15000);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    const first = buf.split('\n')[0];
    if (/菜单三档 × \d+ 张/.test(buf)) { clearTimeout(timer); child.kill('SIGKILL'); resolve(first); }
  });
  child.on('close', () => { clearTimeout(timer); resolve(buf.split('\n')[0] || '(exited silently)'); });
});
ok(/× 3 张/.test(probe), 'D7b 子进程探针：SAMPLES=3 必须真的改成 3 张（env 是接上的，不是装饰）',
  `balance 第一行：${probe}`);

// ---- D8 逐报告条数的自洽：文档列的 14 个数加起来，必须等于它自己写的两个总数 ----
const items = [...README.matchAll(/\b(engine|gen|play|hint|win|layout|mouse|touch|keys|save|nav|resume|reload|corrupt) (\d+)(?=\s*\/|\s*，)/g)]
  .map((m) => ({ name: m[1], n: +m[2] }));
const totals = README.match(/每形态 (\d+) 条 · 合计 (\d+) 条/);
ok(items.length === reportsPerShape && !!totals, 'D8a 逐报告条数与总数都解析到了',
  `解析 ${items.length} 项 / 期望 ${reportsPerShape} 份 · 总句 ${totals ? '在' : '不在'}`);
const perShape = items.reduce((a, b) => a + b.n, 0);
ok(!!totals && perShape === +totals[1], 'D8 文档列的逐报告条数加起来 == 它写的每形态条数',
  totals ? `加起来 ${perShape} vs 文档 ${totals[1]}` : '解析不到');
ok(!!totals && perShape * shapes === +totals[2], 'D8b 每形态条数 × 形态数 == 文档写的合计（两种形态必须等量）',
  totals ? `${perShape}×${shapes} vs ${totals[2]}` : '解析不到');

// ---- D9 引用不漂：文档里每一个 path:NN 都指向真实文件里真实存在的那一行 ----
const cites = [...DOCS.matchAll(/((?:\.github\/workflows\/)?[\w./-]+\.(?:js|mjs|cjs|sh|json|html|yml)):(\d+)(?:-(\d+))?/g)];
const bad = [];
for (const c of cites) {
  let src;
  try {
    src = read(c[1]);
  } catch {
    bad.push(`${c[1]}:${c[2]}（文件不存在）`);
    continue;
  }
  const n = src.split('\n').length;
  if (+c[2] > n || (+c[3] && +c[3] > n)) bad.push(`${c[1]}:${c[2]}${c[3] ? '-' + c[3] : ''}（该文件只有 ${n} 行）`);
}
ok(cites.length >= 20, 'D9a 文档里的行号引用解析到了一大堆（少于 20 条说明引用格式改了）',
  `${cites.length} 条引用`);
ok(bad.length === 0, 'D9 每一条 path:NN 引用都落在真实文件的行数内',
  bad.length ? `越界：${bad.join('，')}` : `${cites.length} 条全部在范围内`);

// ---- D10 红线标签双向：文档点名的每条红线都得存在，存在的每条红线都得有人写 ----
const realLabels = [...new Set([...BAL.matchAll(/\b(B\d(?:b)?)(?=[ 　])/g)].map((m) => m[1]))];
const docLabels = [...new Set([...DOCS.matchAll(/`?(B\d(?:b)?)`?/g)].map((m) => m[1]))];
ok(realLabels.length >= 6, 'D10a balance.mjs 里的红线标签解析到了',
  `${realLabels.sort().join(' ')}`);
const missing = docLabels.filter((l) => !realLabels.includes(l));
const undocumented = realLabels.filter((l) => !docLabels.includes(l));
ok(missing.length === 0, 'D10 文档点名的每条红线在 balance.mjs 里都还在',
  missing.length ? `文档引用了不存在的红线：${missing.join(' ')}` : `${docLabels.sort().join(' ')} 全部存在`);
ok(undocumented.length === 0, 'D10b balance.mjs 里每条红线都被文档点名（新增红线不能没人写）',
  undocumented.length ? `没写进文档：${undocumented.join(' ')}` : '一一对上');

// ---- D12 同一件事的三份抄本：报告数与断言数在文档里被写了三次，这里让它们对同一个现推值 ----
// D3 管「闸的形状」那一句、D8 管「逐报告条数」那一段，可 README 另有两处各自写着份数与条数
// （门禁清单的 verify 那一行、承诺表的形态那一行）。它们与上面两处是**同一个事实的第四次抄写**：
// 加一份报告、或给某条腿多一条断言时，改了 A 处忘了 B 处，文档就同时印着两个数，而两处都绿。
const shapeTotal = reportsPerShape * shapes;   // 现推：一次跑多少份报告
const assertTotal = perShape * shapes;         // 现推：一次跑多少条断言
const PAIR_RE = /(\d+) 份报告 \/ (\d+) 条断言 \/ 0 失败/g;
const SHAPE_RE = /(\d+) 个形态 · (\d+) 份报告/g;
const pairClaims = [...README.matchAll(PAIR_RE)];
const shapeClaims = [...README.matchAll(SHAPE_RE)];
const pairMiss = pairClaims.filter((m) => +m[1] !== shapeTotal || +m[2] !== assertTotal);
const shapeMiss = shapeClaims.filter((m) => +m[1] !== shapes || +m[2] !== shapeTotal);
ok(pairClaims.length >= 1 && shapeClaims.length >= 1,
  'D12a README 里"份数 + 条数"那两形各解析到了至少一处（抄本被删光时这里红，不是那两格变空转绿）',
  `「N 份报告 / M 条断言 / 0 失败」${pairClaims.length} 处 · 「K 个形态 · N 份报告」${shapeClaims.length} 处`);
ok(pairMiss.length === 0, `D12b 每一处「N 份报告 / M 条断言」都等于脚本现推的（${shapeTotal} 份 / ${assertTotal} 条）`,
  pairMiss.length ? `漂：${pairMiss.map((m) => `${m[1]} 份/${m[2]} 条`).join('，')}`
                  : `${pairClaims.length} 处全部等于 ${shapeTotal}/${assertTotal}`);
ok(shapeMiss.length === 0, `D12c 「K 个形态 · N 份报告」等于现推的（${shapes} 形态 · ${shapeTotal} 份）`,
  shapeMiss.length ? `漂：${shapeMiss.map((m) => `${m[1]} 形态/${m[2]} 份`).join('，')}`
                   : `${shapeClaims.length} 处全部等于 ${shapes}/${shapeTotal}`);
// 阳性对照下在内存里：把其中一处抄本改坏一个数，同一套比较必须认它漂。
// 没有这一格，D12b/D12c 与"正则最近没匹配上任何东西"这件事就没有区别——都绿得没有证人。
const bite = (text) => [...text.matchAll(PAIR_RE)].some((m) => +m[1] !== shapeTotal || +m[2] !== assertTotal)
  || [...text.matchAll(SHAPE_RE)].some((m) => +m[1] !== shapes || +m[2] !== shapeTotal);
const fakePair = README.replace('28 份报告 / 604 条断言', '28 份报告 / 605 条断言');
const fakeShape = README.replace('2 个形态 · 28 份报告', '2 个形态 · 29 份报告');
ok(fakePair !== README && fakeShape !== README && pairClaims.length === 1 && shapeClaims.length === 1
   && bite(fakePair) && bite(fakeShape) && !bite(README),
  'D12d 内存阳性对照：两处抄本各改一个数，这套比较都必须认它漂（改回真的就等于没测）',
  `604→605 ${bite(fakePair) ? '认漂' : '没认'} · 28→29 ${bite(fakeShape) ? '认漂' : '没认'} · 原文 ${bite(README) ? '被误判漂' : '判为等'}`);

// ---- D11 家门口的门：verify.sh 必须跑这三道逻辑闸，而且钉的条数与实跑一致 ----
// 补的是「门只在 CI 里跑」这个缺陷：CI 的 check job 有 engine-test 与 doctest 两步、browser job
// 有台账一步，而本地那道 one-shot 以前一步都不跑——改闸的人在自己机器上看见的绿，是另一套。
// D11a 先数解析到几颗钉：读不到那一行时后面三条都会变成"什么都不比较"的空转绿。
const pinBlock = (VERIFY.match(/^LOGIC_EXPECTS="([^"]+)"/m) || [])[1] || '';
const pins = Object.fromEntries(pinBlock.split(/\s+/).filter(Boolean).map((kv) => kv.split(':')));
ok(Object.keys(pins).length === 2 && !!pins.doctest && !!pins.sabotage,
  'D11a verify.sh 的 LOGIC_EXPECTS 解析到且只解析到两颗钉（doctest 与 sabotage）',
  pinBlock || 'verify.sh 里没有 LOGIC_EXPECTS 那一行');
const knives = (SAB.match(/^\s{4}\('(H\d+|N\d)',/gm) || []).length;
ok(!!pins.sabotage && +pins.sabotage === knives,
  'D11c verify.sh 钉的刀数 == 台账源码里现数的刀数（加一把刀要两边一起走）',
  `钉 ${pins.sabotage || '无'} · 现数 ${knives}`);
// 行首的环境变量赋值（台账那一条就是 `HEBI_VERIFY_INSIDE_LEDGER=1 python3 …`）先剥掉再判，
// 但注释行仍然落在门外：注释里提到路径不等于真的调了。
const callLines = VERIFY.split('\n')
  .map((l) => l.replace(/^\s*(?:[A-Z][A-Z0-9_]*=\S*\s+)+/, ''))
  .filter((l) => /^(node|python3)\s/.test(l));
const called = ['tools/engine-test.mjs', 'tools/doctest.mjs', 'tools/sabotage.py']
  .filter((c) => callLines.some((l) => l.includes(c)));
ok(called.length === 3, 'D11d verify.sh 里三道逻辑闸各有一条真调用（注释里提到不算调用）',
  called.join(' · ') || '一条都没有');
const finalRows = rows + 4; // D11b、D11e、D11f、D12e 各是本闸的一项，它们排在最后
ok(!!pins.doctest && +pins.doctest === finalRows,
  `D11b verify.sh 钉的 doctest 项数 == 本闸实跑项数（${finalRows}，含 D11 这六条）`,
  `钉 ${pins.doctest || '无'} · 实跑 ${finalRows}`);
// README 那张逐枪表是台账对外的说法：刀加在源码里、表没跟着写，读文档的人就以为台账只有这些。
const docKnives = [...new Set([...README.matchAll(/^\| (H\d+|N\d) \|/gm)].map((m) => m[1]))];
ok(docKnives.length === knives,
  `D11e README 逐枪表解析到的刀数 == 台账源码现数的刀数（${knives}；解析到 ${docKnives.length} 行）`,
  docKnives.length ? `文档 ${docKnives.sort().join(' ')} vs 源码 ${knives}` : '表里一行都没解析到');
// 文档里 `rows: N fail: 0` 那几处是"本闸本轮的读数"：它们是抄的，而抄的数没人核对就会漂
// （DESIGN 里那两句带日志名的历史记录是某一轮的读数，不在这一处对账的范围内）。
const docRows = [...new Set([...README.matchAll(/rows: (\d+) fail: 0/g)].map((m) => m[1]))];
ok(docRows.length === 1 && docRows[0] === String(finalRows),
  `D11f README 里 \`rows: N fail: 0\` 只出现一个 N，而且等于本闸实跑项数（${finalRows}）`,
  docRows.length ? `文档 ${docRows.join('/')}` : '文档里一处 rows: 都没解析到（那就是把这几处删了）');

// 这一格排在最后是有原因的：它要数的是"这一次跑过的组"，而 D11 自己那几项也得先进 emitted。
// 文档点名的 D 编号是玩家/改闸的人按图索骥的入口——入口指到一洞不存在、或指到一个这一遍
// 没跑的组，都比"少一条断言"更坏，因为它是绿的假话。
const GROUPS_TOTAL = 12;
const dMentions = [...new Set((DOCS.match(/(?<![A-Za-z0-9_])D\d+/g) || []))].map((x) => +x.slice(1)).sort((a, b) => a - b);
const unknownD = dMentions.filter((v) => !emitted.has(v));
ok(dMentions.length >= 10 && dMentions.length <= GROUPS_TOTAL && unknownD.length === 0
   && emitted.size === GROUPS_TOTAL,
  `D12e 文档点名的每个 D 编号都在这一次实跑的 ${GROUPS_TOTAL} 个组里（编号写到不存在的那一组就红）`,
  unknownD.length ? `没有对应检查：${unknownD.map((v) => 'D' + v).join(' ')}`
                  : `文档点名 ${dMentions.join('/')} · 本次实跑 ${emitted.size} 组`);

console.log(`\n合计 ${rows} 项，${fail.length} 项失败`);
console.log(`rows: ${rows} fail: ${fail.length}`);
if (fail.length) {
  for (const f of fail) console.log(`  未过：${f}`);
  process.exit(1);
}

# 蛇莓 · Hebi-Ichigo（零猜测蛇形推理）

浏览器原生的 **Hebi-Ichigo / 蛇莓**：无构建步骤、无打包器，棋盘、箭头题面、蛇身配色全部由
`<canvas>` 现画（`index.html:81`，`js/render/board.js`），运行时不装任何包。
玩法是在白格里摆出若干条 `1→2→3→4→5` 的蛇：黑格里的**箭头 + 数字**写着「从这个黑格沿箭头方向
看过去，第一个遇到的数字必须是几」，蛇与蛇不能相邻（斜角可以），白格允许留空（`js/engine/hebi.js:16`）。

每一局在出货前都被**只用命名规则**的铅笔求解器从空盘推到底，再由不含任何推理规则的
**逐格穷举计数器** `countSolutions()` 证明唯一解：计数器一旦「数不完」（`bounded`）或与判据
不一致（`viol`），这张盘直接退货（`js/engine/generate.js:129`、`js/engine/generate.js:130`）。
所以「零猜测」是准入门槛，不是文案。提示走的是**同一个**求解器，因此它必须点名用了哪条规则、
落在哪一格（`tools/scenarios.js:276`）。

规则来源、设计取舍、以及**哪些话没有被任何闸守住**，都在 `DESIGN.md`。

## 快速开始

```bash
npm start            # 零依赖静态服务 → http://127.0.0.1:5262/（package.json:7）
# 两种 URL 形态都 serve（本地开发与 Pages 子路径一致，server.cjs 自己就是这条承诺的实现）：
#   http://127.0.0.1:5262/
#   http://127.0.0.1:5262/z-biz-game-hebi-cos/
```

## 验证：四条命令与它们本轮实测的输出

下面每一个数字都是本仓本轮跑出来的，括号里是打印它的那行代码。

```bash
npm run check        # → OK（package.json:11 逐文件 node --check，含 server.cjs 与 tools）
npm test             # → 合计 127 项通过，0 项失败（tools/engine-test.mjs）
npm run balance      # → 合计红线 0 条破口（tools/balance.mjs:98）
bash tools/verify.sh # → preflight 2 个 URL 形态都 served，=== ALL GREEN ===，rc=0（tools/verify.sh:258）
GATE_SELFTEST=1 bash tools/verify.sh   # → rc=1，28 行 `FAIL GATE_SELFTEST … planted red`，对数表点名到腿（tools/verify.sh:241）
```

- **引擎断言 `npm test`**：默认 12 个 seed（`tools/engine-test.mjs:88`）。本轮逐尺寸出货
  `5x5 K=2 12/12 · 线索 med 6 · 推理步 med 31 · 唯一性节点 max 309 · 每张 med 19 ms`、
  `6x6 K=3 12/12 · med 9 · med 49 · max 507 · 54 ms`、
  `8x8 K=5 12/12 · med 14 · med 88 · max 10822 · 320 ms`（`tools/engine-test.mjs:110`）。
  官方 5×5 例题上两条路互相点头：穷举 `1 解 · 76 节点 · 候选蛇 84`，铅笔 `0 猜推满 · 20/20 白格 · 6 轮`，
  且两个解逐格相同（`tools/engine-test.mjs:78` 计数器对官方解、`tools/engine-test.mjs:83` 铅笔对官方解）。
- **难度阶梯 `npm run balance`**：`SAMPLES=20` 时出货率三档都是 **20/20 = 100%**，
  推理步 med `32 / 49 / 86`、p95 `42 / 55 / 103`，每张 med `17 / 49 / 360 ms`、p95 `41 / 66 / 476 ms`，
  唯一性节点 max `358 / 6556 / 2115`（`tools/balance.mjs:39`）。红线：B1 p95 预算
  `400 / 900 / 3000 ms`、B2 出货率 ≥20%、B3 三档单调 `32 < 49 < 86`、
  B3b 首末两档区间不重叠 `5x5 p95 42 < 8x8 p10 75`、B4 铅笔对多解盘从不说「推满」
  （`样本 15 · 见证多解盘 15 · 被推满 0`）、B5 选档页印的「实测 N 步」逐档等于本轮实测、
  B6 `generate.js` 注释里的步数也钉在同一把尺子上（`tools/balance.mjs:47`、`tools/balance.mjs:48`、
  `tools/balance.mjs:51`、`tools/balance.mjs:53`、`tools/balance.mjs:81`、`tools/balance.mjs:106`、
  `tools/balance.mjs:113`）。
- **浏览器闸 `bash tools/verify.sh`**：真 Chrome + CDP，读 DOM 文本/几何与画布像素，不读内部标志位
  （`tools/scenarios.js:3` 起）。7 条腿（`tools/verify.sh:76`）跑出 14 份断言行 × 2 个 URL 形态
  （`tools/verify.sh:47`）= 本轮 **584 条断言，0 条失败**；两种形态每一腿条数完全相同
  （engine 30 / gen 50 / play 42 / hint 18 / win 18 / layout 27 / mouse 19 / touch 22 / keys 15 /
  save 16 / nav 4 / resume 18 / reload 4 / corrupt 9）。真事件三条腿走 `Input.dispatch*`
  （`tools/playtest.cjs:328`），键盘腿先真点一次把焦点钉在棋盘上、再逐键断言到达数
  `1 seen/1 handled/0 repeat`（`tools/playtest.cjs:407`、`tools/playtest.cjs:421`）。
  触屏腿自己声明并读回移动覆写 `innerWidth 390 / dpr 3`（`tools/playtest.cjs:346`）。
- **闸必须能红**：`GATE_SELFTEST=1` 时每一份报告都要多塞一条注定错的期望。场景腿由
  `tools/scenarios.js:29` 加；node 侧的真事件腿（mouse/touch/keys）与 nav/reload 不经过 scenarios.js，
  由 `tools/playtest.cjs:38` 的 `result()` 加同一条——上一轮只有 18/28 份报告能红，缺的正是这五条腿。
  本轮 28 份报告（14 份 × 2 形态）各红一次、共 28 行 `FAIL GATE_SELFTEST`、`rc=1`；
  分母由 `LEGS` 现算（`tools/verify.sh:229-238`），谁没种上就点名谁（`tools/verify.sh:128`）。
  CI 同时要求 `rc≠0` **和**日志里有 `FAIL`（`.github/workflows/ci.yml:75`、`.github/workflows/ci.yml:76`）：
  一条没点名的红不算红。另一侧，一条什么都没断言的腿也不算绿（`tools/verify.sh:121`）。
  这条守卫本身是被**弄坏它**验过的：把 `tools/playtest.cjs:38` 的种错条件改死再跑 `LEGS=keys` 的自证，
  两种形态各红一次 `RED keysleg：这一份报告里没有种下的错期望`、对数表读出 `0/2`。

## 三档菜单与 10×10

菜单只有三档，尺寸/蛇条数与标称实测值写在 `js/ui/game.js:23`：

| 档 | 尺寸 | 蛇条数 | 标称实测（`js/ui/game.js:24`） | 本轮 `npm run balance` 实测 |
| --- | --- | --- | --- | --- |
| 初 | 5×5 | 2 | 32 步 / 13 ms | med 32 步 / med 17 ms |
| 中 | 6×6 | 3 | 49 步 / 40 ms | med 49 步 / med 49 ms |
| 高 | 8×8 | 5 | 86 步 / 257 ms | med 86 步 / med 360 ms |

左边那一列是**页面上印给玩家的话**，所以它的步数由 B5 逐档核对（`tools/balance.mjs:106`）：本轮实测
`32 / 49 / 86` 与标称全等，不等就红。ms 不进等式——那是机器速度，B5b 只卡方向单调
（`tools/balance.mjs:108`），因此上面 `13/40/257` 与本轮 `17/49/360` 的差别不算回归，也不是一张闸读过的承诺。

10×10 不进菜单，而且**出局理由印在选档页上**：`js/ui/game.js:31`。浏览器腿断言这段披露真的在页面上
（`tools/scenarios.js:262`；这个元素由 `js/main.js:374` 在运行时现造，不在静态 HTML 里）。它的实测依据是 `tools/balance.mjs:86` 起的观测段——本轮
`出货 0/6 · 墙钟 8319 ms`（`tools/balance.mjs:95`）。这一句**故意不设红线**：哪天铅笔推得满 10×10
是进步，不该让闸变红（`tools/balance.mjs:3`）。

8×8 是唯一性计数与像素预算都实测过最大的尺寸：`高一档 8×8` 与「大棋盘每一格都点得中」
（64/64 命中，`tools/scenarios.js:477`）、格子边长在 `theme.Cell` 的上下限内
（`tools/scenarios.js:465`）、页面不横向溢出（`tools/scenarios.js:467`）都是断言。
比它更大的尺寸没有任何闸说它能玩。

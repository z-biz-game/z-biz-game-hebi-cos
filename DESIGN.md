# DESIGN · 蛇莓 Hebi-Ichigo

这份文档只做一件事：把「页面上说出口的每一句话」对上「哪条闸在什么命令下守它」。
所有数字都是本轮实测（`npm test` / `npm run check` / `npm run balance` / `bash tools/verify.sh` /
`GATE_SELFTEST=1 bash tools/verify.sh`），括号里是打印或断言它的那行代码。
没有闸守的话就写进最后的**不承诺**，不写成成就。

## 来源与取证

规则文本逐字抄在两处，本仓不自创条款：

- Nikoli（英文页）四条：蛇按 `1(头)→5(尾)` 顺序连、蛇与蛇不能共边、从 `2→1` 方向看（蛇的视线）
  到下一个黑格或盘边之间不能有别的蛇、黑格里的数字是箭头方向上第一个数字（0 = 一路到黑格/边界都没有）。
- Cross+A：蛇眼在**头格**朝向「背离身体那一侧」的边上。

两份来源单读文字在「箭头是谁的」上有歧义（黑格自带箭头，还是蛇眼投过来的视线），
按官方规则图钉死成前者：箭头与数字都印在黑格里、是题面给的，蛇眼只管第 3 条
（`js/engine/hebi.js:14`）。逐字原文与链接就写在 `js/engine/hebi.js:2`–`js/engine/hebi.js:16`。
题面**不给**蛇的条数、也**不要求**白格填满（`js/engine/hebi.js:16`）——这两句是判据形状的前提。

## 两条互相不认识的路

一张盘出货前必须同时点头两次：

1. **铅笔** `solvePencil()`：只用命名规则 `P0-区 / P1-链 / P1-弧 / P2-邻 / P2-围 / P3-眼 /
   P4-零 / P4-挡 / P4-独 / P4-尽`（名字逐条列在 `js/engine/pencil.js:3`–`js/engine/pencil.js:12`），
   从空盘推。推不满就退货。
2. **穷举计数器** `countSolutions()`：不含任何推理规则，逐格枚举。它必须**恰好数出一个解**
   且不越界；`bounded`（节点预算花完）或 `viol`（计数器与判据 R1–R4 打架）都退货
   （`js/engine/generate.js:129`、`js/engine/generate.js:130`）。默认预算 `cap 2000000`
   （`js/engine/generate.js:112`）。

两条路互不复用代码，所以「唯一且零猜测」不是同一件事说两遍。官方 5×5 例题上它们会合：
穷举 `1 解 · 76 节点 · 候选蛇 84`，铅笔 `0 猜推满 · 20/20 白格 · 6 轮`，
**两个解逐格相同**（`tools/engine-test.mjs:78` 计数器对官方解、`tools/engine-test.mjs:83` 铅笔对官方解）。
浏览器里跑的是同一份模块图，不是测试专用副本（`tools/scenarios.js:12` 段落说明）。

判据 `check()` 返回的每条违反都以 `R1`–`R4` 开头（`js/engine/hebi.js:62`），
因为「被自己那一条抓到」是断言的一部分：`tools/engine-test.mjs` 的反例要求 R2/R3/R4 各归各位，
浏览器腿也断言屏幕上第一个词是条款号（`tools/scenarios.js:250`）。

## 难度：只有量出来的那一种说法

菜单三档（`js/ui/game.js:23`）的尺寸/蛇条数是设计，**难度轴是实测推理步数**
（`difficulty() = stats.pencilSteps`，`js/engine/generate.js:150`），并且这句话本身就是断言
（`tools/scenarios.js:147`：难度分就是实测推理步数）。本轮 `SAMPLES=20 npm run balance` 实测：

| 档 | 尺寸 | K | 出货 | 线索 med | 推理步 med / p95 | 每张 med / p95 ms | 唯一性节点 max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 初 | 5×5 | 2 | 20/20 | 6 | 32 / 42 | 13 / 33 | 358 |
| 中 | 6×6 | 3 | 20/20 | 8 | 49 / 55 | 39 / 53 | 6556 |
| 高 | 8×8 | 5 | 20/20 | 15 | 86 / 103 | 256 / 342 | 2115 |

（同一张表由 `tools/balance.mjs:39` 打印；`npm test` 用 12 个 seed 独立量到
`31 / 49 / 88` 步、节点 max `309 / 507 / 10822`，`tools/engine-test.mjs:110`。）

守这条阶梯的红线（`tools/balance.mjs`，破了就 `exit 1`）：

- **B1 成本**：每档 p95 出题耗时 ≤ `400 / 900 / 3000 ms`（`tools/balance.mjs:47`）。
- **B2 出货率** ≥ 20%（`tools/balance.mjs:48`）：低于两成意味着按一下要等好几张退货。
- **B3 单调**：`32 < 49 < 86`（`tools/balance.mjs:51`）。
- **B3b 首末两档区间不重叠**：`5x5 p95 42 < 8x8 p10 75`（`tools/balance.mjs:53`）——
  相邻两档允许重叠，「初比高便宜」才是要守的那句话。
- **B4 铅笔不说谎**：拿和生产同一把刀、提前收手造出的**多解盘**去问铅笔，
  它一次都不许说「推满」（`tools/balance.mjs:81`，本轮 `样本 15 · 见证多解盘 15 · 被推满 0`）。
  配套的 `B4 的样本真的含多解盘`（`tools/balance.mjs:82`）防的是这条红线空转成永远绿的灯。

浏览器侧另有一把独立的小尺子：`gen` 腿在真页面里每档各出 3 张（`tools/scenarios.js:172`），
本轮步数 med `41 / 46 / 87`、8×8 med `345–349 ms`，并断言
`高一档的 min(87) > 初档的 max(41)`（`tools/scenarios.js:191`）与 med 单调（`tools/scenarios.js:192`）。

### 困难档怎么描述：以出货与预算为准，不以形容词为准

**能进菜单的尺寸就是 5×5 / 6×6 / 8×8**（`js/ui/game.js:24`–`js/ui/game.js:26`），
因为 8×8 上穷举计数仍远没花完预算就被断言「恰好 1 解」（节点 max 本轮 10822 / 2115，上限 2000000），
且 8×8 在 900×900 视口里每一格都点得中：64/64 命中、`cell 62px`（`tools/scenarios.js:477`、
`tools/scenarios.js:465`）。

10×10 K=8 **故意出局，并且出局理由印在选档页上**（`js/ui/game.js:31`–`js/ui/game.js:36`）；
页面上有没有这段话是断言（`tools/scenarios.js:262`，另见 `tools/scenarios.js:193`）。
它的实测依据是 `tools/balance.mjs:86` 起的观测段，本轮 `出货 0/6 · 墙钟 6736 ms`
（`tools/balance.mjs:95`）。这一段**故意不设红线**（`tools/balance.mjs:3`）：铅笔哪天推得满 10×10
是进步，不该让闸变红。所以关于 10×10 的正确说法只到「本轮 6 次尝试 0 次出货、因此不给承诺」为止，
再往上（「所有大尺寸都不行」）没有东西守着。

## 闸的地图

| 承诺 | 守它的东西 |
| --- | --- |
| 语法能过 | `npm run check`（`package.json:11`）+ CI 逐文件 `node --check`（`.github/workflows/ci.yml:26`） |
| 唯一解 / 零猜测 / 同 seed 可复现 | `npm test` 127 条（`tools/engine-test.mjs:105` 唯一性证完、`tools/engine-test.mjs:121` seed 确定性） |
| 阶梯与耗时预算 | `npm run balance` B1–B4（`.github/workflows/ci.yml:38`，`SAMPLES: "20"`，`tools/balance.mjs:98`） |
| 状态读数、留空、黑格不可改、胜利三条件 | 浏览器 `play/hint/win` 腿（`tools/scenarios.js:200`、`tools/scenarios.js:304`） |
| 「填满但不等于唯一解」不算赢 | `tools/scenarios.js:312`–`tools/scenarios.js:316`（本轮 win 腿 18 条断言） |
| 画面真的画出来了（三种底色、留空 vs 未定、不泄露答案） | 画布像素断言 `tools/scenarios.js:455`–`tools/scenarios.js:495` |
| 真输入事件（鼠标/触屏/键盘） | `tools/playtest.cjs:322` 的 `Input.dispatch*`，键盘焦点先真点一次钉住（`tools/playtest.cjs:401`）、逐键到达数（`tools/playtest.cjs:415`） |
| 存档不含解、续局接得上计时 | `tools/scenarios.js:365`（存档里没有解）、`tools/scenarios.js:409`（计时从存档接着走）；证人由 node 在派发导航之前抄走（`tools/verify.sh:191`） |
| 片段导航不算重载 | `tools/verify.sh:195`，本轮 4 条断言：`timeOrigin` 与文档身份都不许变 |
| 坏档 = 没有存档，不是白屏 | `tools/scenarios.js:424`–`tools/scenarios.js:430`（本轮 corrupt 腿 9 条） |
| 两种 URL 形态都算数 | `tools/verify.sh:47`（前缀形态由 `server.cjs:12` 实现，不是为测试另写一个服务）；preflight 先证明端口上的字节是本仓的（`tools/verify.sh:53`–`tools/verify.sh:61`） |
| 闸自己会红 | `tools/scenarios.js:29`  planted 行 + `tools/verify.sh:215`；CI 要求 `rc≠0` **且**日志点名 `FAIL`（`.github/workflows/ci.yml:75`、`.github/workflows/ci.yml:76`） |
| 什么都没断言的腿不算绿 | `tools/verify.sh:113`（没有 RESULT 行）、`tools/verify.sh:121`（NO CHECKS RUN） |

本轮合计：`npm test` 127/0；`npm run check` OK；`npm run balance` 红线 0 条破口；
`bash tools/verify.sh` 584 条断言 / 0 失败（14 份报告 × 2 形态）、`=== ALL GREEN ===`、`rc=0`；
`GATE_SELFTEST=1` `rc=1`、18 行具名红。

## 不承诺

以下说法**没有任何闸守住**，因此本仓的文档与页面都不主张它们（写了就是拿文案冒充测量）：

- **「每一档的标称数字被闸守住」不成立。** 选档页把 `实测推理 32 步 / 13 ms` 直接印给玩家
  （`js/main.js:369`，常量在 `js/ui/game.js:24`），但 `balance.mjs` 用的是自己那份菜单表
  （`tools/balance.mjs:12`），没有 import `TIERS`；浏览器侧只断言这些 med `> 0`
  （`tools/scenarios.js:194`）。本轮两组数字确实对上（步 med `32/49/86` 全等，ms med `13/39/256`
  vs 标称 `13/40/257`），但那是**本轮抄对了**，不是一句话被守住了。
- **音效没有证据。** `js/audio/synth.js` 被 `js/main.js:9` import，可是全仓唯一与声音有关的断言是
  `设置退回默认`（`tools/scenarios.js:430`）读到的 `sound: true`。没有任何闸观察到一次发声。
  因此「音效由 WebAudio 合成」不写进 README。
- **「零美术/零资产文件」没有计数闸。** CI 的 `Entry files exist` 只查 `index.html` 里有
  `<canvas`、`js/main.js`、`hebi` 三个记号（`.github/workflows/ci.yml:43`）；
  Pages 只上传 `index.html`、`css`、`js`（`.github/workflows/pages.yml:29`、
  `.github/workflows/pages.yml:30`）。本轮 `find` 没找到 png/mp3/wav/svg/woff，但这是**一次人工观察**。
- **10 条铅笔规则是否每条都真的会开火，没量。** `js/engine/pencil.js:14` 把「8x8 以上推不完」
  归因到 `P0-区` 这条禁用，并指名要 DESIGN 写「不承诺」——这条**归因**没有任何闸量过。
  实测到的只有：`hint` 腿本轮用完一局 6×6 只开了 4 条
  （`P1-链 / P4-零 / P4-独 / P2-围`，`tools/scenarios.js:287` 把它们随断言一起打出来），
  且每条名字都过 `/^P[0-4]-/`（`tools/scenarios.js:288`）；
  页面「你会用到的几条」列的是 4 个规则族（`index.html:61`–`index.html:66`），
  没有闸检查这份清单与 `js/engine/pencil.js:3`–`js/engine/pencil.js:12` 的实现集是否一致。
- **`generate.js` 头部注释里的历史对照数**（`js/engine/generate.js:2`–`js/engine/generate.js:5` 的
  `2/60`、`396 次计数 ≈ 19 s`、`20/30 · 19 ms`，`js/engine/generate.js:25` 的 `0/3`，
  `js/engine/generate.js:78` 的 `74/77`，`js/engine/generate.js:147` 的 `5x5 32 → 6x6 45 → 8x8 82`）
  是**写代码时的判断记录**，没有任何闸读它们，本轮也不复现（其中 `45/82` 与本轮实测 `49/86`
  已经不符）。它们留在原处当注释，不搬进文档。
- **移动端只证到「几何没坏」。** `touch` 腿在 390×844 / dpr 3 覆写下发真触屏事件并读回覆写在位
  （`tools/playtest.cjs:329`、`tools/playtest.cjs:340`），但没有 iOS/Android 真机、
  也没有任何闸量过移动端帧率或手感。
- **计时类断言只保证方向，不保证快。** 计时腿断言的是「续局后 `elapsedMs` 不小于存档基线」
  （`tools/scenarios.js:409`），本轮读到 `134 ms` 起步的续局；没有任何闸承诺某一档多少毫秒内推完。

# deliverable — z-biz-game-hebi-cos

基线 HEAD `9ed6186`（并线后）→ 本次四个提交 `dec2229` → `b77bd28` → `4da5a62` → `06a4c40`。
所有数字都是本机现跑的输出，命令原样附在第 6 节。

## 0. 一句话

并线把两侧**互斥**的实现按块拼在一起，拼出四个断点：从整局起不来的 ESM 同名顶层声明、
`init` 中段就抛的 id 对接错、两套互斥时钟架构混搭、以及浮点毫秒没兑现本仓「记录用整数毫秒」的契约。
本次逐个归因并修掉，**没有删任何功能**：删的全是并线拼出来的重复声明与指向不存在 id 的残留接线。

## 1. 缺陷一：`audio()` 留了两份，还丢了计数器声明（整局不可玩）

**旧代码错在哪**

并线把两侧各写一遍的 `function audio()` 都留在 `js/audio/synth.js`。ES module 是严格模式，
同一作用域里两个同名函数声明直接是 SyntaxError（`Identifier 'audio' has already been declared`）——
整个模块图一行都不执行，页面停在空壳。

同时并线还丢了 ours 侧的 `ensure()` 与 `let voices / suspends / resumes` 三个声明：
`Sound.stats()` 要读 `voices/suspends/resumes`，而 `window.hebi.state.sound` 正是读它 ——
即便语法不炸，这一路也是 ReferenceError。

**新代码为什么对**

按「路径末笔裁决」（ours 侧 10-10 晚于 theirs 侧 10-03）恢复并线前 ours 侧那份自洽的 `synth.js`：
一份 `audio()`、`ensure()` 存在、`voices/suspends/resumes` 三个计数器都有。
theirs 侧那份不是删功能，是撤掉第二套实现——它与 ours 侧对同一件事各写一遍。

## 2. 缺陷二：`index.html` 与 `main.js` 的 id 对接坏了（`init` 中段抛错）

**旧代码错在哪**

并线后的 `index.html`（theirs 侧）里按钮 id 是 `#btn-fullscreen`，而 `main.js`（ours 侧）去取
`$('#btn-full')`——页面上没有这个 id。`el.fullBtn` 拿到 `null`，
`el.fullBtn.addEventListener(...)` 当场抛 `TypeError: Cannot read properties of null`，
`init` 中段中止 → `window.hebi` 这套测试钩子根本起不来，整局不可玩。

同一段还留了两套 `fullscreenchange` 监听（一份 ours 一份 theirs），
以及 F 键以无参调用 `toggleFullscreen(root)` 的写法（签名对不上）。

**新代码为什么对**

- 全屏只留 theirs 那一套（它的按钮 `#btn-fullscreen` 在页面里真实存在，且 `bindFullscreen(btn)`
  自带前缀兜底与失败静默）。
- 删 ours 侧残留：`el.fullBtn` 那一行、`syncFullscreenLabel()`、重复的 `fullscreenchange` 监听、
  `bindFullscreen` 里第二个 F 键监听（F 键由主键位块统一处理，改成 `toggleFullscreen(fsRoot())`）。
- `index.html` 补回 `#btn-help` 按钮：玩法浮层此前只有键盘入口，鼠标点不开。
- 部署集钉数随之改：`EXPECT_CHECKS` 33 → 37、`EXPECT_ROWS` 52 → 56（并线新增 5 条引用：
  `css/paper-grain.png`、`js/sw-register.js`、`js/fx/layer.js`、`js/theme.js`、`js/time/loop.js`，
  逐条核过出处，没有丢失）。

## 3. 缺陷三：两套互斥时钟架构混搭（整局不可玩）

**旧代码错在哪**

并线前两侧各有一套完整的时钟，互斥：

| | ours（较新，帧积分器） | theirs（较旧，墙钟） |
|---|---|---|
| 时钟源 | `clockMs` + `runClock`，积分器按帧 dt 累加（`js/time/loop.js`） | `baseElapsed` + `startedAt` + `ticker`（`setInterval`） |
| 开/停表 | `startClock()` 只切 `runClock` | `startClock()` 直接操作墙钟 |
| 暂停 | `togglePause(force)`，带遮罩、按钮文案、`time.reset()` | `setPaused(v)` |

并线 + 去重之后：主时钟留了 ours 的 `clockMs`，但 `startClock/stopClock` 被换成了 theirs 的墙钟版——
它依赖的 `startedAt / baseElapsed / ticker` 三个声明在新架构里**根本不存在**。
于是 `begin()` 调 `startClock()` 直接抛 `ReferenceError: startedAt is not defined` → 整局起不来；
即便不炸，`runClock` 也永远 false，新架构的表压根不走。

另一处断点：去重把 ours 的 `togglePause(force)` 整块删了，留下 theirs 的 `setPaused/togglePause`；
两份语义不同，且末尾 theirs 那份还**重复绑了一次** `#btn-pause` 与 P 键（一份接线切两次）。

**新代码为什么对**

以 ours（较新、帧积分器、且与仓内 `js/time/loop.js` 和对拍 harness 配套）为准：

- `startClock/stopClock` 恢复 ours 的 `runClock` 版（`runClock` + `startLoop/schedule`）。
- 恢复 `let paused = false;` 声明（原先被末尾 theirs 的 `var paused` 顶掉）。
- 末尾 theirs 的暂停块换成 ours 的 `togglePause(force)`：遮罩、按钮文案、以及 theirs 独有的
  `title` 回写全部保留；`isPaused()` 作为等价读法留着（仓内无调用点，外部 harness 可能按名字取）。
- 删重复接线：`#btn-pause` 的第二个 `addEventListener`、P 键的第二个 `keydown`。
- 补接线：`index.html` 里暂停浮层的「继续」（`#btn-pause-2`）此前**没有任何调用点**，点了没反应 ——
  接上 `togglePause(false)`。

## 4. 缺陷四：浮点毫秒没兑现「记录用整数毫秒」的仓内契约

**旧代码错在哪**

浏览器场景两条红：

```
FAIL 手工通关写下纪录                       null
FAIL 计时从存档接着走（没有从 00:00 重来）  00:00 66.69999999999999ms vs 存档 0ms
```

WITNESS 里同一局的时钟读数是 `383.27ms`，而存档里的 `elapsedMs` 是 `0` —— 同一份数据，两处读数打架。

根因：`js/store.js` 的解码逐字段要 `isInt`（`readResume → n()`、`best()` 的 `isInt(b.ms)`），
这是**两侧并线前就有的仓内契约**；theirs 侧的墙钟时钟（`Date.now()` 差）天然给整数毫秒，
ours 侧的帧积分时钟（`dt * 1000`）给的是浮点。两者混搭后：

1. 小数 `elapsedMs` 被解码判成「这份存档不可用」→ 读回来 `elapsedMs = 0`；
2. 小数 `ms` 写进 `best` → `best()` 的 `isInt` 校验不过 → 纪录读出来是 `null`。

**新代码为什么对**

以 ours 的帧积分时钟为准（配套 `js/time/loop.js`、对拍 harness 与帧率保证都在它上面），
在**落库这一层**把毫秒取整——取整的是「记下来的数」，不是时钟本身，帧积分的精度不受影响：

- `flushResume()` 存档写 `Math.round(clock())`；
- `onWin()` 记纪录用 `Math.round(clock())`。

**归因**（合并前基线）：`git worktree add --detach /tmp/hebi-ours-pre 0d13c9a~1`，
在并线前 ours 侧（`71ea751`）跑同一条闸，同样两条红一模一样存在：

```
FAIL 手工通关写下纪录                       null
FAIL 计时从存档接着走（没有从 00:00 重来）  00:00 66.59999999999997ms vs 存档 0ms
```

所以这一条**不是并线引入的**，是 ours 侧本来就有的缺陷，被并线后两侧混搭放大了；本次一并修掉。

## 5. 文档锚点

`DESIGN.md:165` 的 `index.html:66`–`index.html:71`（四条 `<li>` 在 68 到 71）在并线后指到了空行 ——
并线后的 `index.html` 多插了一行空行，整段下移。改为 `index.html:67`–`index.html:72`
（四条 `<li>` 在 69 到 72）。改的是钉，不是闸。

## 6. 真实文件清单

本轮改动只碰这 6 个文件，其余一律没动：

| 文件 | 改了什么 |
|---|---|
| `js/audio/synth.js` | 恢复 ours 侧自洽的一份 `audio()`、`ensure()`、三个计数器声明 |
| `js/main.js` | 删 `#btn-full` 残留接线；恢复 ours 的 `startClock/stopClock`、`let paused`、`togglePause(force)`；删重复的 `#btn-pause`/P 键绑定；接上 `#btn-pause-2`；存档与纪录落库取整 |
| `index.html` | 补 `#btn-help` 按钮（玩法浮层的鼠标入口） |
| `DESIGN.md` | `index.html` 行号钉 66-71 → 67-72 |
| `tools/deploy-set.mjs` | 部署集钉数 `EXPECT_CHECKS` 33→37、`EXPECT_ROWS` 52→56 |
| `README.md` | 本文件（`deliverable.md`） |

## 7. 删行审计

每个提交删了什么、为什么，逐条交代：

| 提交 | 删除 | 为什么能删 |
|---|---|---|
| `dec2229` | `synth.js` 里 theirs 那份 `function audio()` + 它的静音偏好落盘块 | 同名顶层声明在 ESM 里是 SyntaxError，必须只留一份；静音偏好的**权威来源是 `Store.setting('sound')`**（`main.js` 的 `toggleMute`/`applySettings` 走它并落盘），`localStorage['cos.mute']` 是第二处互相打架的来源 |
| `b77bd28` | `el.fullBtn` 声明、`syncFullscreenLabel()`、重复的 `fullscreenchange`/`webkitfullscreenchange` 监听、`bindFullscreen` 里的第二个 F 键监听 | 前三者指向页面上不存在的 `#btn-full`（`null.addEventListener` 直接抛错）；重复监听让一次全屏切换回写两遍文案 |
| `4da5a62` | 墙钟版 `startClock/stopClock`、末尾 theirs 的 `setPaused` 块、重复的 `#btn-pause` 绑定与 P 键 `keydown` | 墙钟版依赖新架构里不存在的 `startedAt/baseElapsed/ticker`，且与 `runClock` 是同一件事的第二套实现；重复绑定让一次按键切两次 |
| `06a4c40` | 无代码删除 | 只加了两处取整与一处行号钉修正 |

## 8. 验收（原样输出）

```
$ npm test --silent
合计 127 项通过，0 项失败

$ node tools/doctest.mjs
合计 52 项，0 项失败
rows: 52 fail: 0

$ bash tools/verify.sh
逻辑闸 engine-test：127 项通过、0 项失败 ✓
逻辑闸 doctest：52 项、0 项失败 ✓
台账：20 把刀各自逼红了点名的断言 ✓
部署集：37 条引用（含 3 张位图尺寸核对），失败 0 项
rows: 56 fail: 0
DS_SELFTEST rc=0（0=每一刀都按预期发力、阴性对照按预期不发力）
=== ALL GREEN ===
```

浏览器层：两个 URL 形态（`/` 与 `/z-biz-game-hebi-cos/`）各跑一遍，28 个场景全部 `checks, 0 failed`，
`console` 无输出，无残留 Chrome。

## 9. 行为变化需知会

1. **静音偏好的持久化只有一处**：`localStorage['cos.mute']` 不再被 `synth.js` 读写，
   静音态统一由存档里的 `sound` 设置决定。若有老存档里只写了 `cos.mute` 没写 `sound`，
   刷新后静音态会回到开声 —— 这是消除双源的代价，不是新缺陷。
2. **暂停浮层的「继续」按钮现在能点了**：此前 `#btn-pause-2` 没有调用点。
3. **全屏按钮文案**：`#btn-fullscreen` 由 theirs 那套接管，文案回写由 `bindFullscreen` 负责
   （此前 ours 那套 `syncFullscreenLabel` 指向不存在的按钮，回写从未发生过）。
4. **存档与纪录里的耗时是整数毫秒**（取整后落地）：界面上的实时读数仍是毫秒级浮点精度。

## 10. 未实现 / 需人接手

- 本仓无未实现项。
- 组织层面一件事知会：`006_商业化就绪度标准.md:75` 写「图标由主编统一出图再分发，代理只负责接线」。
  本仓的图标来自并线带入的 `assets/gen/gen_art.py` 自产件，已随本次提交落盘；
  若主编之后重跑统一出图流水线并再次改写 `icons/`，需重跑本仓的部署集闸（图标尺寸/引用条数会被改动影响）。

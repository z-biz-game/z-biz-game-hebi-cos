// 时间的唯一入口：把"这一帧过了多久"换算成两件事——仿真走了几步、计时器长了多少。
//
// 为什么单独一个文件：对拍 harness 要在 node 里用 30/60/120Hz 三档喂同一份换算。
// 如果这段算术长在 main.js 的 rAF 回调里，harness 就只能照着抄一遍——抄的那份不是被测对象，
// 红与绿都说明不了游戏的事。抽出来之后，喂给 harness 的和页面跑的是同一段代码。
//
// 定步长：onStep 拿到的 dt 恒等于 step，所以"一帧 16ms"与"一帧 33ms"之间唯一该变的
// 是这一帧跑了几步，不是任何一步走了多远。

export const SIM_STEP = 1 / 60;
// 一次长停顿（切标签页、断点）不能补成一段快进：帧 dt 先钳住，欠账再丢掉。
export const MAX_FRAME_DT = 0.25;
export const MAX_CATCHUP_STEPS = 8;

export function createIntegrator({ step = SIM_STEP, onStep = () => {}, onClock = () => {} } = {}) {
  let last = null;
  let accum = 0;
  let total = 0;
  let clockMs = 0;

  return {
    // ts：rAF 的 DOMHighResTimeStamp（毫秒）。advanceClock=false 时（暂停/已胜）钟不走、
    // 但 onStep 照走——暂停要冻住的是仿真，不是"把循环掐死"。
    frame(ts, advanceClock = true) {
      const dt = last === null ? 0 : Math.min(MAX_FRAME_DT, Math.max(0, (ts - last) / 1000));
      last = ts;
      if (advanceClock && dt > 0) {
        clockMs += dt * 1000;
        onClock(dt * 1000);
      }
      accum += dt;
      let n = 0;
      while (accum >= step && n < MAX_CATCHUP_STEPS) {
        onStep(step, n);
        accum -= step;
        n++;
      }
      if (n >= MAX_CATCHUP_STEPS && accum > step * MAX_CATCHUP_STEPS) accum = 0;
      total += n;
      return { dt, n };
    },
    reset(ts = null) {
      last = ts;
      accum = 0;
    },
    get steps() {
      return total;
    },
    get clockMs() {
      return clockMs;
    },
    pending() {
      return accum;
    },
  };
}

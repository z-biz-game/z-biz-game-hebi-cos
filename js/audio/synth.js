// Synthesised feedback, no sample files. A puzzle game's sound is a *state* readout —
// "a digit went down", "that digit breaks a clause", "every snake is complete" — and each of
// those is one short envelope, so a synth keeps the artifact small and the vocabulary honest.

let ctx = null;
let master = null;
let enabled = true;
// 观察量：门禁要能自己判定"静音是真的安静了"，而不是读我随手设的一个布尔。
// voices = 真的建出来的 oscillator 只数；suspends/resumes = 各发起过几次。
let voices = 0;
let suspends = 0;
let resumes = 0;

function ensure() {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
  if (!ctx) {
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

function audio() {
  // 静音时这里直接返回 null：不是"发了声但听不见"，而是压根不建 oscillator。
  if (!enabled) return null;
  const ac = ensure();
  if (!ac) return null;
  if (ac.state === 'suspended') {
    resumes++;
    ac.resume().catch(() => {});
  }
  return ac;
}

// One oscillator with a two-point pitch glide and an exponential decay. Everything below is
// a call to this; adding a second voice shape is how a game ends up with sounds that do not
// belong to the same instrument.
function tone({ f0, f1 = f0, dur = 0.12, type = 'sine', gain = 0.22, delay = 0 }) {
  const ac = audio();
  if (!ac || !enabled) return;
  voices++;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(vol).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const Sound = {
  // 静音不是把音量拧到 0：那只是听不见，声音照发。这里挂起整个 AudioContext，
  // 于是既不会新建 oscillator，已排程的那几个也停在原地（ctx.state 是外部可查的证人）。
  setEnabled(v) {
    const next = !!v;
    if (next === enabled) return next;
    enabled = next;
    if (!ctx) return enabled;
    if (!enabled) {
      suspends++;
      ctx.suspend().catch(() => {});
    } else {
      resumes++;
      ctx.resume().catch(() => {});
    }
    return enabled;
  },
  enabled: () => enabled,
  isMuted: () => !enabled,
  toggleMute() {
    return this.setEnabled(!enabled);
  },
  // 门禁读这一份：voices 只在真的建出 oscillator 时增长，state 是 AudioContext 自己的状态。
  stats: () => ({
    enabled,
    voices,
    suspends,
    resumes,
    state: ctx ? ctx.state : 'none',
    ctxTime: ctx ? ctx.currentTime : 0,
  }),

  // 1..5 climb a pentatonic: the pitch tells you which digit went down without looking.
  digit(v) {
    const scale = [0, 523, 587, 698, 784, 932];
    const f = scale[v] || 523;
    tone({ f0: f, f1: f * 1.06, dur: 0.12, type: 'triangle', gain: 0.19 });
  },
  place() {
    tone({ f0: 520, f1: 880, dur: 0.14, type: 'triangle', gain: 0.2 });
  },
  blank() {
    tone({ f0: 330, f1: 300, dur: 0.09, type: 'sine', gain: 0.12 });
  },
  erase() {
    tone({ f0: 240, f1: 180, dur: 0.08, type: 'sine', gain: 0.1 });
  },
  undo() {
    tone({ f0: 420, f1: 300, dur: 0.11, type: 'triangle', gain: 0.13 });
  },
  // Two detuned voices: an interval that is deliberately unpleasant, for the one thing the
  // player must notice without looking.
  conflict() {
    tone({ f0: 200, f1: 150, dur: 0.16, type: 'sawtooth', gain: 0.11 });
    tone({ f0: 214, f1: 158, dur: 0.16, type: 'sawtooth', gain: 0.09, delay: 0.01 });
  },
  refuse() {
    tone({ f0: 150, f1: 120, dur: 0.07, type: 'square', gain: 0.07 });
  },
  hint() {
    tone({ f0: 760, f1: 1020, dur: 0.16, type: 'sine', gain: 0.16 });
    tone({ f0: 1140, dur: 0.1, type: 'sine', gain: 0.07, delay: 0.06 });
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.26, type: 'triangle', gain: 0.17, delay: i * 0.09 }));
  },
};

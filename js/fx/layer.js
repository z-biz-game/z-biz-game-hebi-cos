// 反馈层：只画"刚刚发生了什么"，不读题面、不判规则、不碰 #board 的像素。
//
// 为什么单独一张画布：门禁量的是 #board 的格子底色（三种底色 / 留空 vs 未定 / 不泄露答案）。
// 把粒子画进那块画布，等于让一次动画去改写一条判据；叠一层 pointer-events:none 的画布，
// 命中区与像素都还是 board.js 一个人的。
//
// 每一处位移都乘 dt（秒）：帧率从 60 掉到 30 只该让画面变糙，不该让粒子飘得更远、
// 光环多活一倍时间。定长 setTimeout 做不了这件事——它量的是墙钟，不是这帧走了多远。

import { Palette, prefersReducedMotion } from '../theme.js';

const SPRITES = {
  berry: 'assets/sprites/berry-64.png',
  leaf: 'assets/sprites/leaf-48.png',
  stripe: 'assets/sprites/stripe-256.png',
};

function load(src) {
  const img = { img: null, ok: false };
  if (typeof Image === 'undefined') return img;
  const im = new Image();
  im.onload = () => {
    img.img = im;
    img.ok = true;
  };
  im.onerror = () => {
    img.ok = false;
  };
  im.src = src;
  return img;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class FxLayer {
  constructor(canvas, view, rng = Math.random) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = view;
    this.rng = rng;
    this.parts = [];
    this.pulses = [];
    this.art = Object.fromEntries(Object.entries(SPRITES).map(([k, p]) => [k, load(p)]));
  }

  // 同一局重开该看到同一条轨迹：随机源换掉，动画就从"每次都不一样"变成"可复现"。
  setRng(fn) {
    this.rng = typeof fn === 'function' ? fn : Math.random;
  }

  // 与 #board 一模一样地铺：CSS 尺寸、device 缓冲、一次 setTransform。
  // 两边错位半格，玩家就会看到光环落在隔壁格上；cellRect 给的是盘内坐标（含 pad），
  // 画布却贴在 #board-wrap 的内沿，所以外层要按 geo.x/geo.y 偏移出去。
  resize() {
    const g = this.view.geo;
    const c = this.canvas;
    if (!g.w || !g.h) return;
    c.style.width = `${g.w}px`;
    c.style.height = `${g.h}px`;
    c.style.left = `${g.x}px`;
    c.style.top = `${g.y}px`;
    const pw = Math.round(g.w * g.dpr);
    const ph = Math.round(g.h * g.dpr);
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    this.ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  }

  rnd(a, b) {
    return a + this.rng() * (b - a);
  }

  spawn(i, kind, n) {
    if (!this.view.game || i == null || i < 0) return;
    const r = this.view.cellRect(i);
    const cx = r.x + r.size / 2;
    const cy = r.y + r.size / 2;
    if (kind === 'pulse') {
      // 提示格：光环从格外沿收进来。life 用秒计，所以 1.6 就是 1.6 秒，
      // 与"这一帧过了多久"无关。
      this.pulses = [{ x: cx, y: cy, s: r.size, life: 0, ttl: 1.6 }];
      return;
    }
    const count = prefersReducedMotion() ? 0 : n;
    for (let k = 0; k < count; k++) {
      const a = this.rnd(0, Math.PI * 2);
      const sp = kind === 'win' ? this.rnd(60, 210) : this.rnd(24, 78);
      this.parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'win' ? 40 : 12),
        rot: this.rnd(0, Math.PI * 2),
        spin: this.rnd(-3.2, 3.2),
        size: r.size * (kind === 'win' ? this.rnd(0.16, 0.3) : this.rnd(0.1, 0.18)),
        kind: kind === 'win' ? (k % 3 === 2 ? 'leaf' : 'berry') : 'berry',
        life: 0,
        ttl: kind === 'win' ? this.rnd(0.9, 1.5) : this.rnd(0.32, 0.5),
      });
    }
  }

  hint(i) {
    this.spawn(i, 'pulse');
  }

  place(i) {
    this.spawn(i, 'place', 3);
  }

  win(game) {
    const white = game.white || [];
    if (!white.length) return;
    const shots = Math.min(6, white.length);
    for (let k = 0; k < shots; k++) {
      const at = clamp(Math.round((k * white.length) / shots), 0, white.length - 1);
      this.spawn(white[at], 'win', 7);
    }
  }

  reset() {
    // 重开/换局/回菜单都要清干净：留着上一局的粒子，屏幕就在演一局已经结束的棋。
    this.parts.length = 0;
    this.pulses.length = 0;
  }

  alive() {
    return this.parts.length > 0 || this.pulses.length > 0;
  }

  count() {
    return { parts: this.parts.length, pulses: this.pulses.length };
  }

  // 对拍读的是这一份：全是仿真量出来的标量，不是像素。三档帧率比的是"同样长的时间里
  // 物理走到哪了"，像素那条路会被抗锯齿与 DPR 搅浑。
  readout() {
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let sv = 0;
    for (const p of this.parts) {
      sx += p.x;
      sy += p.y;
      sl += p.life;
      sv += Math.abs(p.vx) + Math.abs(p.vy);
    }
    const n = this.parts.length || 1;
    const u = this.pulses[0];
    return {
      parts: this.parts.length,
      sumLife: +sl.toFixed(6),
      cx: +(sx / n).toFixed(6),
      cy: +(sy / n).toFixed(6),
      sumSpeed: +(sv / n).toFixed(6),
      pulseT: u ? +(u.life / u.ttl).toFixed(6) : 0,
    };
  }

  // dt 是秒。重力、阻尼、寿命全乘它，没有一处依赖"每秒 60 帧"这个假设。
  step(dt) {
    const g = 520;
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life += dt;
      if (p.life >= p.ttl) {
        this.parts.splice(k, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += g * dt;
      p.vx *= Math.pow(0.86, dt * 60);
      p.rot += p.spin * dt;
    }
    for (let k = this.pulses.length - 1; k >= 0; k--) {
      const u = this.pulses[k];
      u.life += dt;
      if (u.life >= u.ttl) this.pulses.splice(k, 1);
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const u of this.pulses) {
      const t = u.life / u.ttl;
      const r = u.s * (0.78 - 0.3 * t);
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.strokeStyle = Palette.hint;
      ctx.lineWidth = Math.max(1.5, u.s * 0.05);
      ctx.beginPath();
      ctx.arc(u.x, u.y, r, 0, Math.PI * 2);
      ctx.stroke();
      const st = this.art.stripe;
      if (st.ok) {
        // 读数条沿光环转一圈：转过的角度只由 life 决定，不由帧数决定。
        const a = t * Math.PI * 2;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.translate(u.x, u.y);
        ctx.rotate(a);
        ctx.drawImage(st.img, -r, -u.s * 0.05, r * 2, u.s * 0.1);
      }
      ctx.restore();
    }
    for (const p of this.parts) {
      const t = p.life / p.ttl;
      const sp = this.art[p.kind];
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      if (sp.ok) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(sp.img, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        // 精灵没到位（file:// 被挡、图没加载完）也要看得见反馈：退化成同色的圆点。
        ctx.fillStyle = p.kind === 'leaf' ? Palette.success : Palette.accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

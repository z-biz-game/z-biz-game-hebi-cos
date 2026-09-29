// Canvas renderer. It reads the Game's engine state and paints; it decides nothing — no clue is
// "satisfied" here, no digit is judged wrong here — so the picture cannot disagree with the clause
// table that the win check and the hints both use.
//
// Layout lives here too (cell size from the container, board origin, DPR) because hitCell has to
// answer with the *same* numbers draw() used. Those two drifting apart is how a board renders
// correctly but takes clicks one cell off.

import { Palette, Cell, Radius, Font, GLYPH } from '../theme.js';
import { UND, BLANK } from '../ui/game.js';

export function layoutFor(R, C, availW, availH) {
  const pad = 10; // 箭头与数字都印在黑格里面，格外不需要留位置
  const size = Math.max(0, Math.min((availW - pad * 2) / C, (availH - pad * 2) / R));
  const cell = Math.max(Cell.min, Math.min(Cell.max, Math.floor(size)));
  return { cell, boardW: cell * C, boardH: cell * R, pad };
}

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = { cell: 0, x: 0, y: 0, w: 0, h: 0, dpr: 1 };
  }

  // The backing buffer is sized in device pixels while every draw call stays in CSS pixels: one
  // ctx.scale at the top keeps the digits crisp on a Retina display without doubling every
  // constant in this file.
  resize(game, availW, availH) {
    const l = layoutFor(game.R, game.C, availW, availH);
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const size = { w: l.boardW + l.pad * 2, h: l.boardH + l.pad * 2 };
    this.canvas.style.width = `${size.w}px`;
    this.canvas.style.height = `${size.h}px`;
    this.canvas.width = Math.round(size.w * dpr);
    this.canvas.height = Math.round(size.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.geo = { cell: l.cell, x: l.pad, y: l.pad, w: size.w, h: size.h, dpr };
    this.game = game;
    return this.geo;
  }

  cellRect(i) {
    const { cell, x, y } = this.geo;
    const B = this.game.B;
    const [r, c] = B.rc(i);
    return { x: c * cell + x, y: r * cell + y, size: cell };
  }

  hitCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const { cell, x, y } = this.geo;
    const game = this.game;
    if (!cell || !game) return -1;
    const px = clientX - rect.left - x;
    const py = clientY - rect.top - y;
    if (px < 0 || py < 0) return -1;
    const c = Math.floor(px / cell);
    const r = Math.floor(py / cell);
    if (r < 0 || c < 0 || c >= game.C || r >= game.R) return -1;
    return game.B.id(r, c);
  }

  // 一条蛇的颜色由"这条蛇的头在哪一格"决定，不是由答案决定：玩家把两段接起来，
  // 屏幕上就立刻读成一条；接错了也不会泄露正确的排法。分组顺序稳定（按头格号排），
  // 所以同一个盘在同一台机器上每帧同色。
  colorMap(groupOf) {
    const ids = [...new Set([...groupOf.values()])].sort((a, b) => a - b);
    const m = new Map();
    ids.forEach((g, k) => m.set(g, Palette.snake[k % Palette.snake.length]));
    return m;
  }

  draw(game, { pulse = null } = {}) {
    this.game = game;
    const { ctx, geo } = this;
    const { cell } = geo;
    const B = game.B;
    const st = game.st;
    const black = game.black;
    const won = game.status === 'won';
    ctx.clearRect(0, 0, geo.w, geo.h);

    roundRect(ctx, 0, 0, geo.w, geo.h, Radius.card);
    ctx.fillStyle = Palette.surface;
    ctx.fill();

    // 底层：黑格 / 未定白格 / 已定白格（留空或数字）。三种底色是三个可采样的读数，
    // "钉成留空"和"还没想"必须在像素上分得开，否则玩家按了空却看不出来。
    for (let i = 0; i < B.N; i++) {
      const r = this.cellRect(i);
      ctx.fillStyle = black.has(i) ? Palette.black : st[i] === UND ? Palette.bgBottom : Palette.surfaceLift;
      ctx.fillRect(r.x, r.y, cell, cell);
    }

    // 蛇身同色：只给写了数字的格上色，色相来自玩家自己的分组。
    const groupOf = game.sn.group;
    const colors = this.colorMap(groupOf);
    for (const [i, g] of groupOf) {
      if (st[i] < 1 || g < 0) continue;
      const r = this.cellRect(i);
      const col = colors.get(g);
      ctx.fillStyle = withAlpha(col, won ? 0.3 : 0.18);
      ctx.fillRect(r.x, r.y, cell, cell);
      ctx.strokeStyle = won ? Palette.success : col;
      ctx.lineWidth = Math.max(1.5, cell * 0.035);
      ctx.strokeRect(r.x + ctx.lineWidth / 2, r.y + ctx.lineWidth / 2, cell - ctx.lineWidth, cell - ctx.lineWidth);
    }

    // Grid.
    ctx.strokeStyle = Palette.line;
    ctx.lineWidth = 1;
    for (let c = 0; c <= game.C; c++) line(ctx, geo.x + c * cell, geo.y, geo.x + c * cell, geo.y + game.R * cell);
    for (let r = 0; r <= game.R; r++) line(ctx, geo.x, geo.y + r * cell, geo.x + game.C * cell, geo.y + r * cell);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 黑格：箭头在上、印的数字在下；纯黑格什么都不画（题面允许没有箭头）。
    for (const [i, b] of black) {
      const r = this.cellRect(i);
      if (b.arrow === null) continue;
      const bad = game.bad.has(i);
      ctx.fillStyle = bad ? Palette.error : Palette.ink;
      ctx.font = `700 ${Math.round(cell * Cell.arrowScale)}px ${Font.sans}`;
      ctx.fillText(GLYPH[b.arrow] || '?', r.x + cell / 2, r.y + cell * 0.3);
      ctx.font = `700 ${Math.round(cell * Cell.numScale)}px ${Font.mono}`;
      ctx.fillStyle = bad ? Palette.error : Palette.warn;
      ctx.fillText(String(b.num), r.x + cell / 2, r.y + cell * 0.71);
    }

    // 白格：数字或留空标记。留空是一个点——它必须画得出，不然"钉成留空"和"没写"就分不开。
    for (const i of game.white) {
      const v = st[i];
      const r = this.cellRect(i);
      if (v === BLANK) {
        ctx.beginPath();
        ctx.arc(r.x + cell / 2, r.y + cell / 2, Math.max(2, cell * 0.08), 0, Math.PI * 2);
        ctx.fillStyle = Palette.pencilStrong;
        ctx.fill();
      } else if (v >= 1) {
        const bad = game.bad.has(i);
        ctx.fillStyle = bad ? Palette.error : won ? Palette.success : colors.get(groupOf.get(i)) || Palette.ink;
        ctx.font = `700 ${Math.round(cell * 0.56)}px ${Font.mono}`;
        ctx.fillText(String(v), r.x + cell / 2, r.y + cell / 2 + 1);
      }
    }

    // 选中的格：虚线框，写数字的落点始终看得见。
    if (game.cursor >= 0 && !game.black.has(game.cursor)) {
      const r = this.cellRect(game.cursor);
      ctx.strokeStyle = Palette.accent;
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.setLineDash([Math.max(4, cell * 0.2), Math.max(3, cell * 0.14)]);
      ctx.strokeRect(r.x + ctx.lineWidth, r.y + ctx.lineWidth, cell - ctx.lineWidth * 2, cell - ctx.lineWidth * 2);
      ctx.setLineDash([]);
    }

    // What a hint just named — the only place the UI is allowed to say "look here".
    if (pulse && pulse.cell != null && !game.black.has(pulse.cell)) {
      const r = this.cellRect(pulse.cell);
      ctx.strokeStyle = pulse.color || Palette.hint;
      ctx.lineWidth = Math.max(2.5, cell * 0.09);
      roundRect(ctx, r.x + 2, r.y + 2, cell - 4, cell - 4, Radius.cell);
      ctx.stroke();
    }
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// #RRGGBB -> rgba(): the tint is the same token as the outline, only transparent, so a snake
// cannot read as one colour in the fill and another in the border.
function withAlpha(hex, a) {
  const m = String(hex).replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

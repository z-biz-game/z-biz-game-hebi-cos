// Single source of truth for colour, spacing and motion. The stylesheet reads these as
// custom properties (applyThemeVars) and the canvas reads the same objects, so a token
// change cannot land on one side only — which is how "one line colour" turns into forty.

export const Palette = {
  bgTop: '#0A0D14',
  bgBottom: '#141A26',
  surface: '#111722',
  surfaceLift: '#1A2231',
  line: '#26303F',
  lineHeavy: '#425168',
  ink: '#F3F6FB',
  inkDim: 'rgba(243,246,251,0.62)',
  inkFaint: 'rgba(243,246,251,0.30)',

  // Vermilion is the berry of 蛇莓 and the player's own hand: the selected cell, the cell a
  // hint just named and the win banner all borrow it, so "this is what you are doing" is one idea.
  accent: '#FF7043',
  accentEdge: '#FFB08F',
  accentSoft: 'rgba(255,112,67,0.16)',

  info: '#7BB8FF',
  pencilStrong: '#8FA6CC',
  pencil: 'rgba(243,246,251,0.28)',

  success: '#59D49C',
  error: '#FF5C7A',
  warn: '#FFC85C',
  focus: 'rgba(255,112,67,0.16)',
  hint: '#FFC85C',
  // 黑格就是题面给的东西：它比纸更深，字是印上去的而不是写上去的。
  black: '#05070C',
  blackEdge: '#3A4658',
  // A snake's tint is the player's grouping read back to them, never the answer: two cells
  // wearing the same tint means "you have made these one snake", nothing more.
  snake: ['#59D49C', '#7BB8FF', '#C792EA', '#FFC85C', '#4DD0E1', '#F06292', '#AEEA00', '#FFB74D'],
  snakeFill: 'rgba(123,184,255,0.14)',
};

export const Space = { page: 20, card: 16, inner: 12, gutter: 10 };
export const Radius = { card: 18, button: 12, chip: 8, cell: 4 };

export const Font = {
  title: "700 24px/1.25 -apple-system, 'SF Pro Display', system-ui, sans-serif",
  mono: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', system-ui, sans-serif",
};

// Durations obey the 150–350 ms discipline; anything longer blocks the next move.
export const Motion = {
  tap: 150,
  base: 220,
  pop: 260,
  line: 300,
  win: 900,
  spring: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
};

export const Cell = { min: 26, max: 62, numScale: 0.34, arrowScale: 0.3 };

// Arrow glyph per clue direction. One table for the canvas and for the DOM, so a hint sentence
// and the picture cannot spell the same clue two different ways.
export const GLYPH = { U: '↑', D: '↓', L: '←', R: '→' };

export function applyThemeVars() {
  const root = document.documentElement.style;
  const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  for (const [k, v] of Object.entries(Palette)) {
    // Arrays get their own loop below, one property per entry.
    if (Array.isArray(v)) continue;
    root.setProperty('--' + kebab(k), v);
  }
  Palette.snake.forEach((c, i) => root.setProperty('--snake-' + i, c));
  for (const [k, v] of Object.entries(Space)) root.setProperty('--space-' + k, v + 'px');
  for (const [k, v] of Object.entries(Radius)) root.setProperty('--radius-' + k, v + 'px');
  for (const [k, v] of Object.entries(Motion)) {
    if (typeof v === 'number') root.setProperty('--dur-' + kebab(k), v + 'ms');
    else root.setProperty('--ease-' + kebab(k), v);
  }
  root.setProperty('--font-mono', Font.mono);
  root.setProperty('--font-sans', Font.sans);
}

// The system preference is the floor, and the in-game toggle can only add to it — a
// player who asks for less motion should not be overruled by an OS set to "no preference".
let motionReduced = false;

export function setReduceMotion(v) {
  motionReduced = !!v;
}

export const systemPrefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const prefersReducedMotion = () => motionReduced || systemPrefersReducedMotion();

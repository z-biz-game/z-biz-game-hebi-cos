#!/usr/bin/env python3
"""蛇莓的位图资产工厂：一条命令重出全套图标 / 社交卡 / 纹理 / 精灵。

为什么仓里要带生成脚本而不是收一张别人给的图：这些位图是**玩法的读数**，不是装饰。
母题全部来自规则本身，规则一改图就得能重出，所以画法必须可复跑、可 diff、零凭据。
零第三方依赖——只用 python3 标准库（struct/zlib/math），PNG 自己编码，光栅自己画，
字标由脚本自带的 5×7 点阵现画，不借任何系统字体。因此在任何一台机器上重跑都得到
同样的字节（这才是"可复现"的意思：换台机器没有 PingFang 也不会出一张缺字的卡）。

视觉母题（颜色与 js/theme.js 同源，不是另编的一套）：
  * 底：题面纸色渐变 #0A0D14 → #141A26 → #111722，5×5 的浅格线就是盘面。
  * 蛇：一条 1→5 的阶梯折线（翡翠 #59D49C）——"同一条蛇 1→5 一格一格挨着走"这条
    规则本身就是图标；头格画一双背对身体的眼，笔画用圆接头连成一条。
  * 莓：蛇尾那一格顶着一颗朱红蛇莓 #FF7043（仓名"蛇莓"的那个莓），带籽点与三片叶。
  * 线索：黑格里印的箭头与读数（琥珀 #FFC85C），这是题面的签名。
小尺寸（≤48）另出一张"紧缩母图"：去掉格线与读数，只留折线＋一颗莓——16px 上那些
细节只会糊成一坨噪声，favicon 认不认得出看的正是 16px 那一档。
每一档都按整数倍超采样现画再方窗降采样（不是从 1024 一路缩到 16），所以 16px 上
那条折线仍然是那条折线。

用法：python3 assets/gen/gen_art.py            # 重出全部 14 张
      python3 assets/gen/gen_art.py --check    # 只量盘上已有的 IHDR，不复出
"""
import os
import sys
import math
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# ---- 与 js/theme.js 同源的颜色（改一边就要改另一边） ----
BG_TOP = (0x0A, 0x0D, 0x14)
BG_BOTTOM = (0x14, 0x1A, 0x26)
SURFACE = (0x11, 0x17, 0x22)
SURFACE_LIFT = (0x1A, 0x22, 0x31)
LINE = (0x26, 0x30, 0x3F)
LINE_HEAVY = (0x42, 0x51, 0x68)
INK = (0xF3, 0xF6, 0xFB)
BLACK_CELL = (0x05, 0x07, 0x0C)
PENCIL = (0x8F, 0xA6, 0xCC)
ACCENT = (0xFF, 0x70, 0x43)  # 朱红：蛇莓
ACCENT_EDGE = (0xFF, 0xB0, 0x8F)
ACCENT_DEEP = (0xC9, 0x3D, 0x18)
JADE = (0x59, 0xD4, 0x9C)  # 蛇身
JADE_LIGHT = (0x9B, 0xF0, 0xC4)
JADE_DEEP = (0x2A, 0x8C, 0x5F)
JADE_CELL = (0x12, 0x2A, 0x22)
AMBER = (0xFF, 0xC8, 0x5C)  # 黑格读数
SEED = (0x3A, 0x12, 0x06)

# 5×7 点阵：字标与盘上的 1–5 都用它，脚本自带因此不靠系统字体。
FONT = {
  '0': ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
  '1': ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
  '2': ("01110", "10001", "00001", "00110", "01000", "10000", "11111"),
  '3': ("11110", "00001", "00010", "00110", "00001", "10001", "01110"),
  '4': ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
  '5': ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
  '6': ("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
  '7': ("11111", "00001", "00010", "01000", "01000", "01000", "01000"),
  '8': ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
  '9': ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
  'A': ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
  'B': ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
  'C': ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
  'D': ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
  'E': ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
  'F': ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
  'G': ("01110", "10001", "10000", "10111", "10001", "10001", "01111"),
  'H': ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
  'I': ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
  'J': ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
  'K': ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
  'L': ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
  'M': ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
  'N': ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
  'O': ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
  'P': ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
  'Q': ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
  'R': ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
  'S': ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
  'T': ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
  'U': ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
  'V': ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
  'W': ("10001", "10001", "10001", "10101", "10101", "11011", "00100"),
  'X': ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
  'Y': ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
  'Z': ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
  '-': ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
  '.': ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
  ':': ("00000", "01100", "01100", "00000", "01100", "01100", "00000"),
  '/': ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
  ' ': ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
}
GLYPH_W, GLYPH_H = 5, 7
ARROWS = {'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0)}


def chunk(kind, data):
    return (struct.pack('>I', len(data)) + kind + data
            + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF))


class Sheet:
    """RGBA 位图：自带光栅与 PNG 编码（stdlib only）。

    每条横线一次切片赋值，不是逐像素调用——1024 档的 4× 超采样有 400 多万像素，
    逐像素解释执行要跑几分钟，那就没有人愿意重跑这个脚本了。
    """

    def __init__(self, w, h, ss=1):
        self.w, self.h, self.ss = w, h, ss
        self.pw, self.ph = w * ss, h * ss
        self.buf = bytearray(self.pw * self.ph * 4)

    def clamp(self, x0, x1):
        return max(0, int(min(x0, x1))), min(self.pw - 1, int(max(x0, x1)))

    def hspan(self, x0, x1, y, rgba, y0=None):
        """一行（或一块连续行）的不透明色带：整片一次写入。"""
        xa, xb = self.clamp(x0, x1)
        if xb < xa:
            return
        ya = int(min(y, y0 if y0 is not None else y))
        yb = int(max(y, y0 if y0 is not None else y))
        if yb < 0 or ya >= self.ph:
            return
        ya, yb = max(0, ya), min(self.ph - 1, yb)
        if rgba[3] == 255:
            px = bytes(rgba)
            row = px * (xb - xa + 1)
            for yy in range(ya, yb + 1):
                i = (yy * self.pw + xa) * 4
                self.buf[i:i + len(row)] = row
        else:
            for yy in range(ya, yb + 1):
                for xx in range(xa, xb + 1):
                    self.blend(xx, yy, rgba)

    def blend(self, x, y, rgba):
        if x < 0 or y < 0 or x >= self.pw or y >= self.ph:
            return
        i = (y * self.pw + x) * 4
        a1 = rgba[3] / 255.0
        a0 = self.buf[i + 3] / 255.0
        a2 = a1 + a0 * (1 - a1)
        if a2 <= 0:
            return
        for c in range(3):
            v = (rgba[c] * a1 + self.buf[i + c] * a0 * (1 - a1)) / a2
            self.buf[i + c] = 0 if v < 0 else (255 if v > 255 else int(round(v)))
        self.buf[i + 3] = int(round(a2 * 255))

    def fill(self, rgba):
        self.buf[:] = bytes(rgba) * (self.pw * self.ph)

    def rect(self, x0, y0, x1, y1, rgba):
        xa, xb = self.clamp(x0, x1)
        ya, yb = max(0, int(min(y0, y1))), min(self.ph - 1, int(max(y0, y1)))
        if xb < xa or yb < ya:
            return
        if rgba[3] == 255:
            row = bytes(rgba) * (xb - xa + 1)
            for yy in range(ya, yb + 1):
                i = (yy * self.pw + xa) * 4
                self.buf[i:i + len(row)] = row
        else:
            for yy in range(ya, yb + 1):
                for xx in range(xa, xb + 1):
                    self.blend(xx, yy, rgba)

    def disc(self, cx, cy, r, rgba):
        if r <= 0:
            return
        if rgba[3] == 255:
            for yy in range(int(max(0, cy - r)), int(min(self.ph - 1, cy + r)) + 1):
                dy = yy - cy
                d = r * r - dy * dy
                if d < 0:
                    continue
                dx = math.sqrt(d)
                self.hspan(cx - dx, cx + dx, yy, rgba)
        else:
            rr = r * r
            for yy in range(int(max(0, cy - r)), int(min(self.ph - 1, cy + r)) + 1):
                dy = yy - cy
                d = rr - dy * dy
                if d < 0:
                    continue
                dx = math.sqrt(d)
                xa, xb = self.clamp(cx - dx, cx + dx)
                for xx in range(xa, xb + 1):
                    self.blend(xx, yy, rgba)

    def frame(self, x, y, w, h, t, rgba):
        self.rect(x, y, x + w - 1, y + t - 1, rgba)
        self.rect(x, y + h - t, x + w - 1, y + h - 1, rgba)
        self.rect(x, y, x + t - 1, y + h - 1, rgba)
        self.rect(x + w - t, y, x + w - 1, y + h - 1, rgba)

    def thick_line(self, pts, width, rgba):
        """圆接头折线：沿笔画密集铺圆盘，所以阶梯在拐角不会断开。"""
        half = width / 2.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            dx, dy = bx - ax, by - ay
            seg = math.hypot(dx, dy)
            n = max(1, int(seg / max(1.0, half * 0.6)))
            for t in range(n + 1):
                f = t / n
                self.disc(ax + dx * f, ay + dy * f, half, rgba)

    def vgrad(self, stops):
        """竖向渐变：每行一次整行写入。stops = [(位置, rgb), ...]"""
        h = self.ph
        for y in range(h):
            f = y / max(1, h - 1)
            for k in range(len(stops) - 1):
                p0, c0 = stops[k]
                p1, c1 = stops[k + 1]
                if f <= p1 or k == len(stops) - 2:
                    u = 0.0 if p1 == p0 else max(0.0, min(1.0, (f - p0) / (p1 - p0)))
                    col = bytes([int(round(c0[c] + (c1[c] - c0[c]) * u)) for c in range(3)]) + b'\xff'
                    break
            i = y * self.pw * 4
            self.buf[i:i + len(col) * self.pw] = col * self.pw

    def rounded_alpha(self, radius):
        r = int(radius)
        w, h = self.pw, self.ph
        for y in range(h):
            dy = max(r - y, y - (h - 1 - r), 0)
            if dy == 0:
                continue
            inset = r - int(round(math.sqrt(max(0.0, r * r - dy * dy))))
            if inset <= 0:
                continue
            for x in list(range(0, inset)) + list(range(w - inset, w)):
                self.buf[(y * w + x) * 4 + 3] = 0

    def opaque(self):
        self.buf[3::4] = b'\xff' * (self.pw * self.ph)

    def downsample(self, tw, th):
        """整数倍方窗降采样；颜色按 alpha 加权，透明像素不把相邻颜色拽向黑。"""
        if (tw, th) == (self.w, self.h) and self.ss == 1:
            return self
        assert self.ss * self.w % tw == 0 and self.ss * self.h % th == 0, \
            f'降采样必须是整数倍：源 {self.w}x{self.h}@{self.ss} 目标 {tw}x{th}'
        kx = self.ss * self.w // tw
        ky = self.ss * self.h // th
        out = bytearray(tw * th * 4)
        src = self.buf
        pw = self.pw
        for ty in range(th):
            y0 = ty * ky
            for tx in range(tw):
                x0 = tx * kx
                r = g = b = a = 0
                for yy in range(y0, y0 + ky):
                    i = (yy * pw + x0) * 4
                    for xx in range(kx):
                        al = src[i + 3]
                        r += src[i] * al
                        g += src[i + 1] * al
                        b += src[i + 2] * al
                        a += al
                        i += 4
                n = kx * ky
                if a:
                    o = (ty * tw + tx) * 4
                    out[o] = r // a
                    out[o + 1] = g // a
                    out[o + 2] = b // a
                    out[o + 3] = a // n
        s = Sheet(tw, th, 1)
        s.buf = out
        return s

    def write_png(self, path):
        raw = bytearray()
        stride = self.pw * 4
        for y in range(self.ph):
            raw.append(0)
            raw += self.buf[y * stride:(y + 1) * stride]
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', struct.pack('>IIBBBBB', self.pw, self.ph, 8, 6, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        png += chunk(b'IEND', b'')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as fh:
            fh.write(png)
        return path


# ---------------------------------------------------------------- 字标

def put_text(s, x, y, text, px, rgba, tracking=1):
    cx = int(x)
    y = int(y)
    for ch in str(text).upper():
        g = FONT.get(ch)
        if not g:
            cx += 6 * px
            continue
        for ry, row in enumerate(g):
            for rx, bit in enumerate(row):
                if bit == '1':
                    s.rect(cx + rx * px, y + ry * px, cx + rx * px + px - 1,
                           y + ry * px + px - 1, rgba)
        cx += (GLYPH_W + tracking) * px
    return cx


def text_width(text, px, tracking=1):
    return max(0, len(str(text))) * (GLYPH_W + tracking) * px - tracking * px


# ---------------------------------------------------------------- 母题

# 1→5 的阶梯：同一条蛇一格一格挨着走（行, 列）
SNAKE_PATH = [(0, 1), (1, 1), (1, 2), (2, 2), (2, 3)]
# 黑格：题面印的箭头与读数（None 就是没有箭头的纯黑格）
BLACKS = [(0, 3, 'R', 0), (4, 0, 'U', 2), (4, 4, None, None)]


def berry(s, cx, cy, r):
    """果身 + 高光 + 籽点 + 三片叶与一截柄：仓名的"莓"全在这一颗上。"""
    s.disc(cx, cy, r, ACCENT_DEEP + (255,))
    s.disc(cx, cy - r * 0.10, r * 0.86, ACCENT + (255,))
    s.disc(cx - r * 0.32, cy - r * 0.34, r * 0.26, ACCENT_EDGE + (255,))
    seed = max(1.0, r * 0.09)
    for a in range(6):
        th = a / 6 * 2 * math.pi + 0.5
        s.disc(cx + math.cos(th) * r * 0.55, cy + math.sin(th) * r * 0.50, seed, SEED + (255,))
    for ox, oy, sc in ((-0.55, -0.85, 0.9), (0.0, -1.0, 1.1), (0.55, -0.85, 0.9)):
        s.disc(cx + ox * r, cy + oy * r, r * 0.20 * sc, JADE_DEEP + (255,))
    s.rect(cx - r * 0.07, cy - r * 1.18, cx + r * 0.07, cy - r * 0.80, JADE_DEEP + (255,))


def arrow(s, cx, cy, r, kind, rgba):
    dx, dy = ARROWS[kind]
    L = r * 0.70
    ex, ey = cx + dx * L, cy + dy * L
    px_, py_ = -dy, dx
    s.thick_line([(cx - dx * L * 0.30, cy - dy * L * 0.30), (ex, ey)], max(1.0, r * 0.20), rgba)
    head = r * 0.36
    for t in (-1, 1):
        s.thick_line([(ex, ey), (ex - dx * head + px_ * head * t * 0.75,
                                   ey - dy * head + py_ * head * t * 0.75)],
                     max(1.0, r * 0.17), rgba)


def draw_sheet(s, ox, oy, cell, R, C, digits=True, lattice=True, berry_tail=True,
               path=SNAKE_PATH, blacks=BLACKS):
    """一张题面：纸格、格线、黑格箭头与读数、蛇的阶梯折线、尾上那颗莓。"""
    W, H = cell * C, cell * R
    s.rect(ox, oy, ox + W - 1, oy + H - 1, LINE + (255,))
    for r in range(R):
        for c in range(C):
            x, y = ox + c * cell, oy + r * cell
            s.rect(x, y, x + cell - 1, y + cell - 1, BG_BOTTOM + (255,))
    onpath = {rc: k + 1 for k, rc in enumerate(path)}
    if lattice:
        # 格线的笔画跟着 cell 走：1px 的底在 8× 超采样下降完就没了，题面会失掉"盘"这个读法。
        t = max(1, int(round(cell / 34)))
        for c in range(C + 1):
            x = ox + c * cell - t // 2
            s.rect(x, oy, x + t - 1, oy + H - 1, LINE + (255,))
        for r in range(R + 1):
            y = oy + r * cell - t // 2
            s.rect(ox, y, ox + W - 1, y + t - 1, LINE + (255,))
    for (r, c), v in onpath.items():
        x, y = ox + c * cell, oy + r * cell
        s.rect(x + cell * 0.05, y + cell * 0.05, x + cell * 0.95, y + cell * 0.95, JADE_CELL + (255,))
    pts = [(ox + (c + 0.5) * cell, oy + (r + 0.5) * cell) for (r, c) in path]
    s.thick_line(pts, cell * 0.30, JADE + (255,))
    s.thick_line(pts, cell * 0.15, JADE_LIGHT + (255,))
    if digits:
        dp = max(1, int(cell * 0.075))
        last = path[-1]
        for (r, c), v in onpath.items():
            if (r, c) == last and berry_tail:
                continue  # 尾格让给那颗莓：它读起来就是"5"
            x, y = ox + c * cell, oy + r * cell
            pad = cell * 0.20
            s.rect(x + pad, y + pad, x + cell - pad - 1, y + cell - pad - 1,
                   (0x06, 0x1A, 0x14, 255))
            put_text(s, x + cell / 2 - text_width(str(v), dp) / 2,
                     y + cell / 2 - GLYPH_H * dp / 2, v, dp, JADE_LIGHT + (255,))
    for (r, c, ar, num) in blacks:
        x, y = ox + c * cell, oy + r * cell
        s.rect(x, y, x + cell - 1, y + cell - 1, BLACK_CELL + (255,))
        s.frame(x, y, cell, cell, max(1, cell // 60), LINE_HEAVY + (255,))
        if ar:
            arrow(s, x + cell / 2, y + cell * 0.30, cell * 0.27, ar, AMBER + (255,))
            np_ = max(1, int(cell * 0.062))
            put_text(s, x + cell / 2 - text_width(str(num), np_) / 2,
                     y + cell * 0.70 - GLYPH_H * np_ / 2, num, np_, AMBER + (255,))
    # 蛇头：一双背对身体的眼——"蛇眼在头上、背对着身体"这条规则的图形签名。
    # 画在数字之后，否则会被 1 号底板整个盖住。
    hx, hy = pts[0]
    nx, ny = pts[1][0] - hx, pts[1][1] - hy
    nn = math.hypot(nx, ny) or 1.0
    ux, uy = nx / nn, ny / nn
    for side in (-1, 1):
        s.disc(hx - ux * cell * 0.34 + (-uy) * cell * 0.15 * side,
               hy - uy * cell * 0.34 + ux * cell * 0.15 * side,
               max(1.0, cell * 0.055), INK + (255,))
    if berry_tail:
        tx, ty = pts[-1]
        berry(s, tx, ty, cell * 0.31)


def icon(size, ss, digits=None, lattice=None, corner=True, pad=0.115, compact=False):
    s = Sheet(size, size, ss)
    s.fill((0, 0, 0, 0))
    s.vgrad([(0.0, BG_TOP), (0.58, BG_BOTTOM), (1.0, SURFACE)])
    if corner:
        s.rounded_alpha(size * ss * 0.225)
    if compact:
        # 紧缩母图：三格折线 + 一颗莓。格线与读数在这一档只会糊成噪声。
        pts = [(size * 0.30, size * 0.30), (size * 0.56, size * 0.30),
               (size * 0.56, size * 0.56), (size * 0.78, size * 0.56)]
        pts = [(x * ss, y * ss) for (x, y) in pts]
        s.thick_line(pts, size * ss * 0.13, JADE + (255,))
        s.thick_line(pts, size * ss * 0.06, JADE_LIGHT + (255,))
        berry(s, pts[-1][0], pts[-1][1], size * ss * 0.17)
        s.disc(pts[0][0], pts[0][1], size * ss * 0.035, INK + (255,))
        return s
    R = C = 5
    cell = int(size * (1 - pad * 2)) // max(R, C)
    ox = int((size * ss - cell * C * ss) / 2)
    oy = int((size * ss - cell * R * ss) / 2)
    draw_sheet(s, ox, oy, cell * ss, R, C,
               digits=size * ss >= 900 if digits is None else digits,
               lattice=size * ss >= 500 if lattice is None else lattice)
    return s


def fit_px(text, avail_w, tracking=1):
    """按可用宽度反推字号：社交卡最忌讳的就是字画到卡外面去。"""
    return max(1, int(avail_w // ((GLYPH_W + tracking) * max(1, len(str(text))))))


def og_card(w=1200, h=630, ss=2):
    s = Sheet(w, h, ss)
    s.fill((0, 0, 0, 0))
    s.vgrad([(0.0, BG_TOP), (0.5, (0x0D, 0x12, 0x1C)), (1.0, SURFACE)])
    s.opaque()
    # 左：一张真题面。右：字标 + 四行读法。两栏之间留一条竖分隔。
    cell = int(h * 0.74) // 5 * ss
    ox = int(w * 0.045 * ss)
    oy = int((h * ss - cell * 5) / 2)
    draw_sheet(s, ox, oy, cell, 5, 5, digits=True, lattice=True)
    rx = int(w * 0.475 * ss)
    rw = int(w * 0.485 * ss)
    divider = rx - int(w * 0.022 * ss)
    s.rect(divider, oy, divider + max(1, int(h * 0.004 * ss)), oy + cell * 5 - 1,
           LINE + (255,))
    title = ['HEBI', 'ICHIGO']
    px1 = fit_px(max(title, key=len), rw)
    ty = int(h * 0.13 * ss)
    for k, t in enumerate(title):
        put_text(s, rx, ty + k * (GLYPH_H * px1 + int(px1 * 1.2)), t, px1, INK + (255,))
    subs = [('ZERO-GUESS SNAKE', ACCENT_EDGE),
            ('HEAD 1 - TAIL 5', JADE),
            ('ARROWS READ AHEAD', PENCIL),
            ('ONE SOLUTION EACH', AMBER)]
    px2 = fit_px(max((t for t, _ in subs), key=len), rw)
    y2 = ty + 2 * GLYPH_H * px1 + int(px1 * 1.2) + int(h * 0.075 * ss)
    step = GLYPH_H * px2 + int(px2 * 2.1)
    s.rect(rx, y2 - step + GLYPH_H * px2 + int(px2 * 0.6), rx + rw,
           y2 - step + GLYPH_H * px2 + int(px2 * 0.6) + max(1, px2 // 4), LINE_HEAVY + (255,))
    for k, (t, col) in enumerate(subs):
        put_text(s, rx, y2 + step * k, t, px2, col + (255,))
    return s


def paper_grain(size=256, ss=2):
    """可平铺的纸纹：逐像素确定性 LCG 噪声（无大图样因此四边无接缝），极淡。"""
    s = Sheet(size, size, ss)
    s.fill((0, 0, 0, 0))
    st = 0x5EEDC0DE
    buf = s.buf
    for idx in range(s.pw * s.ph):
        st ^= (st << 13) & 0xFFFFFFFF
        st ^= st >> 17
        st ^= (st << 5) & 0xFFFFFFFF
        st &= 0xFFFFFFFF
        v = (st >> 13) & 0xFF
        o = idx * 4
        tint = INK if v % 3 else BG_TOP
        buf[o] = tint[0]
        buf[o + 1] = tint[1]
        buf[o + 2] = tint[2]
        buf[o + 3] = 6 + (v % 14)
    t = max(1, ss // 2)
    for k in range(0, s.pw, 32 * ss):
        s.rect(k, 0, k + t, s.ph - 1, (255, 255, 255, 9))
        s.rect(0, k, s.pw - 1, k + t, (255, 255, 255, 9))
    return s


def sprite_berry(size=64, ss=4):
    s = Sheet(size, size, ss)
    s.fill((0, 0, 0, 0))
    berry(s, size * ss / 2, size * ss / 2 + size * ss * 0.05, size * ss * 0.38)
    return s


def sprite_leaf(size=48, ss=4):
    s = Sheet(size, size, ss)
    s.fill((0, 0, 0, 0))
    cx = cy = size * ss / 2
    for f in (0.0, 0.28, 0.56, 0.84, 1.0):
        s.disc(cx - size * ss * 0.24 + size * ss * 0.48 * f,
               cy + size * ss * 0.10 - size * ss * 0.24 * math.sin(f * math.pi),
               size * ss * (0.15 - 0.08 * f), JADE + (int(255 - 70 * f),))
    s.thick_line([(cx - size * ss * 0.26, cy + size * ss * 0.11),
                  (cx + size * ss * 0.28, cy - size * ss * 0.06)],
                 size * ss * 0.045, JADE_DEEP + (255,))
    return s


def sprite_stripe(size=256, h=8, ss=2):
    """胜利用的翡翠光带：两端淡出，中间实心。alpha 自己写进颜色梯度。"""
    s = Sheet(size, h, ss)
    s.fill((0, 0, 0, 0))
    for x in range(s.pw):
        f = x / max(1, s.pw - 1)
        a = int(225 * math.sin(f * math.pi) ** 0.6)
        col = tuple(int(JADE[k] + (INK[k] - JADE[k]) * 0.30 * (1 - f)) for k in range(3))
        s.rect(x, 0, x, s.ph - 1, col + (a,))
    return s


# ---------------------------------------------------------------- 出货

# (盘上路径, 生成函数, 宽, 高, 超采样)
def jobs():
    return [
        ('assets/icons/master-1024.png', lambda: icon(1024, 2), 1024, 1024),
        ('assets/icons/icon-512.png', lambda: icon(512, 4), 512, 512),
        ('assets/icons/icon-maskable-512.png', lambda: icon(512, 4, corner=False, pad=0.21), 512, 512),
        ('assets/icons/icon-192.png', lambda: icon(192, 8), 192, 192),
        ('assets/icons/apple-touch-icon.png', lambda: icon(180, 8, corner=False, pad=0.10), 180, 180),
        ('assets/icons/favicon-96.png', lambda: icon(96, 8, compact=True), 96, 96),
        ('assets/icons/favicon-48.png', lambda: icon(48, 8, compact=True), 48, 48),
        ('assets/icons/favicon-32.png', lambda: icon(32, 8, compact=True), 32, 32),
        ('assets/icons/favicon-16.png', lambda: icon(16, 8, compact=True), 16, 16),
        ('assets/og/og-hebi-ichigo.png', lambda: og_card(), 1200, 630),
        ('assets/textures/paper-grain.png', lambda: paper_grain(128, 2), 128, 128),
        ('assets/sprites/berry-64.png', lambda: sprite_berry(), 64, 64),
        ('assets/sprites/leaf-48.png', lambda: sprite_leaf(), 48, 48),
        ('assets/sprites/stripe-256.png', lambda: sprite_stripe(), 256, 8),
    ]


def read_ihdr(path):
    with open(path, 'rb') as fh:
        head = fh.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n' or head[12:16] != b'IHDR':
        raise ValueError(f'{path} 不是 PNG')
    return struct.unpack('>II', head[16:24])


def main():
    if '--check' in sys.argv:
        bad = 0
        for rel, _, tw, th in jobs():
            p = os.path.join(ROOT, rel)
            if not os.path.exists(p):
                print(f'MISSING {rel}')
                bad += 1
                continue
            w, h = read_ihdr(p)
            ok = (w, h) == (tw * 1, th * 1) and os.path.getsize(p) > 0
            bad += 0 if ok else 1
            print(f'{"ok   " if ok else "FAIL "} {rel} IHDR {w}x{h} {os.path.getsize(p)}B')
        print(f'\n{14 - bad}/14 张在盘上且 IHDR 对得上' if bad else '\n14/14 全部对得上')
        return 1 if bad else 0
    for rel, build, tw, th in jobs():
        s = build().downsample(tw, th)
        path = s.write_png(os.path.join(ROOT, rel))
        w, h = read_ihdr(path)
        assert (w, h) == (tw, th), f'{rel} 出货尺寸不对：{w}x{h} != {tw}x{th}'
        print(f'wrote {rel} {w}x{h} {os.path.getsize(path) / 1024:.1f} KiB (IHDR 复验)')
    print('\n母题：5×5 题面 + 1→5 翡翠阶梯 + 尾上朱红蛇莓 + 琥珀箭头读数 · 14 张真 PNG')
    return 0


if __name__ == '__main__':
    sys.exit(main())

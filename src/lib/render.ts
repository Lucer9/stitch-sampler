import type { Frame, Piece, Needle, Hole, Thread, Side } from './engine.ts';
import { type V, v, add, sub, mul, lerp, dist, norm, perp, dot, polar, rng, lengths } from './geom.ts';

export interface SceneOpts {
  mode: 'hoop' | 'swatch';
  /** Inner radius of the hoop, in fabric units. */
  R?: number;
  /** Swatch window in fabric units. */
  view?: { x: number; y: number; w: number; h: number };
  /** Weave pitch in fabric units. */
  pitch?: number;
}

export interface DrawOpts {
  side: Side;
  pierced?: V[];
  target?: Hole | null;
  next?: Hole | null;
  dots?: V[];
  /** Ring radius for the practice holes, in fabric units. */
  dotR?: number;
  hot?: number;
  bad?: number;
  time?: number;
  numbers?: boolean;
  /** Pattern lines traced on the front in water-soluble pen, under the stitches. */
  pen?: V[][];
}

type Tone = { base: string; dark: string; deep: string; light: string; rgb: [number, number, number] };
const tones = new Map<string, Tone>();

export function tone(hex: string): Tone {
  let t = tones.get(hex);
  if (t) return t;
  const n = parseInt(hex.slice(1), 16);
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const f = (k: number) => `rgb(${rgb.map((c) => Math.round(c * k)).join(',')})`;
  const l = `rgb(${rgb.map((c) => Math.round(c + (255 - c) * 0.42)).join(',')})`;
  t = { base: hex, dark: f(0.7), deep: f(0.5), light: l, rgb };
  tones.set(hex, t);
  return t;
}

function weave(pitchPx: number, back: boolean): HTMLCanvasElement {
  const N = 24;
  const size = Math.max(48, Math.round(pitchPx * N));
  const p = size / N;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = rng(back ? 11 : 7);
  const warp = Array.from({ length: N }, () => 0.9 + r() * 0.14);
  const weft = Array.from({ length: N }, () => 0.9 + r() * 0.14);
  const ph = Array.from({ length: N * 2 }, () => r() * 6.283);
  const base = back ? [222, 206, 178] : [238, 226, 199];
  const hole = back ? [160, 136, 102] : [178, 154, 116];
  const gap = 0.1;
  const prof = (u: number) => 0.8 + 0.2 * Math.sin((Math.PI * (u - gap)) / (1 - 2 * gap));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / p;
      const fy = y / p;
      const i = Math.floor(fx) % N;
      const j = Math.floor(fy) % N;
      const u = fx - Math.floor(fx);
      const w = fy - Math.floor(fy);
      const inV = u > gap && u < 1 - gap;
      const inH = w > gap && w < 1 - gap;
      const slV = 1 + 0.045 * Math.sin((6.283 * 3 * y) / size + ph[i]);
      const slH = 1 + 0.045 * Math.sin((6.283 * 3 * x) / size + ph[N + j]);
      let sh: number;
      if (((i + j) & 1) === 0) {
        if (inV) sh = prof(u) * warp[i] * slV * (0.86 + 0.14 * Math.sin(Math.PI * w));
        else if (inH) sh = prof(w) * weft[j] * slH * 0.86;
        else sh = 0.66;
      } else {
        if (inH) sh = prof(w) * weft[j] * slH * (0.86 + 0.14 * Math.sin(Math.PI * u));
        else if (inV) sh = prof(u) * warp[i] * slV * 0.86;
        else sh = 0.66;
      }
      sh *= 0.975 + r() * 0.05;
      const k = (y * size + x) * 4;
      const c = sh < 0.7 ? hole : base;
      const f = sh < 0.7 ? sh / 0.66 : sh;
      img.data[k] = Math.min(255, c[0] * f);
      img.data[k + 1] = Math.min(255, c[1] * f);
      img.data[k + 2] = Math.min(255, c[2] * f);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Scene {
  readonly el: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly o: Required<Pick<SceneOpts, 'mode' | 'R' | 'pitch'>> & SceneOpts;
  W = 0;
  H = 0;
  s = 1;
  cx = 0;
  cy = 0;
  private layers = new Map<string, HTMLCanvasElement>();

  constructor(el: HTMLCanvasElement, o: SceneOpts) {
    this.el = el;
    this.g = el.getContext('2d')!;
    this.o = { R: 50, pitch: 1.1, ...o };
    this.resize();
  }

  resize(): boolean {
    const r = this.el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (W === this.W && H === this.H) return false;
    this.W = this.el.width = W;
    this.H = this.el.height = H;
    if (this.o.mode === 'hoop') {
      this.s = Math.min(W, H) / (this.o.R * 2.6);
      this.cx = W / 2;
      this.cy = H / 2 - this.o.R * 0.04 * this.s;
    } else {
      const vw = this.o.view!;
      this.s = Math.max(W / vw.w, H / vw.h);
      this.cx = W / 2 - (vw.x + vw.w / 2) * this.s;
      this.cy = H / 2 - (vw.y + vw.h / 2) * this.s;
    }
    this.layers.clear();
    return true;
  }

  /** Device-pixel position of a fabric point as seen from `side`. */
  screen(p: V, side: Side): V {
    return v(this.cx + (side === 'back' ? -p.x : p.x) * this.s, this.cy + p.y * this.s);
  }

  /** Fabric point under a device-pixel position. */
  fabric(px: V, side: Side): V {
    const x = (px.x - this.cx) / this.s;
    return v(side === 'back' ? -x : x, (px.y - this.cy) / this.s);
  }

  private layer(key: string, make: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    let c = this.layers.get(key);
    if (!c) {
      c = canvas(this.W, this.H);
      make(c.getContext('2d')!);
      this.layers.set(key, c);
    }
    return c;
  }

  private cloth(side: Side) {
    return this.layer(`cloth-${side}`, (g) => {
      const { W, H, s, cx, cy } = this;
      const tile = weave(this.o.pitch * s, side === 'back');
      const pat = g.createPattern(tile, 'repeat')!;
      if (this.o.mode === 'swatch') {
        g.fillStyle = pat;
        g.fillRect(0, 0, W, H);
        const lg = g.createLinearGradient(0, 0, W, H);
        lg.addColorStop(0, 'rgba(255,250,240,0.16)');
        lg.addColorStop(1, 'rgba(80,55,25,0.14)');
        g.fillStyle = lg;
        g.fillRect(0, 0, W, H);
        return;
      }
      const R = this.o.R * s;
      const rw = this.o.R * 0.11 * s;
      g.save();
      g.shadowColor = 'rgba(60,36,12,0.38)';
      g.shadowBlur = R * 0.16;
      g.shadowOffsetY = R * 0.07;
      g.fillStyle = '#b8874d';
      g.beginPath();
      g.arc(cx, cy, R + rw, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.save();
      g.beginPath();
      g.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = pat;
      g.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
      const lit = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.2, cy - R * 0.25, R * 1.1);
      lit.addColorStop(0, side === 'back' ? 'rgba(255,248,235,0.06)' : 'rgba(255,250,240,0.2)');
      lit.addColorStop(1, 'rgba(255,250,240,0)');
      g.fillStyle = lit;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
      const edge = g.createRadialGradient(cx, cy, R * 0.78, cx, cy, R * 1.02);
      edge.addColorStop(0, 'rgba(70,45,20,0)');
      edge.addColorStop(1, side === 'back' ? 'rgba(60,38,16,0.38)' : 'rgba(70,45,20,0.3)');
      g.fillStyle = edge;
      g.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
      g.restore();
    });
  }

  private ring(side: Side) {
    return this.layer(`ring-${side}`, (g) => {
      if (this.o.mode !== 'hoop') return;
      const { s, cx, cy } = this;
      const R = this.o.R * s;
      const rw = this.o.R * 0.11 * s;
      const r = rng(3);
      const band = (r0: number, r1: number, light: string, mid: string, dark: string, grain: number) => {
        const lg = g.createLinearGradient(cx - r1, cy - r1, cx + r1, cy + r1);
        lg.addColorStop(0, light);
        lg.addColorStop(0.55, mid);
        lg.addColorStop(1, dark);
        g.fillStyle = lg;
        g.beginPath();
        g.arc(cx, cy, r1, 0, Math.PI * 2);
        g.arc(cx, cy, r0, 0, Math.PI * 2, true);
        g.fill();
        g.save();
        g.beginPath();
        g.arc(cx, cy, r1, 0, Math.PI * 2);
        g.arc(cx, cy, r0, 0, Math.PI * 2, true);
        g.clip();
        for (let k = 0; k < grain; k++) {
          const rr = r0 + (r1 - r0) * (0.08 + r() * 0.84);
          const a0 = r() * Math.PI * 2;
          g.strokeStyle = `rgba(105,62,25,${0.08 + r() * 0.2})`;
          g.lineWidth = (0.5 + r() * 1.1) * (s / 4);
          g.beginPath();
          g.arc(cx, cy, rr, a0, a0 + 0.25 + r() * 1.3);
          g.stroke();
        }
        const hl = g.createRadialGradient(cx - r1 * 0.5, cy - r1 * 0.6, 0, cx - r1 * 0.5, cy - r1 * 0.6, r1 * 1.2);
        hl.addColorStop(0, 'rgba(255,238,210,0.38)');
        hl.addColorStop(1, 'rgba(255,238,210,0)');
        g.fillStyle = hl;
        g.fillRect(cx - r1, cy - r1, r1 * 2, r1 * 2);
        g.restore();
        g.lineWidth = Math.max(1, s * 0.18);
        g.strokeStyle = 'rgba(70,40,14,0.55)';
        g.beginPath();
        g.arc(cx, cy, r1 - g.lineWidth / 2, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = 'rgba(255,236,205,0.45)';
        g.beginPath();
        g.arc(cx, cy, r0 + g.lineWidth * 1.2, Math.PI * 0.9, Math.PI * 1.75);
        g.stroke();
      };
      if (side === 'front') {
        g.strokeStyle = 'rgba(255,252,244,0.35)';
        g.lineWidth = s * 0.9;
        g.beginPath();
        g.arc(cx, cy, R - s * 0.9, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = 'rgba(60,36,14,0.45)';
        g.lineWidth = s * 0.35;
        g.beginPath();
        g.arc(cx, cy, R + s * 0.1, 0, Math.PI * 2);
        g.stroke();
        band(R, R + rw, '#e2b67c', '#c4914f', '#93622f', 70);
      } else {
        band(R + rw * 0.05, R + rw, '#d6a96f', '#b8844a', '#8a5a2b', 60);
        band(R - rw * 0.62, R + rw * 0.05, '#eac797', '#d3a66c', '#a87843', 40);
      }
      const top = cy - R - rw;
      const tw = rw * 0.85;
      const th = rw * 1.05;
      const flip = side === 'back' ? -1 : 1;
      for (const sx of [-1, 1]) {
        const x = cx + sx * rw * 0.55 - tw / 2;
        const lg = g.createLinearGradient(x, 0, x + tw, 0);
        lg.addColorStop(0, '#a87440');
        lg.addColorStop(0.4, '#d9ab70');
        lg.addColorStop(1, '#8b5a2b');
        g.fillStyle = lg;
        g.beginPath();
        g.roundRect(x, top - th + rw * 0.3, tw, th, rw * 0.12);
        g.fill();
        g.strokeStyle = 'rgba(70,40,14,0.5)';
        g.lineWidth = Math.max(1, s * 0.15);
        g.stroke();
      }
      const sy = top - th * 0.42 + rw * 0.3;
      const sr = rw * 0.2;
      const brass = (y0: number, y1: number) => {
        const lg = g.createLinearGradient(0, y0, 0, y1);
        lg.addColorStop(0, '#fbe7a6');
        lg.addColorStop(0.35, '#d9ad4a');
        lg.addColorStop(0.75, '#9c7024');
        lg.addColorStop(1, '#5e4214');
        return lg;
      };
      g.fillStyle = brass(sy - sr, sy + sr);
      g.beginPath();
      g.roundRect(cx - rw * 1.45, sy - sr, rw * 2.9, sr * 2, sr);
      g.fill();
      const nx = cx + flip * rw * 1.55;
      const nr = rw * 0.5;
      g.fillStyle = brass(sy - nr, sy + nr);
      g.beginPath();
      g.roundRect(nx - rw * 0.22, sy - nr, rw * 0.44, nr * 2, rw * 0.12);
      g.fill();
      g.strokeStyle = 'rgba(70,48,10,0.45)';
      g.lineWidth = Math.max(1, s * 0.12);
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(nx - rw * 0.2, sy + (k * nr) / 4);
        g.lineTo(nx + rw * 0.2, sy + (k * nr) / 4);
        g.stroke();
      }
    });
  }

  draw(f: Frame | Frame[], o: DrawOpts & { base?: HTMLCanvasElement; after?: (g: CanvasRenderingContext2D) => void }) {
    const { g } = this;
    const frames = Array.isArray(f) ? f : [f];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(this.cloth(o.side), 0, 0);
    if (o.base) g.drawImage(o.base, 0, 0);
    if (o.pen && o.side === 'front') this.pen(g, o.pen);
    this.paint(g, frames, o.side, o.pierced);
    g.setTransform(1, 0, 0, 1, 0, 0);
    o.after?.(g);
    g.drawImage(this.ring(o.side), 0, 0);
    const w0 = frames[0]?.pieces.find((p) => 'th' in p)?.th.width ?? 2;
    this.labels(o, w0);
  }

  private pen(g: CanvasRenderingContext2D, lines: V[][]) {
    g.save();
    g.setTransform(this.s, 0, 0, this.s, this.cx, this.cy);
    g.strokeStyle = 'rgba(48, 92, 168, 0.55)';
    g.lineWidth = 0.3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const l of lines) {
      trace(g, l);
      g.stroke();
    }
    g.restore();
  }

  /** Paints frames onto a transparent layer the size of the scene, for content that has stopped moving. */
  bake(frames: Frame[], into?: HTMLCanvasElement): HTMLCanvasElement {
    const c = into ?? canvas(this.W, this.H);
    this.paint(c.getContext('2d')!, frames, 'front');
    return c;
  }

  private paint(g: CanvasRenderingContext2D, frames: Frame[], side: Side, pierced?: V[]) {
    const s = this.s;
    const L = side === 'front' ? v(-0.45, -0.89) : v(0.45, -0.89);
    g.save();
    g.setTransform(side === 'back' ? -s : s, 0, 0, s, this.cx, this.cy);
    if (this.o.mode === 'hoop') {
      g.beginPath();
      g.arc(0, 0, this.o.R * (side === 'back' ? 0.95 : 1), 0, Math.PI * 2);
      g.clip();
    }
    const w0 = frames[0]?.pieces.find((p) => 'th' in p)?.th.width ?? 2;
    for (const p of pierced ?? []) hole(g, p, w0 * 0.5);
    const items: { z: number; draw: () => void }[] = [];
    frames.forEach((f, k) => {
      const zk = k * 1e7;
      for (const p of f.pieces) {
        if (p.side !== side) {
          if (p.t === 'line' && p.live) items.push({ z: zk + NZG, draw: () => ghost(g, p.pts, p.th) });
          continue;
        }
        items.push({ z: zk + p.z, draw: () => piece(g, p, s, L) });
      }
      const n = f.needle;
      if (n) {
        if (n.side === side) items.push({ z: zk + n.z, draw: () => needle(g, n, s, L, false) });
        else items.push({ z: zk + NZG + 1, draw: () => needle(g, n, s, L, true) });
      }
    });
    items.sort((a, b) => a.z - b.z);
    for (const it of items) it.draw();
    g.restore();
  }

  private labels(o: DrawOpts, w0: number) {
    const { g, s } = this;
    const time = o.time ?? 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const font = `600 ${Math.round(12 * dpr)}px "Instrument Sans Variable", system-ui, sans-serif`;
    if (o.dots) {
      o.dots.forEach((p, i) => {
        const q = this.screen(p, o.side);
        const hot = i === o.hot;
        const bad = i === o.bad;
        const r = Math.max(4 * dpr, Math.min(w0 * 0.9, o.dotR ?? Infinity) * s);
        g.beginPath();
        g.arc(q.x, q.y, r * (hot ? 1.2 : 1), 0, Math.PI * 2);
        g.fillStyle = bad ? 'rgba(178,52,40,0.35)' : hot ? 'rgba(255,250,240,0.55)' : 'rgba(255,250,240,0.18)';
        g.fill();
        g.lineWidth = 1.5 * dpr;
        g.strokeStyle = bad ? '#b23428' : hot ? '#2b2018' : 'rgba(43,32,24,0.55)';
        g.stroke();
      });
    }
    const mark = (h: Hole, strong: boolean) => {
      const q = this.screen(h.p, o.side);
      const pulse = strong ? 0.5 + 0.5 * Math.sin(time * 5) : 0;
      const r = Math.max(6 * dpr, w0 * 0.85 * s) * (1 + pulse * 0.25);
      g.globalAlpha = strong ? 1 : 0.55;
      g.lineWidth = 2 * dpr;
      g.strokeStyle = 'rgba(43,32,24,0.55)';
      g.beginPath();
      g.arc(q.x, q.y, r + dpr, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#fffaf0';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.arc(q.x, q.y, r, 0, Math.PI * 2);
      g.stroke();
      if (o.numbers !== false) {
        const up = o.side === 'front' ? h.up : !h.up;
        const text = `${h.n} ${up ? '↑' : '↓'}`;
        g.font = font;
        const tw = g.measureText(text).width;
        const bw = tw + 12 * dpr;
        const bh = 20 * dpr;
        const bx = q.x + r * 0.7;
        const by = q.y - r * 0.7 - bh;
        g.fillStyle = up ? '#2b2018' : '#fffaf0';
        g.beginPath();
        g.roundRect(bx, by, bw, bh, bh / 2);
        g.fill();
        if (!up) {
          g.strokeStyle = '#2b2018';
          g.lineWidth = 1.25 * dpr;
          g.stroke();
        }
        g.fillStyle = up ? '#fffaf0' : '#2b2018';
        g.textBaseline = 'middle';
        g.fillText(text, bx + 6 * dpr, by + bh / 2 + dpr * 0.5);
      }
      g.globalAlpha = 1;
    };
    if (o.next && o.next !== o.target) mark(o.next, false);
    if (o.target) mark(o.target, true);
  }
}

const NZG = 2e6;


export function hole(g: CanvasRenderingContext2D, p: V, r: number) {
  const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.3);
  gr.addColorStop(0, 'rgba(45,28,12,0.55)');
  gr.addColorStop(0.55, 'rgba(45,28,12,0.25)');
  gr.addColorStop(1, 'rgba(45,28,12,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(p.x, p.y, r * 1.3, 0, Math.PI * 2);
  g.fill();
}

export function trace(g: CanvasRenderingContext2D, pts: V[]) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
}

function lit(pts: V[], d: number, L: V): V[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let n = perp(norm(sub(b, a)));
    if (dot(n, L) < 0) n = mul(n, -1);
    return add(p, mul(n, d));
  });
}

/** Short slanted strokes every `step` along the path: the twist of six-strand floss. */
function twist(g: CanvasRenderingContext2D, pts: V[], w: number, t: Tone, phase = 0) {
  const acc = lengths(pts);
  const total = acc[acc.length - 1];
  if (total < w * 0.4) return;
  const step = w * 0.58;
  const ca = Math.cos(1.0);
  const sa = Math.sin(1.0);
  const h = w * 0.43;
  const dark = new Path2D();
  const light = new Path2D();
  let i = 1;
  for (let s = step * (0.5 + phase); s < total - step * 0.2; s += step / 2) {
    while (i < acc.length - 1 && acc[i] < s) i++;
    const seg = acc[i] - acc[i - 1] || 1;
    const k = (s - acc[i - 1]) / seg;
    const p = lerp(pts[i - 1], pts[i], k);
    const d = norm(sub(pts[i], pts[i - 1]));
    const n = perp(d);
    const a = v(d.x * ca + n.x * sa, d.y * ca + n.y * sa);
    const path = Math.round(s / (step / 2)) % 2 ? dark : light;
    path.moveTo(p.x - a.x * h, p.y - a.y * h);
    path.lineTo(p.x + a.x * h, p.y + a.y * h);
  }
  g.lineCap = 'round';
  g.globalAlpha = 0.5;
  g.strokeStyle = t.deep;
  g.lineWidth = w * 0.13;
  g.stroke(dark);
  g.globalAlpha = 0.5;
  g.strokeStyle = t.light;
  g.lineWidth = w * 0.2;
  g.stroke(light);
  g.globalAlpha = 1;
}

export function floss(g: CanvasRenderingContext2D, pts: V[], th: Thread, s: number, L: V, lift = 0, w = th.width) {
  if (pts.length < 2) return;
  const t = tone(th.color);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.save();
  g.shadowColor = 'rgba(50,30,12,0.42)';
  g.shadowBlur = w * s * (0.35 + lift * 0.35);
  g.shadowOffsetX = w * s * (0.1 + lift * 0.3);
  g.shadowOffsetY = w * s * (0.2 + lift * 0.45);
  g.strokeStyle = t.dark;
  g.lineWidth = w;
  trace(g, pts);
  g.stroke();
  g.restore();
  g.strokeStyle = t.base;
  g.lineWidth = w * 0.74;
  g.stroke();
  twist(g, pts, w, t);
  g.strokeStyle = 'rgba(255,255,255,0.17)';
  g.lineWidth = w * 0.18;
  trace(g, lit(pts, w * 0.17, L));
  g.stroke();
}

function ghost(g: CanvasRenderingContext2D, pts: V[], th: Thread) {
  if (pts.length < 2) return;
  const w = th.width;
  g.save();
  g.globalAlpha = 0.55;
  g.setLineDash([w * 0.7, w * 0.6]);
  g.lineCap = 'round';
  g.strokeStyle = tone(th.color).dark;
  g.lineWidth = w * 0.4;
  trace(g, pts);
  g.stroke();
  g.restore();
}

function arc(c: V, r: number, a0: number, a1: number, n = 18, sq = 1, ang = 0): V[] {
  const pts: V[] = [];
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * sq;
    pts.push(v(c.x + x * ca - y * sa, c.y + x * sa + y * ca));
  }
  return pts;
}

export function knot(g: CanvasRenderingContext2D, k: Extract<Piece, { t: 'knot' }>, s: number, L: V) {
  const t = tone(k.th.color);
  const R = k.r * (1.5 - 0.5 * k.form);
  const sq = k.style === 'coral' ? 0.7 : 1;
  g.save();
  g.shadowColor = 'rgba(50,30,12,0.45)';
  g.shadowBlur = R * s * 0.7;
  g.shadowOffsetX = R * s * 0.22;
  g.shadowOffsetY = R * s * 0.38;
  g.fillStyle = t.dark;
  g.beginPath();
  g.ellipse(k.c.x, k.c.y, R * 0.95, R * 0.95 * sq, k.spin, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const th = { color: k.th.color, width: R * 0.62 };
  const sp = k.spin + (1 - k.form) * 1.4;
  if (k.style === 'colonial') {
    floss(g, arc(k.c, R * 0.42, sp, sp + Math.PI * 1.15, 14, 1, 0).map((p) => add(p, polar(R * 0.2, sp + 2.4))), th, s, L, 0.2);
    floss(g, arc(k.c, R * 0.42, sp + Math.PI, sp + Math.PI * 2.15, 14, 1, 0).map((p) => add(p, polar(R * 0.2, sp - 0.7))), th, s, L, 0.2);
  } else if (k.style === 'coral') {
    floss(g, arc(k.c, R * 0.45, sp + 0.6, sp + 0.6 + Math.PI * 1.4, 14, sq, k.spin), th, s, L, 0.2);
  } else {
    floss(g, arc(k.c, R * 0.5, sp, sp + Math.PI * 1.35, 16), th, s, L, 0.2);
    floss(g, arc(k.c, R * 0.42, sp + Math.PI * 1.1, sp + Math.PI * 2.2, 14), th, s, L, 0.2);
  }
  const hl = g.createRadialGradient(k.c.x - R * 0.35, k.c.y - R * 0.4, 0, k.c.x, k.c.y, R);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath();
  g.arc(k.c.x, k.c.y, R, 0, Math.PI * 2);
  g.fill();
}

export function coils(g: CanvasRenderingContext2D, c: Extract<Piece, { t: 'coils' }>, s: number, L: V) {
  const t = tone(c.th.color);
  const w = c.th.width;
  const d = norm(sub(c.b, c.a));
  const n = perp(d);
  const len = dist(c.a, c.b);
  g.save();
  g.lineCap = 'round';
  g.shadowColor = 'rgba(50,30,12,0.45)';
  g.shadowBlur = w * s * (0.6 + c.lift * 0.4);
  g.shadowOffsetX = w * s * (0.15 + c.lift * 0.4);
  g.shadowOffsetY = w * s * (0.3 + c.lift * 0.5);
  g.strokeStyle = t.deep;
  g.lineWidth = w * 1.5;
  trace(g, [c.a, c.b]);
  g.stroke();
  g.restore();
  const k = Math.max(c.n, Math.round(len / (w * 0.62)));
  for (let j = 0; j < k; j++) {
    const m = lerp(c.a, c.b, (j + 0.5) / k);
    const p0 = add(sub(m, mul(n, w * 0.7)), mul(d, -w * 0.22));
    const p1 = add(add(m, mul(n, w * 0.7)), mul(d, w * 0.22));
    const mid = add(lerp(p0, p1, 0.5), mul(d, w * 0.12));
    g.strokeStyle = t.dark;
    g.lineWidth = w * 0.66;
    trace(g, [p0, mid, p1]);
    g.stroke();
    g.strokeStyle = t.base;
    g.lineWidth = w * 0.44;
    g.stroke();
    g.strokeStyle = t.light;
    g.globalAlpha = 0.55;
    g.lineWidth = w * 0.14;
    trace(g, [lerp(p0, mid, 0.3), mid, lerp(mid, p1, 0.5)].map((p) => add(p, mul(d, -w * 0.08))));
    g.stroke();
    g.globalAlpha = 1;
  }
}

export function wrap(g: CanvasRenderingContext2D, p: Extract<Piece, { t: 'wrap' }>, s: number, L: V) {
  const w = p.th.width;
  const n = perp(p.d);
  const A = w * 0.74;
  const B = w * 0.36;
  const pts: V[] = [];
  const steps = 20;
  const from = p.half === 'back' ? 0 : 0.5;
  const to = Math.min(p.sweep, p.half === 'back' ? 0.5 : 1);
  if (to <= from) return;
  for (let i = 0; i <= steps; i++) {
    const u = from + ((to - from) * i) / steps;
    const a = u * Math.PI * 2;
    const across = Math.cos(a) * A;
    const along = p.fig8 ? Math.sin(a * 2) * B * 1.6 : Math.sin(a) * B + Math.cos(a) * B * 0.6;
    pts.push(add(p.c, add(mul(n, across), mul(p.d, along))));
  }
  floss(g, pts, p.th, s, L, p.half === 'front' ? 0.5 : 0, w * 0.74);
}

function tail(g: CanvasRenderingContext2D, p: Extract<Piece, { t: 'tail' }>, s: number, L: V) {
  const w = p.th.width;
  const d = norm(p.d);
  const n = perp(d);
  if (p.end) {
    const pts = [p.c, add(p.c, add(mul(d, w * 2), mul(n, w * 0.6))), add(p.c, add(mul(d, w * 4), mul(n, -w * 0.3)))];
    floss(g, pts, p.th, s, L, 0.1, w * 0.9);
    return;
  }
  floss(g, [add(p.c, mul(d, -w * 0.5)), add(p.c, add(mul(d, -w * 3.6), mul(n, w * 1.2)))], p.th, s, L, 0.1, w * 0.9);
  knot(g, { t: 'knot', c: add(p.c, mul(d, -w * 0.5)), r: w * 0.95, th: p.th, z: 0, side: 'back', style: 'french', form: 1, spin: 0.4 }, s, L);
}

function piece(g: CanvasRenderingContext2D, p: Piece, s: number, L: V) {
  switch (p.t) {
    case 'line':
      if (!p.bare && !p.live && p.side === 'front') {
        hole(g, p.pts[0], p.th.width * 0.5);
        hole(g, p.pts[p.pts.length - 1], p.th.width * 0.5);
      }
      return floss(g, p.pts, p.th, s, L, p.lift ?? 0);
    case 'knot': return knot(g, p, s, L);
    case 'coils': return coils(g, p, s, L);
    case 'wrap': return wrap(g, p, s, L);
    case 'tail': return tail(g, p, s, L);
  }
}

export function needle(g: CanvasRenderingContext2D, n: Needle, s: number, L: V, ghostly: boolean) {
  const len = n.len * n.flat * n.vis;
  if (len < 0.05) return;
  const d = norm(n.d);
  const nn = perp(d);
  const hw = n.w * 0.3;
  const sharp = n.cut !== 'tip';
  const eyed = n.cut !== 'eye';
  const taper = Math.min(len * 0.9, n.len * 0.2 * n.flat);
  const tip = n.tip;
  /** The engine ties the thread to `tip - d * len`; the needle runs on past it so that point is the middle of the eye. */
  const past = eyed ? hw * 1.1 + n.len * 0.035 * n.flat : 0;
  const end = sub(tip, mul(d, len + past));
  const body = sub(tip, mul(d, sharp ? taper : 0));
  const shape = new Path2D();
  if (sharp) shape.moveTo(tip.x, tip.y);
  shape.lineTo(body.x + nn.x * hw, body.y + nn.y * hw);
  shape.lineTo(end.x + nn.x * hw, end.y + nn.y * hw);
  if (eyed) {
    const ang = Math.atan2(-d.y, -d.x);
    shape.arc(end.x, end.y, hw, ang - Math.PI / 2, ang + Math.PI / 2);
  } else {
    shape.lineTo(end.x - nn.x * hw, end.y - nn.y * hw);
  }
  shape.lineTo(body.x - nn.x * hw, body.y - nn.y * hw);
  shape.closePath();

  g.save();
  if (n.hide) {
    const a = sub(tip, mul(d, n.hide[0] * n.len));
    const b = sub(tip, mul(d, n.hide[1] * n.len));
    const clip = new Path2D();
    clip.rect(-1e4, -1e4, 2e4, 2e4);
    const k = hw * 6;
    clip.moveTo(a.x + nn.x * k, a.y + nn.y * k);
    clip.lineTo(b.x + nn.x * k, b.y + nn.y * k);
    clip.lineTo(b.x - nn.x * k, b.y - nn.y * k);
    clip.lineTo(a.x - nn.x * k, a.y - nn.y * k);
    clip.closePath();
    g.clip(clip, 'evenodd');
    if (!ghostly) {
      hole(g, a, hw * 1.8);
      hole(g, b, hw * 1.8);
    }
  }
  if (ghostly) {
    g.globalAlpha = 0.22;
    g.fillStyle = '#3a3f46';
    g.fill(shape);
    g.restore();
    return;
  }
  if (!sharp) hole(g, tip, hw * 2.4);
  if (!eyed) hole(g, end, hw * 2.4);
  /**
   * The shadow falls away from the light by each end's height above the cloth, so an end touching the cloth (a tip
   * going in, an eye coming out) meets its own shadow, and a raised end throws it further and softer.
   */
  const rise = Math.min(n.len, (len * Math.sqrt(Math.max(0, 1 - n.flat ** 2))) / Math.max(n.flat, 0.15));
  const lean = n.lean ?? 0;
  const [hT, hE] = n.cut === 'tip' ? [0, rise] : n.cut === 'eye' ? [rise, 0] : [n.lift + (rise * (1 - lean)) / 2, n.lift + (rise * (1 + lean)) / 2];
  const away = mul(L, -1);
  const fall = (h: number) => mul(away, 0.3 + 0.1 * h);
  g.save();
  g.filter = `blur(${(s * (0.22 + 0.018 * (hT + hE))).toFixed(1)}px)`;
  g.strokeStyle = `rgba(30,20,10,${(0.45 / (1 + 0.01 * (hT + hE))).toFixed(3)})`;
  g.lineWidth = hw * 2;
  g.lineCap = 'round';
  trace(g, [add(tip, fall(hT)), add(end, fall(hE))]);
  g.stroke();
  g.restore();
  const mid = lerp(tip, end, 0.5);
  const lg = g.createLinearGradient(mid.x - nn.x * hw, mid.y - nn.y * hw, mid.x + nn.x * hw, mid.y + nn.y * hw);
  const stops = ['#3c4148', '#8c939c', '#f4f7fa', '#c3c9d0', '#555b63'];
  (dot(nn, L) > 0 ? stops.slice().reverse() : stops).forEach((c, i) => lg.addColorStop(i / 4, c));
  g.fillStyle = lg;
  g.fill(shape);
  g.strokeStyle = 'rgba(30,32,36,0.65)';
  g.lineWidth = hw * 0.22;
  g.lineJoin = 'round';
  g.stroke(shape);
  if (eyed && n.vis > 0.5 && n.flat > 0.3) {
    const e0 = add(end, mul(d, hw * 1.1));
    const e1 = add(end, mul(d, hw * 1.1 + n.len * 0.07 * n.flat));
    g.strokeStyle = 'rgba(25,22,20,0.9)';
    g.lineCap = 'round';
    g.lineWidth = hw * 0.7;
    trace(g, [e0, e1]);
    g.stroke();
  }
  g.restore();
}

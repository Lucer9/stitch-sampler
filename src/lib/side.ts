import type { Frame, Program, Sec, Thread } from './engine.ts';
import { floss, knot as ball, coils, wrap, needle, tone } from './render.ts';
import { type V, v, add, sub, mul, lerp, dot, norm, perp, dist, clamp01, span, inOut, out, cubic, quad } from './geom.ts';

type Item =
  | { k: 'line'; pts: V[] }
  | { k: 'wrap'; c: V; d: V; sweep: number; half: 'back' | 'front'; fig8: boolean }
  | { k: 'ball'; c: V; r: number; form: number; style: 'french' | 'colonial' | 'coral' }
  | { k: 'bar'; a: V; b: V; n: number; lift: number }
  | { k: 'dot'; c: V }
  | { k: 'needle'; tip: V; d: V; len: number; vis?: number };

/** Light comes from the top left; the section's y axis points up. */
const L = v(-0.45, 0.89);

/** A cut through the fabric along the stitch, following the current knot. */
export class SideView {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private F: V | null = null;
  private axis = v(1, 0);
  private span = 24;

  constructor(el: HTMLCanvasElement) {
    this.el = el;
    this.g = el.getContext('2d')!;
    this.resize();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = this.el.width = Math.max(1, Math.round(r.width * dpr));
    this.H = this.el.height = Math.max(1, Math.round(r.height * dpr));
  }

  draw(f: Frame, prog: Program, t: number) {
    const ev = prog.evs[f.ev];
    const q = ev.t1 > ev.t0 ? clamp01((t - ev.t0) / (ev.t1 - ev.t0)) : 1;
    const sec = ev.sec;
    const w = sec.th.width;
    const focus = sec.k === 'bullion' && sec.a && sec.b ? lerp(sec.a, sec.b, 0.5) : sec.b ?? sec.a ?? v(0, 0);
    let axis = this.axis;
    if (sec.k === 'bullion' && sec.a && sec.b) axis = norm(sub(sec.b, sec.a));
    else if (sec.k === 'coral' && sec.a && sec.b) axis = perp(norm(sub(sec.b, sec.a)));
    else if (sec.k === 'tie') axis = norm(v(-1, 1));
    else if (sec.k === 'knot') axis = sec.far && sec.a && sec.b ? norm(sub(sec.b, sec.a)) : v(1, 0);
    const want = sec.k === 'bullion' && sec.a && sec.b ? dist(sec.a, sec.b) + w * 11 : w * 15;
    this.F = this.F ? lerp(this.F, focus, 0.2) : focus;
    this.axis = norm(lerp(this.axis, axis, 0.25));
    this.span += (want - this.span) * 0.2;
    if (Math.abs(dot(this.axis, axis)) < 0.2) this.axis = axis;

    const F = this.F;
    const ax = this.axis;
    const nx = perp(ax);
    const X = (p: V) => dot(sub(p, F), ax);
    const near = (p: V) => Math.abs(dot(sub(p, F), nx)) < w * 2.5;
    const items: Item[] = [];
    const TH = w * 1.1;
    let bump = { l: 0, r: 0, h: 0 };

    for (const p of f.pieces) {
      if (p.side !== 'front' || p.z === sec.z || (p.t === 'line' && p.live)) continue;
      if (p.t === 'knot' && near(p.c)) items.push({ k: 'ball', c: v(X(p.c), p.r * 0.95), r: p.r, form: 1, style: p.style });
      if (p.t === 'coils' && near(p.a) && near(p.b)) items.push({ k: 'bar', a: v(X(p.a), w * 0.75), b: v(X(p.b), w * 0.75), n: p.n, lift: 0 });
      if (p.t === 'line' && near(p.pts[0]) && near(p.pts[p.pts.length - 1])) items.push({ k: 'line', pts: p.pts.map((pt) => v(X(pt), w * 0.5)) });
    }

    const NL = w * 6.5;
    const xa = sec.a ? X(sec.a) : 0;
    const xb = sec.b ? X(sec.b) : 0;
    const under = -TH - w * 0.6;
    switch (sec.k) {
      case 'up': {
        const sp = sec.sp ?? 0;
        if (sec.a && q < sp) {
          const x = lerp(xa, xb, inOut(q / sp));
          items.push({ k: 'line', pts: [v(xa, 0), v(xa, under), v(x, under)] });
          items.push({ k: 'needle', tip: v(x + Math.sign(xb - xa || 1) * w * 2, under - w * 0.3), d: v(Math.sign(xb - xa || 1), 0), len: NL });
        } else {
          const s = out(span(q, sp, 1));
          const tip = v(xb, under + (NL * 0.6 - under) * s);
          const eye = sub(tip, v(0, NL));
          items.push({ k: 'line', pts: quad(v(xb - w * 3, under), v(xb, under), eye.y < under ? eye : v(xb, Math.min(eye.y, 0)), 6) });
          items.push({ k: 'needle', tip, d: v(0, 1), len: NL });
        }
        break;
      }
      case 'down': {
        const sp = sec.sp ?? 0;
        if (q < sp) {
          const s = inOut(q / sp);
          const d = norm(lerp(v(0.4, 1), v(0.15, -1), s));
          const tip = lerp(v(xa + w, NL * 0.55), v(xb, w * 0.2), s);
          const eye = sub(tip, mul(d, NL));
          items.push({ k: 'line', pts: quad(v(xa, 0), v(xa, eye.y), eye, 10) });
          items.push({ k: 'needle', tip, d, len: NL });
        } else {
          const s = inOut(span(q, sp, 1));
          const tip = v(xb, w * 0.2 - s * (TH + NL * 0.7));
          const eye = sub(tip, v(0, -NL));
          items.push({ k: 'line', pts: eye.y > 0 ? quad(v(xa, 0), v(xa, eye.y), eye, 10) : [v(xa, 0), v(xa, w * 0.5), v(xb, w * 0.5), v(xb, eye.y)] });
          items.push({ k: 'needle', tip, d: v(0, -1), len: NL });
        }
        break;
      }
      case 'knot': {
        const n = sec.wraps ?? 2;
        const fig8 = sec.style === 'colonial';
        const r = w * (0.95 + 0.12 * n) * (fig8 ? 1.15 : 1);
        const s1 = span(q, 0, 0.14);
        const s2 = span(q, 0.14, 0.58);
        const s3 = span(q, 0.58, 0.8);
        const s4 = span(q, 0.8, 1);
        const T0 = v(xa + w * 2.6, w * 2.6);
        const top = v(xb, w * 0.15);
        let tip = lerp(v(xa, NL * 0.42), T0, inOut(s1));
        let d = norm(lerp(v(0, 1), v(1, 0), inOut(s1)));
        if (s3 > 0) { tip = lerp(T0, top, inOut(s3)); d = norm(lerp(v(1, 0), v(0, -1), inOut(s3))); }
        if (s4 > 0) { tip = v(xb, w * 0.15 - inOut(s4) * (TH + NL * 0.7)); d = v(0, -1); }
        const eye = sub(tip, mul(d, NL));
        if (sec.far) items.push({ k: 'line', pts: [v(xa - w * 30, w * 0.5), v(xa, w * 0.5)] });
        if (s4 <= 0) {
          const gap = (1.1 - 0.5 * s3) * w;
          const pitch = (fig8 ? 1.05 : 0.8) * w * (1 - 0.2 * s3);
          const cs: V[] = [];
          for (let j = 0; j < n; j++) {
            const sweep = clamp01(s2 * n - j);
            if (sweep <= 0) break;
            cs.push(sub(tip, mul(d, gap + j * pitch)));
          }
          const pd = perp(d);
          items.push({ k: 'line', pts: quad(v(xa, 0), v(xa, cs.length ? cs[0].y : eye.y), cs.length ? sub(cs[0], mul(pd, w * 0.9)) : eye, 10) });
          if (cs.length) items.push({ k: 'line', pts: [add(cs[cs.length - 1], mul(pd, w * 0.9)), eye] });
          cs.forEach((c, j) => items.push({ k: 'wrap', c, d, sweep: clamp01(s2 * n - j), half: 'back', fig8 }));
          items.push({ k: 'needle', tip, d, len: NL });
          cs.forEach((c, j) => items.push({ k: 'wrap', c, d, sweep: clamp01(s2 * n - j), half: 'front', fig8 }));
        } else {
          items.push({ k: 'line', pts: [v(xa, 0), v(xa, r * 0.4), v(xb, r * 0.6)] });
          items.push({ k: 'line', pts: [v(xb, 0), v(xb, Math.min(eye.y, under))] });
          if (q < 1) items.push({ k: 'needle', tip, d, len: NL });
          items.push({ k: 'ball', c: v(xb, r * 0.95), r, form: inOut(s4), style: fig8 ? 'colonial' : 'french' });
        }
        break;
      }
      case 'bullion': {
        const n = sec.wraps ?? 8;
        const Lab = Math.abs(xb - xa);
        const P = Lab + w * 1.5;
        const len = P + Lab + w * 3.5;
        const yN = w * 1.1;
        const s1 = span(q, 0, 0.16);
        const s2 = span(q, 0.16, 0.6);
        const s3 = span(q, 0.6, 0.8);
        const s4 = span(q, 0.8, 1);
        const dir = v(Math.sign(xa - xb) || -1, 0);
        bump = { l: Math.min(xa, xb) - w * 0.4, r: Math.max(xa, xb) + w * 0.4, h: (yN + w * 0.5) * out(s1) * (1 - inOut(s3)) };
        if (s3 <= 0) {
          const tip = v(lerp(xb, xa + dir.x * P, out(s1)), yN);
          items.push({ k: 'needle', tip, d: dir, len });
          const eye = sub(tip, mul(dir, len - w * 1.2));
          const k = Math.min(n, Math.floor(s2 * n + 1));
          for (let j = 0; j < n; j++) {
            const sweep = clamp01(s2 * n - j);
            if (sweep <= 0) break;
            const c = v(xa + dir.x * (w * 0.55 + (j * (Lab - w * 0.6)) / Math.max(1, n - 1)), yN);
            items.splice(items.length - 1, 0, { k: 'wrap', c, d: dir, sweep, half: 'back', fig8: false });
            items.push({ k: 'wrap', c, d: dir, sweep, half: 'front', fig8: false });
          }
          const reach = xa + dir.x * (w * 0.55 + (Math.max(0, k - 1) * (Lab - w * 0.6)) / Math.max(1, n - 1));
          items.unshift({ k: 'line', pts: s2 > 0 ? [v(xa, 0), v(xa + dir.x * w * 0.3, yN - w), v(reach, yN + w * 1.1), v(eye.x, yN + w * 0.9)] : [v(xa, 0), v(xa + dir.x * w * 0.5, w * 0.6)] });
        } else if (s4 <= 0) {
          const y = lerp(yN, w * 0.75, inOut(s3));
          const end = v(xa + dir.x * Lab, y);
          items.push({ k: 'bar', a: v(xa, y), b: end, n, lift: 0 });
          const tip = v(xa + dir.x * (P + out(s3) * (len + w * 2)), yN);
          const eye = sub(tip, mul(dir, len - w * 1.2));
          items.push({ k: 'line', pts: [end, eye] });
          items.push({ k: 'needle', tip, d: dir, len });
        } else {
          const ang = Math.PI * inOut(s4);
          const end = v(xa + dir.x * Lab * Math.cos(ang), w * 0.75 + Lab * 0.5 * Math.sin(ang));
          items.push({ k: 'bar', a: v(xa, w * 0.75), b: end, n, lift: Math.sin(ang) });
          const dv = span(s4, 0.55, 1);
          const tip = v(xb, w * 2.2 - dv * (TH + NL * 0.8 + w * 2));
          if (q < 1) {
            items.push({ k: 'line', pts: quad(end, v(xb, end.y + w), sub(tip, v(0, -NL)), 8) });
            items.push({ k: 'needle', tip, d: v(0, -1), len: NL, vis: 1 });
          }
        }
        break;
      }
      case 'coral': {
        const s1 = span(q, 0, 0.3);
        const s2 = span(q, 0.3, 0.6);
        const s3 = span(q, 0.6, 1);
        const x1 = w * 1.1;
        const x2 = -w * 1.1;
        const yN = w * 0.9;
        bump = { l: x2 - w * 0.4, r: x1 + w * 0.4, h: (yN + w * 0.5) * out(s2) * (1 - inOut(s3)) };
        if (s3 <= 0) {
          items.push({ k: 'dot', c: v(0, w * 0.5) });
          if (s2 <= 0) {
            items.push({ k: 'line', pts: cubic(v(0, w * 0.5), v(-w * 1.2, w * 3 * s1), v(-w * 2.8, w * 2.2 * s1), v(-w * 3 * s1, w * 0.6), 12) });
          } else {
            const tip = v(lerp(x1, x2 - w * 1.6, out(s2)), yN);
            const eye = v(tip.x + NL, yN);
            items.push({ k: 'needle', tip, d: v(-1, 0), len: NL });
            items.push({ k: 'line', pts: [...cubic(v(0, w * 0.5), v(-w * 0.4, w * 2.6), v(tip.x - w * 1.8, w * 2.2), v(tip.x - w * 0.8, yN - w * 0.75), 12), ...quad(v(tip.x + w * 0.4, yN - w * 0.8), v(eye.x - w * 3, yN - w * 0.2), eye, 8)] });
          }
        } else {
          items.push({ k: 'ball', c: v(0, w * 0.85), r: w * 0.95, form: inOut(s3), style: 'coral' });
          if (q < 1) items.push({ k: 'needle', tip: v(x2 - w * 1.6 - s3 * NL, yN), d: v(-1, 0), len: NL });
        }
        break;
      }
      case 'tie': {
        const s1 = span(q, 0.2, 0.6);
        const s2 = span(q, 0.6, 1);
        if (s2 <= 0) {
          const tip = v(lerp(-w * 2.4, w * 2.4, inOut(s1)), w * 0.55);
          items.push({ k: 'line', pts: [v(xa, 0), ...quad(v(xa - w, w * 1.6), v(tip.x + w * 1.4, -w * 0.1), v(tip.x + w * 0.6, w * 0.15), 8)] });
          items.push({ k: 'needle', tip, d: v(1, 0), len: NL });
          items.push({ k: 'dot', c: v(0, w * 1.25) });
        } else {
          items.push({ k: 'ball', c: v(0, w * 1.15), r: w * 1.05, form: inOut(s2), style: 'french' });
          if (q < 1) items.push({ k: 'needle', tip: v(w * 2.4 + s2 * NL, w * 0.55), d: v(1, 0), len: NL });
        }
        break;
      }
    }

    this.paint(items, sec.th, TH, bump);
  }

  private paint(items: Item[], th: Thread, TH: number, bump: { l: number; r: number; h: number }) {
    const { g, W, H } = this;
    const k = W / this.span;
    const sy = H * 0.56;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(k, 0, 0, -k, W / 2, sy);
    const half = this.span / 2 + 2;
    const top = (x: number) => {
      if (bump.h <= 0 || x < bump.l - TH || x > bump.r + TH) return 0;
      const e = (u: number) => clamp01(u) * clamp01(u) * (3 - 2 * clamp01(u));
      return bump.h * e((x - (bump.l - TH)) / TH) * e((bump.r + TH - x) / TH);
    };
    const all = () => {
      for (const it of items) {
        switch (it.k) {
          case 'line': floss(g, it.pts, th, k, L); break;
          case 'wrap': wrap(g, { t: 'wrap', c: it.c, d: it.d, th, z: 0, side: 'front', sweep: it.sweep, half: it.half, fig8: it.fig8 }, k, L); break;
          case 'ball': ball(g, { t: 'knot', c: it.c, r: it.r, th, z: 0, side: 'front', style: it.style, form: it.form, spin: 0.6 }, k, L); break;
          case 'bar': coils(g, { t: 'coils', a: it.a, b: it.b, n: it.n, th, z: 0, side: 'front', lift: it.lift }, k, L); break;
          case 'dot': {
            const t = tone(th.color);
            g.fillStyle = t.dark;
            g.beginPath();
            g.arc(it.c.x, it.c.y, th.width * 0.5, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = t.base;
            g.beginPath();
            g.arc(it.c.x - th.width * 0.08, it.c.y + th.width * 0.08, th.width * 0.36, 0, Math.PI * 2);
            g.fill();
            break;
          }
          case 'needle': needle(g, { tip: it.tip, d: it.d, flat: 1, vis: it.vis ?? 1, lift: 0.25, side: 'front', z: 0, len: it.len, w: th.width }, k, L, false); break;
        }
      }
    };
    const edge: V[] = [];
    for (let x = -half; x <= half; x += 0.25) edge.push(v(x, top(x)));

    all();

    g.save();
    g.beginPath();
    edge.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    for (let i = edge.length - 1; i >= 0; i--) g.lineTo(edge[i].x, edge[i].y - TH);
    g.closePath();
    g.fillStyle = '#d6c6a3';
    g.fill();
    g.clip();
    const pitch = th.width * 1.05;
    for (let x = Math.floor(-half / pitch) * pitch; x <= half; x += pitch) {
      const y = top(x) - TH / 2;
      g.fillStyle = '#eee2c5';
      g.strokeStyle = 'rgba(120,95,55,0.55)';
      g.lineWidth = 1 / k;
      g.beginPath();
      g.ellipse(x, y, pitch * 0.44, TH * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    for (let x = -half; x <= half; x += 0.2) {
      const y = top(x) - TH / 2 + Math.sin((Math.PI * x) / pitch) * TH * 0.3;
      x === -half ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(120,95,55,0.6)';
    g.lineWidth = TH * 0.34;
    g.stroke();
    g.strokeStyle = '#e8d9b8';
    g.lineWidth = TH * 0.24;
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,250,238,0.7)';
    g.lineWidth = 1.2 / k * dpr;
    g.beginPath();
    edge.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();

    g.save();
    g.beginPath();
    edge.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.lineTo(half, 100);
    g.lineTo(-half, 100);
    g.closePath();
    g.clip();
    all();
    g.restore();

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `600 ${Math.round(10.5 * dpr)}px "Instrument Sans Variable", system-ui, sans-serif`;
    g.fillStyle = getComputedStyle(this.el).color;
    g.globalAlpha = 0.65;
    g.textBaseline = 'alphabetic';
    g.fillText('FRONT', 12 * dpr, sy - TH * 0 - 10 * dpr);
    g.textBaseline = 'top';
    g.fillText('BACK', 12 * dpr, sy + TH * k + 10 * dpr);
    g.globalAlpha = 1;
  }
}

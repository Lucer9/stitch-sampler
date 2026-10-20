import { compile, frameAt, type Frame, type Op, type Program, type Thread } from './engine.ts';
import { Scene } from './render.ts';
import {
  T, track, curve, running, back, split, stem, whipped, couch, chain, daisy, fly, feather, blanket, cretan,
  crossCells, herringbone, satin, fishbone, seeds, knot, bullion, pistil, fourLegged, coral, wheel, STITCHES,
} from './stitches.ts';
import { type V, v, add, sub, mul, lerp, rot, dist, perp } from './geom.ts';

const W = 1.1;
const deg = (d: number) => (d * Math.PI) / 180;
const leafW = (max: number, pow = 0.8) => (t: number) => max * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** pow;
/** Radius of cloth the bands stay inside, clear of the inner hoop. */
const RC = 46;
/** Space between bands. */
const GAP = 1.3;
const P = {
  madder: '#a8382b', indigo: '#2c4777', ochre: '#c58b22', gold: '#c79a35', sage: '#557a3f', moss: '#7c9a48',
  plum: '#76375e', rose: '#c4566a', teal: '#2c6d70', sky: '#5b86b8',
};
const U = (p: V, th?: Thread): Op => ({ k: 'up', p, ...(th ? { th } : {}) });
const D = (p: V): Op => ({ k: 'down', p });

/** The sampler stitches itself: no needle, and nothing of what happens behind the cloth. */
const bare = (f: Frame): Frame => ({ ...f, needle: null, pieces: f.pieces.filter((p) => p.side === 'front') });

interface Motif { slug: string; ops: Op[]; th: Thread; prog?: Program; t0?: number; pts?: V[] }
/** A row of the sampler: its height, and what to stitch along centre line `y` between `x0` and `x1`. */
interface Band { h: number; draw: (y: number, x0: number, x1: number) => void }

/** Gentle wave along a band. */
const line = (y: number, x0: number, x1: number, amp = 0.5) =>
  Array.from({ length: 41 }, (_, k) => {
    const x = x0 + ((x1 - x0) * k) / 40;
    return v(x, y + amp * Math.sin(((x - x0) / 9) * Math.PI));
  });

/** Evenly spaced centres, as many as fit between `x0` and `x1`, centred. */
const slots = (x0: number, x1: number, step: number) => {
  const n = Math.max(1, Math.floor((x1 - x0) / step) + 1);
  return Array.from({ length: n }, (_, k) => (x0 + x1) / 2 + (k - (n - 1) / 2) * step);
};

/** A leaf's axis from base `a` along `u`, bowed slightly. */
const axis = (a: V, u: V, len: number) => track(curve([a, add(add(a, mul(u, len / 2)), mul(perp(u), 0.35)), add(a, mul(u, len))]));

/**
 * The home-page sampler: horizontal bands, one stitch (or a pair that belong together) per band, like the practice
 * cloths embroiderers make. Bands are fitted to the circle so nothing crosses the hoop or another band.
 */
function compose(): Motif[] {
  const m: Motif[] = [];
  const add_ = (slug: string, color: string, build: (o: Op[], th: Thread) => void, w = W) => {
    const th = T(color, w);
    const o: Op[] = [];
    build(o, th);
    m.push({ slug, ops: o, th });
  };
  const LL = 7;

  const bands: Band[] = [
    { h: 5, draw: (y, x0, x1) => {
      const xs = slots(x0 + 2.2, x1 - 2.2, 5.4);
      add_('pistil-stitch', P.ochre, (o) => xs.forEach((x, k) => {
        if (k % 2 === 0) for (let j = 0; j < 5; j++) pistil(o, v(x, y), deg(-90 + j * 72), 0.5, 1.3);
      }));
      add_('four-legged-knot', P.teal, (o) => xs.forEach((x, k) => k % 2 && fourLegged(o, v(x, y), 1.5)));
    } },
    { h: 1.4, draw: (y, x0, x1) => add_('running-stitch', P.madder, (o) => running(o, line(y, x0, x1), 2.2, 1.3)) },
    { h: 1.4, draw: (y, x0, x1) => add_('back-stitch', P.indigo, (o) => back(o, line(y, x0, x1), 2.2)) },
    { h: 2.6, draw: (y, x0, x1) => add_('chain-stitch', P.ochre, (o) => chain(o, line(y, x0, x1 - 1.2, 0.4), 2.8, 0.46)) },
    { h: 2.4, draw: (y, x0, x1) => add_('cross-stitch', P.madder, (o) => {
      const s = 2.3;
      let n = Math.floor((x1 - x0) / s);
      if (n % 2 === 0) n--;
      crossCells(o, v((x0 + x1) / 2 - (n * s) / 2, y - s / 2), s, [Array.from({ length: n }, (_, k) => (k % 2 ? '.' : 'X')).join('')]);
    }) },
    { h: 3, draw: (y, x0, x1) => add_('herringbone-stitch', P.teal, (o) => {
      const count = Math.floor((x1 - x0 - 1) / 2);
      herringbone(o, v((x0 + x1) / 2 - (count * 2 + 1) / 2, y), 2.8, 3, 1, count);
    }) },
    { h: 3.2, draw: (y, x0, x1) => {
      const xs = slots(x0 + 1.6, x1 - 1.6, 3.8);
      add_('bullion-knot', P.plum, (o) => xs.forEach((x, k) => k % 2 === 0 && bullion(o, v(x - 1.2, y + 0.8), v(x + 1.2, y - 0.8), 6)));
      add_('colonial-knot', P.rose, (o) => xs.forEach((x, k) => k % 2 && knot(o, v(x, y), W, 2, 'colonial')));
    } },
    { h: 9, draw: (y, x0, x1) => {
      const vine = line(y, x0, x1, 0.6);
      add_('split-stitch', P.sage, (o) => split(o, vine, 2));
      const xs = slots(x0 + 2.5, x1 - LL, 5.6);
      const at = (x: number) => v(x, y + 0.6 * Math.sin(((x - x0) / 9) * Math.PI));
      const leaves = xs.map((x, k) => ({ a: at(x), u: rot(v(1, 0), deg(k % 2 ? 32 : -32)), kind: k % 3 }));
      add_('fishbone-stitch', P.sage, (o) => leaves.forEach(({ a, u, kind }) => {
        if (kind !== 0) return;
        const A = axis(a, u, LL);
        fishbone(o, curve([A.p(A.L), A.p(A.L * 0.5), a]), leafW(1.9), 8, W);
      }));
      add_('satin-stitch', P.moss, (o) => leaves.forEach(({ a, u, kind }) => {
        if (kind !== 1) return;
        const A = axis(a, u, LL);
        const hw = leafW(1.9, 0.75);
        const sl = 0.1;
        satin(o, (t) => add(A.p(t * A.L), mul(A.n(t * A.L), hw(t))), (t) => sub(A.p((t + sl) * A.L), mul(A.n((t + sl) * A.L), hw(t + sl))), 10, 0.03, 0.97 - sl);
      }));
      add_('long-and-short-stitch', P.moss, (o, light) => {
        const dark = T(P.sage, W);
        leaves.forEach(({ a, u, kind }) => {
          if (kind !== 2) return;
          const A = axis(a, u, LL);
          const hw = leafW(2, 0.75);
          const edge = (t: number, side: number) => add(A.p(t * A.L), mul(A.n(t * A.L), side * hw(t)));
          const mid = (t: number) => A.p(Math.min(1, t) * A.L);
          let first = true;
          for (const side of [1, -1]) for (let k = 0; k < 6; k++) {
            const t = 0.12 + k * 0.14;
            const e = edge(t, side);
            o.push(U(e, first ? light : undefined), D(lerp(e, mid(t + 0.12), k % 2 ? 0.5 : 0.78)));
            first = false;
          }
          first = true;
          for (const side of [1, -1]) for (let k = 0; k < 5; k++) {
            const t = 0.18 + k * 0.14;
            const e = edge(t, side);
            o.push(U(lerp(e, mid(t + 0.12), 0.5), first ? dark : undefined), D(mid(t + 0.12)));
            first = false;
          }
        });
      });
    } },
    { h: 9.8, draw: (y, x0, x1) => {
      const xs = slots(x0 + 4.6, x1 - 4.6, 10);
      add_('lazy-daisy', P.sky, (o) => xs.forEach((x, k) => {
        if (k % 2 === 0) for (let j = 0; j < 5; j++) daisy(o, v(x, y), deg(-90 + j * 72), 1.1, 2.6, 0.55, 0.6);
      }));
      add_('french-knot', P.ochre, (o) => xs.forEach((x, k) => k % 2 === 0 && knot(o, v(x, y), W, 3)));
      add_('woven-wheel', P.rose, (o) => xs.forEach((x, k) => k % 2 && wheel(o, v(x, y), 3.6, W, 5, deg(-90))));
    } },
    { h: 3.8, draw: (y, x0, x1) => add_('fly-stitch', P.sage, (o) =>
      slots(x0 + 1.8, x1 - 1.8, 4.4).forEach((x) => fly(o, v(x - 1.7, y - 1.4), v(x + 1.7, y - 1.4), v(x, y + 0.4), v(x, y + 1.7)))) },
    { h: 1.8, draw: (y, x0, x1) => add_('stem-stitch', P.plum, (o) => stem(o, line(y, x0, x1, 0.6), 2.6, 0.3)) },
    { h: 2.6, draw: (y, x0, x1) => add_('blanket-stitch', P.indigo, (o) => blanket(o, line(y + 1.3, x0, x1 - 1.2, 0), 2.4, 1.8, -1)) },
    { h: 2, draw: (y, x0, x1) => add_('whipped-running-stitch', P.madder, (o) => whipped(o, line(y, x0, x1), 2.4, 1, T(P.gold, 0.9), 1.25)) },
    { h: 4.2, draw: (y, x0, x1) => add_('feather-stitch', P.teal, (o) => {
      const s = 2.8;
      const d = 2.2;
      feather(o, v(x0 + 0.4, y - s / 4), v(1, 0), v(0, 1), s, d, Math.floor((x1 - x0 - 2) / d));
    }) },
    { h: 2.2, draw: (y, x0, x1) => add_('couching', P.gold, (o) => couch(o, line(y, x0, x1, 0.7), T(P.gold, 1.7), T(P.madder, 0.6), 3.2), 1.7) },
    { h: 4.2, draw: (y, x0, x1) => add_('cretan-stitch', P.rose, (o) => cretan(o, line(y, x0, x1, 0), Math.round((x1 - x0) / 2.1), () => 2, 0.45)) },
    { h: 2, draw: (y, x0, x1) => add_('coral-stitch', P.indigo, (o) => coral(o, line(y, x0, x1), 2.4)) },
    { h: 2.6, draw: (y, x0, x1) => add_('seed-stitch', P.ochre, (o) =>
      seeds(o, v((x0 + x1) / 2, y), (x1 - x0) / 2, Math.round(((x1 - x0) / 2.2) * 1.3), 1.1, 5, 2.2, (p) => Math.abs(p.y - y) < 0.85)) },
  ];

  const total = bands.reduce((s, b) => s + b.h, 0) + GAP * (bands.length - 1);
  let y = -total / 2;
  for (const b of bands) {
    const edge = Math.max(Math.abs(y), Math.abs(y + b.h));
    const half = Math.sqrt(Math.max(0, RC * RC - edge * edge)) - 1.2;
    b.draw(y + b.h / 2, -half, half);
    y += b.h + GAP;
  }
  return m;
}

export function mountHero() {
  const el = document.querySelector<HTMLCanvasElement>('canvas.sampler');
  if (el) new Hero(el);
}

class Hero {
  private scene: Scene;
  private motifs: Motif[];
  private dur = 0;
  private t = 0;
  private baked: HTMLCanvasElement | null = null;
  private done = new Set<Motif>();
  private raf = 0;
  private last = 0;
  private hover: Motif | null = null;
  /** Motifs in the spotlight; kept after the pointer leaves so the dim can fade out. */
  private lit: Motif[] = [];
  private fade = 0;
  private spot: HTMLCanvasElement | null = null;
  private tip: HTMLElement;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private numbers = new Map(STITCHES.map((s, i) => [s.slug, { n: i + 1, name: s.name }]));

  constructor(el: HTMLCanvasElement) {
    this.scene = new Scene(el, { mode: 'hoop', R: 50, pitch: 1.05 });
    this.tip = el.parentElement!.querySelector<HTMLElement>('.tip')!;
    this.motifs = compose();
    /** Every band starts together and takes this long, so the whole sampler fills in one pass. */
    const D = 5;
    for (const mo of this.motifs) {
      const d0 = compile(mo.ops, { th: mo.th, fast: 0.1 }).dur;
      mo.prog = compile(mo.ops, { th: mo.th, fast: (0.1 * D) / d0 });
      mo.t0 = 0;
      mo.pts = mo.prog.holes.map((h) => h.p);
      this.dur = Math.max(this.dur, mo.t0 + mo.prog.dur);
    }
    if (this.reduce) this.t = this.dur + 1;
    new ResizeObserver(() => {
      if (!this.scene.resize()) return;
      this.baked = null;
      this.done.clear();
      this.draw();
    }).observe(el);
    el.addEventListener('pointermove', (e) => this.point(e));
    el.addEventListener('pointerleave', () => this.setHover(null));
    el.addEventListener('click', () => {
      if (this.hover) location.href = `/stitches/${this.hover.slug}/`;
    });
    document.querySelector('[data-replay]')?.addEventListener('click', () => {
      this.t = 0;
      this.baked = null;
      this.done.clear();
      this.start();
    });
    new IntersectionObserver(([e]) => (e.isIntersecting ? this.start() : this.stop()), { threshold: 0.2 }).observe(el);
  }

  private start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.t <= this.dur + 0.1) this.t += dt;
    const goal = this.hover ? 1 : 0;
    this.fade = this.reduce ? goal : goal > this.fade ? Math.min(goal, this.fade + dt / 0.16) : Math.max(goal, this.fade - dt / 0.24);
    this.draw();
    this.raf = this.t <= this.dur + 0.1 || this.fade !== goal ? requestAnimationFrame(this.loop) : 0;
  };

  private draw() {
    const live = [];
    for (const mo of this.motifs) {
      const lt = this.t - mo.t0!;
      if (lt < 0) continue;
      if (lt >= mo.prog!.dur) {
        if (!this.done.has(mo)) {
          this.baked = this.scene.bake([frameAt(mo.prog!, mo.prog!.dur + 1)], this.baked ?? undefined);
          this.done.add(mo);
        }
        continue;
      }
      live.push(bare(frameAt(mo.prog!, lt)));
    }
    this.scene.draw(live, {
      side: 'front',
      base: this.baked ?? undefined,
      after: this.fade > 0 ? (g) => this.spotlight(g) : undefined,
    });
  }

  /** Veils the cloth in linen, then repaints the lit motifs on top so everything else recedes. */
  private spotlight(g: CanvasRenderingContext2D) {
    const { W, H, cx, cy, s } = this.scene;
    const spot = (this.spot ??= document.createElement('canvas'));
    if (spot.width !== W || spot.height !== H) {
      spot.width = W;
      spot.height = H;
    }
    spot.getContext('2d')!.clearRect(0, 0, W, H);
    const frames = this.lit.filter((mo) => this.t >= mo.t0!).map((mo) => bare(frameAt(mo.prog!, Math.min(this.t - mo.t0!, mo.prog!.dur + 1))));
    this.scene.bake(frames, spot);
    g.save();
    g.globalAlpha = this.fade * 0.7;
    g.fillStyle = '#efe4ca';
    g.beginPath();
    g.arc(cx, cy, this.scene.o.R * 1.02 * s, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = this.fade;
    g.drawImage(spot, 0, 0);
    g.restore();
  }

  private point(e: PointerEvent) {
    const r = this.scene.el.getBoundingClientRect();
    const dpr = this.scene.W / r.width;
    const p = this.scene.fabric(v((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr), 'front');
    let best: Motif | null = null;
    let bd = 3.2;
    for (const mo of this.motifs) {
      if (this.t < mo.t0! + mo.prog!.dur * 0.3) continue;
      for (const q of mo.pts!) {
        const d = dist(p, q);
        if (d < bd) { bd = d; best = mo; }
      }
    }
    this.setHover(best, e.clientX - r.left, e.clientY - r.top);
  }

  private setHover(mo: Motif | null, x = 0, y = 0) {
    const changed = mo !== this.hover;
    this.hover = mo;
    if (mo) this.lit = this.motifs.filter((m) => m.slug === mo.slug);
    this.scene.el.style.cursor = mo ? 'pointer' : '';
    if (mo) {
      const info = this.numbers.get(mo.slug)!;
      this.tip.innerHTML = `<span class="num">${String(info.n).padStart(2, '0')}</span> ${info.name}`;
      this.tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    }
    this.tip.toggleAttribute('data-on', !!mo);
    if (changed) this.start();
  }
}

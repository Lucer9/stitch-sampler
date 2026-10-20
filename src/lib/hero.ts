import { compile, frameAt, type Op, type Program, type Thread } from './engine.ts';
import { Scene } from './render.ts';
import {
  T, track, curve, running, back, split, stem, whipped, couch, chain, daisy, fly, feather, blanket, cretan,
  crossCells, herringbone, satin, fan, fishbone, seeds, knot, bullion, pistil, fourLegged, coral, wheel, STITCHES,
} from './stitches.ts';
import { type V, v, add, sub, mul, polar, rot, dist, norm, perp, rng } from './geom.ts';

const W = 1.25;
const deg = (d: number) => (d * Math.PI) / 180;
const onRing = (r: number, d: number) => polar(r, deg(d));
const arc = (r: number, d0: number, d1: number, n = 24) => Array.from({ length: n + 1 }, (_, i) => onRing(r, d0 + ((d1 - d0) * i) / n));
const leaf = (max: number, pow = 0.8) => (t: number) => max * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** pow;
const out = (d: number) => norm(onRing(1, d));

interface Motif { slug: string; ops: Op[]; th: Thread; prog?: Program; t0?: number; pts?: V[] }

function compose(): Motif[] {
  const m: Motif[] = [];
  const add_ = (slug: string, th: Thread, build: (o: Op[]) => void) => {
    const o: Op[] = [];
    build(o);
    m.push({ slug, ops: o, th });
  };
  const VR = 29;

  add_('stem-stitch', T('#557a3f', W), (o) => stem(o, curve(arc(VR, 100, 268, 12)), 3.2, 0.32));
  add_('whipped-running-stitch', T('#4c7044', W), (o) => whipped(o, curve(arc(VR, 80, -88, 12)), 2.6, 1.1, T('#b9a04f', 1), 1.25));

  add_('lazy-daisy', T('#5b86b8', W), (o) => {
    for (let k = 0; k < 6; k++) daisy(o, onRing(VR, -90), deg(-90 + k * 60), 1.7, 6.6, 0.36);
  });
  add_('french-knot', T('#d09a2c', W), (o) => {
    [v(-0.9, -0.6), v(1, -0.4), v(0, 0.95)].forEach((d) => knot(o, add(onRing(VR, -90), d), W));
  });

  add_('woven-wheel', T('#c4566a', W), (o) => wheel(o, onRing(VR, 212), 6.4, W, 5, deg(-80)));
  add_('woven-wheel', T('#d98a94', W), (o) => wheel(o, onRing(VR, -28), 5, W, 5, deg(-100)));

  add_('long-and-short-stitch', T('#e9a19a', W), (o) => {
    const base = onRing(VR + 2.6, 243);
    const c = add(base, mul(out(243), 1.2));
    const dir = deg(243);
    const R0 = 8.8;
    const r = rng(12);
    fan(o, c, dir - 0.62, dir + 0.62, 11, (k) => R0 - (k % 2 ? 2.9 : 4.7), () => R0);
    fan(o, c, dir - 0.6, dir + 0.6, 9, () => R0 - 7.6 - r() * 0.8, () => R0 - 3 - r() * 1.2, T('#cf6470', W));
    fan(o, c, dir - 0.55, dir + 0.55, 6, () => R0 - 10.4 + r() * 0.4, () => R0 - 6.5 - r(), T('#8f2e45', W));
  });
  add_('split-stitch', T('#5f803c', W), (o) => split(o, curve([onRing(VR, 246), onRing(VR + 1.8, 244.5), onRing(VR + 3.6, 243)]), 2.2));

  add_('back-stitch', T('#3f5f35', W), (o) => {
    for (const [a, len] of [[-64, 7], [-56, 8.6], [-48, 6.6]] as const) back(o, curve([onRing(VR, a + 4), add(onRing(VR, a + 4), mul(out(a), len * 0.5)), add(onRing(VR, a), mul(out(a), len))]), 2.4);
  });
  add_('bullion-knot', T('#b8455b', W), (o) => {
    for (const [a, len] of [[-64, 7], [-56, 8.6], [-48, 6.6]] as const) {
      const tip = add(onRing(VR, a), mul(out(a), len));
      const d = out(a);
      bullion(o, sub(tip, mul(perp(d), 0.85)), add(add(tip, mul(d, 3.8)), mul(perp(d), 0.85)), 5);
      bullion(o, add(tip, mul(perp(d), 0.85)), sub(add(tip, mul(d, 3.8)), mul(perp(d), 0.85)), 5);
    }
  });

  add_('pistil-stitch', T('#7a3b66', W), (o) => {
    const c = onRing(VR - 1.2, 0);
    for (let k = 0; k < 7; k++) pistil(o, c, deg(180 + (k - 3) * 16), 1.2, 7);
  });
  add_('colonial-knot', T('#a8332a', W), (o) => {
    const c = onRing(35.5, 13);
    [v(0, 0), v(2.6, 0.6), v(1, 2.5), v(-1.6, 1.8), v(3.4, 3), v(0.8, -2.3)].forEach((d) => knot(o, add(c, d), W, 2, 'colonial'));
  });

  add_('fishbone-stitch', T('#5f803c', W), (o) => {
    const a = onRing(VR, 33);
    const dir = rot(out(33), deg(-28));
    fishbone(o, curve([add(a, mul(dir, 11.5)), add(add(a, mul(dir, 6)), mul(perp(dir), 0.7)), a]), leaf(3.2), 8, W);
  });
  add_('fly-stitch', T('#4f7a4a', W), (o) => {
    const p0 = onRing(VR, 62);
    const u = rot(out(62), deg(18));
    const n = perp(u);
    for (let k = 0; k < 4; k++) {
      const s = 2.6 + k * 2.6;
      const wd = 3.4 - k * 0.55;
      fly(o, add(add(p0, mul(u, s + 1.9)), mul(n, -wd)), add(add(p0, mul(u, s + 1.9)), mul(n, wd)), add(p0, mul(u, s)), add(p0, mul(u, s - 1.4)));
    }
  });
  add_('cretan-stitch', T('#6f8f3a', W), (o) => {
    const a = onRing(VR, 114);
    const dir = rot(out(114), deg(52));
    cretan(o, curve([a, add(add(a, mul(dir, 5)), mul(perp(dir), -0.8)), add(a, mul(dir, 10.5))]), 8, leaf(3.3), 0.65);
  });
  add_('feather-stitch', T('#3f6f6a', W), (o) => {
    const u = out(150);
    feather(o, add(onRing(VR, 150), mul(perp(u), -0.6)), u, perp(u), 3.2, 2.3, 5);
  });
  add_('satin-stitch', T('#7c9a48', W), (o) => {
    const a = onRing(VR, 182);
    const dir = rot(out(182), deg(-32));
    const P = track(curve([a, add(add(a, mul(dir, 6)), mul(perp(dir), 0.8)), add(a, mul(dir, 12))]));
    const hw = leaf(3.3, 0.75);
    const sl = 0.1;
    satin(o, (t) => add(P.p(t * P.L), mul(P.n(t * P.L), hw(t))), (t) => sub(P.p((t + sl) * P.L), mul(P.n((t + sl) * P.L), hw(t + sl))), 13, 0.03, 0.97 - sl);
  });

  add_('cross-stitch', T('#b0372c', W), (o) => crossCells(o, v(-6.5, -9.5), 2.6, ['.X.X.', 'XXXXX', '.XXX.', '..X..']));
  add_('herringbone-stitch', T('#2c4777', W), (o) => herringbone(o, v(-9.6, 4.6), 3.4, 3.1, 1.05, 7));
  add_('seed-stitch', T('#c58b22', W), (o) => seeds(o, v(0, -2), 16, 22, 1.6, 4, 3.2, (p) => {
    const d = dist(p, v(0, -3));
    return d > 9.5 && p.y < 2;
  }));

  add_('couching', T('#c79a35', 2), (o) =>
    couch(o, curve([v(-6, 39), v(-2.4, 33.5), v(0, 29.5), v(-5, 25.5), v(-8.6, 28.2), v(-5.4, 31.8), v(0, 29.5), v(5.4, 25.5), v(8.6, 28.2), v(5.4, 31.8), v(0, 29.5), v(2.4, 33.5), v(6, 39)]), T('#c79a35', 2), T('#a8382b', 0.8), 4.2),
  );
  add_('running-stitch', T('#a8382b', W), (o) => running(o, curve(arc(44.6, -146, -34, 30)), 2.5, 1.6));
  add_('blanket-stitch', T('#2c4777', W), (o) => blanket(o, curve(arc(44.6, 146, 34, 30)), 2.6, 2.2, -1));
  add_('chain-stitch', T('#2f6d70', W), (o) => chain(o, curve([onRing(41, -30), onRing(41.6, -17), onRing(40.8, -4), v(36.8, -1.8), v(35, -5.6), v(37.4, -7.6)]), 2.6, 0.32));
  add_('coral-stitch', T('#b65a2a', W), (o) => coral(o, curve([onRing(41, 156), onRing(41.6, 172), onRing(41, 188), v(-35.4, -10.4), v(-33.4, -6.8), v(-35.8, -4.8)]), 2.6));
  add_('four-legged-knot', T('#2c6d70', W), (o) => {
    for (const p of [onRing(38.5, -153), onRing(37.5, -38), onRing(17, 52), onRing(16, 152)]) fourLegged(o, p, 1.7);
  });
  return m;
}

const ORDER = [
  'stem-stitch', 'whipped-running-stitch', 'lazy-daisy', 'woven-wheel', 'split-stitch', 'long-and-short-stitch', 'back-stitch',
  'fishbone-stitch', 'satin-stitch', 'french-knot', 'bullion-knot', 'cretan-stitch', 'fly-stitch', 'feather-stitch', 'pistil-stitch',
  'cross-stitch', 'colonial-knot', 'herringbone-stitch', 'couching', 'running-stitch', 'blanket-stitch', 'chain-stitch', 'coral-stitch',
  'seed-stitch', 'four-legged-knot',
];

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
  private tip: HTMLElement;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private numbers = new Map(STITCHES.map((s, i) => [s.slug, { n: i + 1, name: s.name }]));

  constructor(el: HTMLCanvasElement) {
    this.scene = new Scene(el, { mode: 'hoop', R: 50, pitch: 1.05 });
    this.tip = el.parentElement!.querySelector<HTMLElement>('.tip')!;
    this.motifs = compose().sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
    const tracks = [0, 0.35, 0.7, 1.05];
    for (const mo of this.motifs) {
      mo.prog = compile(mo.ops, { th: mo.th, needle: W * 7, slow: 0, fast: 0.3 });
      const k = tracks.indexOf(Math.min(...tracks));
      mo.t0 = tracks[k];
      tracks[k] += mo.prog.dur * 0.85;
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
    this.t += Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.draw();
    this.raf = this.t <= this.dur + 0.1 ? requestAnimationFrame(this.loop) : 0;
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
      live.push(frameAt(mo.prog!, lt));
    }
    const h = this.hover;
    this.scene.draw(live, {
      side: 'front',
      base: this.baked ?? undefined,
      after: h ? (g) => this.ring(g, h) : undefined,
    });
  }

  private ring(g: CanvasRenderingContext2D, mo: Motif) {
    const pts = mo.pts!.map((p) => this.scene.screen(p, 'front'));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + this.scene.s * 2.4;
    const ry = (Math.max(...ys) - Math.min(...ys)) / 2 + this.scene.s * 2.4;
    g.save();
    g.setLineDash([this.scene.s * 1.1, this.scene.s * 0.9]);
    g.lineWidth = this.scene.s * 0.42;
    g.strokeStyle = 'rgba(255,252,245,0.95)';
    g.shadowColor = 'rgba(60,35,10,0.35)';
    g.shadowBlur = this.scene.s;
    g.beginPath();
    g.ellipse(cx, cy, Math.min(rx, this.scene.s * 30), Math.min(ry, this.scene.s * 30), 0, 0, Math.PI * 2);
    g.stroke();
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
    this.scene.el.style.cursor = mo ? 'pointer' : '';
    if (mo) {
      const info = this.numbers.get(mo.slug)!;
      this.tip.innerHTML = `<span class="num">${String(info.n).padStart(2, '0')}</span> ${info.name}`;
      this.tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    }
    this.tip.toggleAttribute('data-on', !!mo);
    if (changed && !this.raf) this.draw();
  }
}

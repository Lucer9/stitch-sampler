import type { Op, Thread } from './engine.ts';
import {
  T, track, curve, running, back, split, stem, whipped, couch, chain, coral, blanket, feather, cretan, herringbone, fly,
  satin, satinFill, longShortFill, seeds, fishbone, knot, fourLegged, daisy, pistil, wheel, bullion, inside, bySlug,
} from './stitches.ts';
import { type Part, type Project, ring, closed, leafW, leafLine } from './projects.ts';
import { type V, v, add, sub, mul, norm, perp, dist, dot, lerp, polar } from './geom.ts';

type P = number[];
/** One part of a design as Claude returns it (see SCHEMA in worker.ts). */
export interface AIPart {
  stitch: string; color: string; colorName: string; color2?: string; step: string; why: string;
  /** 1 behind (ground, stems), 2 main fills, 3 shading, highlights and outlines, 4 knots and details on top. */
  layer?: number;
  paths?: P[][]; shapes?: P[][]; angle?: number; angles?: number[]; size?: number; points?: P[];
  leaves?: { base: P; tip: P; width: number }[];
  flowers?: { center: P; petals: number; length: number }[];
  loops?: { from: P; to: P }[];
  circles?: { center: P; r: number }[];
  bars?: { from: P; to: P }[];
}
export interface AIDesign { name: string; blurb: string; note: string; level: number; parts: AIPart[] }

const W = 1.3;
/** Designs stay this far inside the hoop. */
const REACH = 26;
const clamp = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const deg = (d: number) => (d * Math.PI) / 180;
const hex = (c: unknown, d: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
const up = (p: V): Op => ({ k: 'up', p });
const down = (p: V): Op => ({ k: 'down', p });

/** A point from the design, pulled inside the hoop; null if it is not a pair of numbers. */
function pt(a: unknown): V | null {
  if (!Array.isArray(a) || a.length < 2 || !a.slice(0, 2).every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const p = v(a[0], a[1]);
  const r = Math.hypot(p.x, p.y);
  return r > REACH ? mul(p, REACH / r) : p;
}
const pts = (a: unknown, max = 40): V[] => (Array.isArray(a) ? a.slice(0, max).map(pt).filter((p): p is V => !!p) : []);
const list = <X>(a: X[] | undefined, max = 16): X[] => (Array.isArray(a) ? a.slice(0, max) : []);
/** Points closer than `gap` to an earlier one are dropped, so knots never pile up. */
const spaced = (ps: V[], gap: number) => ps.filter((p, i) => ps.slice(0, i).every((q) => dist(p, q) >= gap));
const smooth = (ps: V[]) => (ps.length > 2 ? curve(ps) : ps);
/** `hex` darkened (k < 1) or lightened (k > 1). */
const shade = (hex: string, k: number) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const f = (x: number) => Math.round(k < 1 ? x * k : x + (255 - x) * (k - 1)).toString(16).padStart(2, '0');
  return `#${c.map(f).join('')}`;
};
/** Line stitches, worked in fewer strands when they outline or detail a fill. */
const LINES = ['running-stitch', 'back-stitch', 'split-stitch', 'stem-stitch', 'chain-stitch', 'whipped-running-stitch'];
/** Longest satin stitch before a fill switches to long and short. */
const SATIN_MAX = 12;
/** How long satin stitches across `poly` would be at `ang`. */
const span = (poly: V[], ang: number) => {
  const u = polar(1, ang);
  const ds = poly.map((p) => dot(p, u));
  return Math.max(...ds) - Math.min(...ds);
};

/** The moves and pattern lines for one part, or null if nothing in it can be stitched. */
function build(a: AIPart, th: Thread): { make: (o: Op[]) => void; outline?: V[][] } | null {
  const c2 = hex(a.color2, '#a8382b');
  const lines = list(a.paths).map((p) => smooth(pts(p, 12))).filter((p) => p.length >= 2);
  const polys = list(a.shapes).map((p) => pts(p)).filter((p) => p.length >= 3);
  const angle = deg(clamp(a.angle, -360, 360, 90));
  const angleOf = (k: number) => (Array.isArray(a.angles) && typeof a.angles[k] === 'number' ? deg(clamp(a.angles[k], -360, 360, 90)) : angle);
  const each = <X>(xs: X[], f: (o: Op[], x: X) => void, outline?: V[][]) => (xs.length ? { make: (o: Op[]) => xs.forEach((x) => f(o, x)), outline } : null);
  switch (a.stitch) {
    case 'running-stitch': return each(lines, (o, p) => running(o, p, 2.2, 1.4), lines);
    case 'back-stitch': return each(lines, (o, p) => back(o, p, 2), lines);
    case 'split-stitch': return each(lines, (o, p) => split(o, p, 2), lines);
    case 'stem-stitch': return each(lines, (o, p) => stem(o, p, 2.4, 0.28), lines);
    case 'whipped-running-stitch': return each(lines, (o, p) => whipped(o, p, 2.4, 1, T(c2, W * 0.7), 1.25), lines);
    case 'chain-stitch': return each(lines, (o, p) => chain(o, p, 2.6, 0.42), lines);
    case 'coral-stitch': return each(lines, (o, p) => coral(o, p, 2.4), lines);
    case 'couching': return each(lines, (o, p) => couch(o, p, T(th.color, W * 1.4), T(c2, W * 0.5), 3), lines);
    case 'blanket-stitch': return each(lines, (o, p) => blanket(o, p, 2.2, 1.8, -1), lines);
    case 'cretan-stitch': return each(lines, (o, p) => cretan(o, p, Math.max(3, Math.round(track(p).L / 2.1)), () => 2, 0.45), lines);
    case 'feather-stitch': return each(lines, (o, p) => {
      const u = norm(sub(p[p.length - 1], p[0]));
      feather(o, add(p[0], mul(perp(u), -0.7)), u, perp(u), 2.8, 2.2, Math.max(2, Math.floor(track(p).L / 2.2)));
    }, lines);
    case 'herringbone-stitch': return each(lines, (o, p) => {
      const x0 = Math.min(...p.map((q) => q.x));
      const y = p.reduce((s, q) => s + q.y, 0) / p.length;
      herringbone(o, v(x0, y), 2.8, 3, 1, Math.max(2, Math.floor((track(p).L - 1) / 2)));
    }, lines);
    case 'fly-stitch': return each(lines, (o, p) => {
      const P = track(p);
      for (let s = 1.6; s < P.L - 1; s += 2.4) {
        const u = P.d(s);
        const n = perp(u);
        const wd = 2.6 * (1 - (0.5 * s) / P.L);
        const at = P.p(s);
        fly(o, add(add(at, mul(u, 1.9)), mul(n, -wd)), add(add(at, mul(u, 1.9)), mul(n, wd)), at, sub(at, mul(u, 1.2)));
      }
    }, lines);
    case 'satin-stitch': {
      const leaves = list(a.leaves).map((l) => ({ b: pt(l.base), t: pt(l.tip), w: clamp(l.width, 1, 8, 3) })).filter((l) => l.b && l.t);
      if (!polys.length && !leaves.length) return null;
      return {
        make: (o) => {
          polys.forEach((poly, k) => {
            const ang = angleOf(k);
            if (span(poly, ang) > SATIN_MAX) longShortFill(o, poly, ang, 0.85, th, T(shade(th.color, 0.8), W));
            else satinFill(o, poly, ang, 0.85);
          });
          leaves.forEach(({ b, t, w }) => {
            const A = track(curve([b!, add(lerp(b!, t!, 0.5), mul(perp(norm(sub(t!, b!))), 0.4)), t!]));
            const hw = leafW(w / 2);
            const sl = 0.1;
            satin(o, (s) => add(A.p(s * A.L), mul(A.n(s * A.L), hw(s))), (s) => sub(A.p((s + sl) * A.L), mul(A.n((s + sl) * A.L), hw(s + sl))), Math.max(5, Math.round(A.L / 0.9)), 0.03, 0.97 - sl);
          });
        },
        outline: [...polys.map(closed), ...leaves.map(({ b, t, w }) => leafLine(curve([b!, lerp(b!, t!, 0.5), t!]), leafW(w / 2)))],
      };
    }
    case 'long-and-short-stitch': {
      const dark = T(a.color2 ? c2 : shade(th.color, 0.78), W);
      return polys.length ? { make: (o) => polys.forEach((poly, k) => longShortFill(o, poly, angleOf(k), 0.85, th, dark)), outline: polys.map(closed) } : null;
    }
    case 'seed-stitch': return each(polys, (o, poly) => {
      const c = mul(poly.reduce((s, q) => add(s, q), v(0, 0)), 1 / poly.length);
      const r = Math.max(...poly.map((q) => dist(q, c)));
      seeds(o, c, r, Math.min(60, Math.max(6, Math.round((r * r) / 4))), 1.2, 7, 2.1, (q) => inside(poly, q));
    }, []);
    case 'fishbone-stitch': {
      const leaves = list(a.leaves).map((l) => ({ b: pt(l.base), t: pt(l.tip), w: clamp(l.width, 1.5, 8, 4) })).filter((l) => l.b && l.t);
      const axes = leaves.map(({ b, t }) => curve([t!, add(lerp(b!, t!, 0.5), mul(perp(norm(sub(t!, b!))), 0.5)), b!]));
      return each(axes, (o, ax) => {
        const w = leaves[axes.indexOf(ax)].w;
        fishbone(o, ax, leafW(w / 2), Math.min(12, Math.max(4, Math.round(track(ax).L / 1.1))), W);
      }, axes.map((ax, k) => leafLine(ax, leafW(leaves[k].w / 2))));
    }
    case 'french-knot': return each(spaced(pts(a.points), 2.2), (o, p) => knot(o, p, W));
    case 'colonial-knot': return each(spaced(pts(a.points), 2.4), (o, p) => knot(o, p, W, 2, 'colonial'));
    case 'four-legged-knot': return each(spaced(pts(a.points), 3), (o, p) => fourLegged(o, p, clamp(a.size, 1, 3, 1.6)));
    case 'cross-stitch': {
      const s = clamp(a.size, 1.4, 4, 2.4) / 2;
      return each(spaced(pts(a.points, 80), s * 1.6), (o, p) => o.push(up(add(p, v(-s, s))), down(add(p, v(s, -s))), up(add(p, v(s, s))), down(add(p, v(-s, -s)))));
    }
    case 'lazy-daisy': {
      const flowers = list(a.flowers).map((f) => ({ c: pt(f.center), n: Math.round(clamp(f.petals, 3, 9, 5)), len: clamp(f.length, 1.5, 7, 3) })).filter((f) => f.c);
      const loops = list(a.loops, 24).map((l) => ({ f: pt(l.from), t: pt(l.to) })).filter((l) => l.f && l.t && dist(l.f, l.t) > 1);
      if (!flowers.length && !loops.length) return null;
      return {
        make: (o) => {
          flowers.forEach(({ c, n, len }) => {
            for (let k = 0; k < n; k++) daisy(o, c!, deg(-90 + (k * 360) / n), 0.9, len, 0.45, 0.5);
          });
          loops.forEach(({ f, t }) => daisy(o, f!, Math.atan2(t!.y - f!.y, t!.x - f!.x), 0, Math.min(8, dist(f!, t!)), 0.45, 0.5));
        },
      };
    }
    case 'pistil-stitch': {
      const flowers = list(a.flowers).map((f) => ({ c: pt(f.center), n: Math.round(clamp(f.petals, 3, 12, 6)), len: clamp(f.length, 1.5, 7, 3) })).filter((f) => f.c);
      return each(flowers, (o, { c, n, len }) => {
        for (let k = 0; k < n; k++) pistil(o, c!, deg(-90 + (k * 360) / n), 0.6, len);
      });
    }
    case 'woven-wheel': {
      const cs = list(a.circles).map((c) => ({ c: pt(c.center), r: clamp(c.r, 2.2, 8, 4) })).filter((c) => c.c);
      return each(cs, (o, { c, r }) => wheel(o, c!, r, W, 5), cs.map(({ c, r }) => ring(c!, r * 0.72)));
    }
    case 'bullion-knot': {
      const bars = list(a.bars, 24).map((b) => ({ f: pt(b.from), t: pt(b.to) })).filter((b) => b.f && b.t && dist(b.f, b.t) > 1.2);
      return each(bars, (o, { f, t }) => {
        const to = dist(f!, t!) > 7 ? add(f!, mul(norm(sub(t!, f!)), 7)) : t!;
        bullion(o, f!, to, Math.min(14, Math.max(4, Math.round(dist(f!, to) / 0.55))));
      });
    }
  }
  return null;
}

/** A design from Claude as a guided project, parts in layer order, with each kept part's reason. Throws if nothing in it can be stitched. */
export function fromAI(d: AIDesign): { project: Project; why: { stitch: string; name: string; why: string; color: string }[] } {
  const parts: Part[] = [];
  const why: { stitch: string; name: string; why: string; color: string }[] = [];
  const layer = (a: AIPart) => (typeof a?.layer === 'number' ? clamp(Math.round(a.layer), 1, 4, 2) : 2);
  const ordered = list(d.parts, 10).map((a, i) => ({ a, i })).sort((x, y) => layer(x.a) - layer(y.a) || x.i - y.i).map((x) => x.a);
  for (const a of ordered) {
    if (!a || typeof a.stitch !== 'string' || !bySlug(a.stitch)) continue;
    const color = hex(a.color, '#7a5c3e');
    const b = build(a, T(color, W));
    if (!b) continue;
    const name = typeof a.colorName === 'string' && a.colorName ? a.colorName.slice(0, 30) : 'Floss';
    parts.push({
      stitch: a.stitch,
      floss: [name, color],
      weight: layer(a) >= 3 && LINES.includes(a.stitch) ? 0.7 : 1,
      also: a.color2 && ['whipped-running-stitch', 'couching', 'long-and-short-stitch'].includes(a.stitch) ? [['Second colour', hex(a.color2, '#a8382b')]] : undefined,
      step: typeof a.step === 'string' && a.step ? a.step.slice(0, 220) : `Work the ${bySlug(a.stitch).name.toLowerCase()}.`,
      make: (o) => b.make(o),
      outline: b.outline,
    });
    why.push({ stitch: a.stitch, name: bySlug(a.stitch).name, why: typeof a.why === 'string' ? a.why.slice(0, 200) : '', color });
  }
  if (!parts.length) throw new Error('Nothing in that design could be stitched.');
  const level = d.level === 1 || d.level === 2 || d.level === 3 ? d.level : 2;
  return {
    project: {
      slug: 'your-design',
      name: typeof d.name === 'string' && d.name ? d.name.slice(0, 40) : 'Your design',
      level,
      blurb: typeof d.blurb === 'string' ? d.blurb.slice(0, 240) : '',
      R: 31,
      parts,
    },
    why,
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const xy = (p: V): number[] => [r1(p.x), r1(p.y)];
/** A lemon: an ellipse with pointed ends, `n` points, turned `rot` degrees about `c`. */
function lemon(c: V, a: number, b: number, rot: number, n = 28): number[][] {
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    const x = a * Math.cos(t) + 2.4 * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 14;
    const p = v(x, b * Math.sin(t));
    const r = deg(rot);
    return xy(add(c, v(p.x * Math.cos(r) - p.y * Math.sin(r), p.x * Math.sin(r) + p.y * Math.cos(r))));
  });
}

/** A worked example of a good design, shown to Claude in the system prompt and run by the self-check. */
export const SAMPLE: AIDesign = (() => {
  const body = lemon(v(3, 5), 12.5, 8.5, 25);
  const shine = lemon(v(-0.5, 0.6), 5, 1.6, 25, 14);
  return {
    name: 'Lemon branch',
    blurb: 'A ripe lemon on a leafy twig, with a blossom and a few sparkles.',
    note: '',
    level: 2,
    parts: [
      { stitch: 'stem-stitch', layer: 1, color: '#6f5a3c', colorName: 'Twig brown', step: 'Stem stitch the twig down to the top tip of the lemon.', why: 'A twisted, rope-like line reads as bark.', paths: [[[-24, -15], [-17, -11.5], [-12.5, -6], [-10.5, -1.8]]] },
      { stitch: 'fishbone-stitch', layer: 2, color: '#55733a', colorName: 'Leaf green', step: 'Fishbone stitch two leaves off the twig, each stitch crossing just past the centre.', why: 'It fills a leaf and draws its centre vein in one go.', leaves: [{ base: [-17, -11.5], tip: [-22, -23], width: 6.5 }, { base: [-13.2, -7.5], tip: [-4, -15.5], width: 6 }] },
      { stitch: 'long-and-short-stitch', layer: 2, color: '#f3d462', colorName: 'Lemon', color2: '#d9a830', step: 'Long and short across the lemon: pale lemon from the top edge, deeper lemon underneath.', why: 'Two shades blend so the fruit looks round, and the area is too big for satin.', shapes: [body], angle: 65 },
      { stitch: 'satin-stitch', layer: 3, color: '#fbf0bd', colorName: 'Butter', step: 'A small satin highlight on the upper left, where the light hits.', why: 'A pale glossy patch makes the skin shine.', shapes: [shine], angles: [65] },
      { stitch: 'stem-stitch', layer: 3, color: '#b98a2c', colorName: 'Ochre', step: 'Outline the lemon in stem stitch, on top of the fill.', why: 'A darker outline crisps the edge of the fill.', paths: [[...body, body[0]]] },
      { stitch: 'lazy-daisy', layer: 2, color: '#f8f4ea', colorName: 'White', step: 'A five-petal lazy daisy blossom by the twig.', why: 'One stitch per petal makes a quick, plump flower.', flowers: [{ center: [-23, 3], petals: 5, length: 3.4 }] },
      { stitch: 'french-knot', layer: 4, color: '#e2b23c', colorName: 'Gold', step: 'A French knot in the middle of the blossom.', why: 'A raised dot for the flower centre.', points: [[-23, 3]] },
      { stitch: 'four-legged-knot', layer: 4, color: '#c79a35', colorName: 'Antique gold', step: 'Scatter three four-legged knots as sparkles.', why: 'A cross with a knot on top reads as a little star.', points: [[14, -14], [20, -7], [-14, 15]], size: 1.4 },
    ],
  };
})();

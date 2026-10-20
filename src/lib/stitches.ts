import type { Op, Thread, Under } from './engine.ts';
import { type V, v, add, sub, mul, lerp, dist, dot, perp, polar, rng, spline, lengths, at } from './geom.ts';

export type Family = 'Lines' | 'Loops' | 'Crossed' | 'Fills' | 'Knots';
export const FAMILIES: { name: Family; blurb: string }[] = [
  { name: 'Lines', blurb: 'Outlines, stems and lettering. Start here.' },
  { name: 'Loops', blurb: 'The thread catches itself to make chains, petals and edges.' },
  { name: 'Crossed', blurb: 'Diagonals that cross, for counted work and bands.' },
  { name: 'Fills', blurb: 'Stitches that cover an area: smooth, shaded, speckled or raised.' },
  { name: 'Knots', blurb: 'Thread wrapped around the needle, for dots and raised texture.' },
];

export interface Demo { ops: Op[]; th: Thread; slow?: number; fast?: number }
export interface Stitch {
  slug: string;
  name: string;
  family: Family;
  level: 1 | 2 | 3;
  aka?: string;
  use: string;
  steps: string[];
  tip: string;
  watch: string;
  /** Three things the stitch is good for: a short name and one sentence. */
  good: [string, string][];
  knot?: boolean;
  /** Hoop radius for the player, in fabric units: smaller zooms in. */
  R?: number;
  demo: () => Demo;
}

export const T = (color: string, width = 2.2): Thread => ({ color, width });
export const C = {
  madder: '#b0372c',
  indigo: '#2c4777',
  plum: '#76375e',
  sage: '#4f6f3a',
  moss: '#6a8431',
  teal: '#2c6d70',
  ochre: '#c58b22',
  gold: '#c79a35',
  rose: '#c4566a',
  rust: '#b65a2a',
  blush: '#e09a96',
  pink: '#c9606a',
  wine: '#842c40',
  sky: '#5b86b8',
  leaf: '#7f9a46',
};

const up = (p: V, x: Partial<Extract<Op, { k: 'up' }>> = {}): Op => ({ k: 'up', p, ...x });
const down = (p: V, x: Partial<Extract<Op, { k: 'down' }>> = {}): Op => ({ k: 'down', p, ...x });

function caps(ops: Op[], map: Record<number, number | number[]>): Op[] {
  for (const [i, c] of Object.entries(map)) if (ops[+i]) ops[+i].cap = c;
  return ops;
}

export function track(path: V[]) {
  const acc = lengths(path);
  const L = acc[acc.length - 1];
  return {
    L,
    p: (s: number) => at(path, s / L, acc).p,
    n: (s: number) => perp(at(path, s / L, acc).d),
    d: (s: number) => at(path, s / L, acc).d,
  };
}

export const curve = (pts: V[]) => spline(pts, 16);
export const wave = (x0: number, x1: number, y: number, amp: number) =>
  curve([v(x0, y), v(mix(x0, x1, 0.25), y - amp), v(mix(x0, x1, 0.5), y), v(mix(x0, x1, 0.75), y + amp), v(x1, y)]);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function running(o: Op[], path: V[], st: number, gap: number): number[] {
  const P = track(path);
  const refs: number[] = [];
  for (let s = 0; s + st <= P.L + 0.01; s += st + gap) {
    o.push(up(P.p(s)));
    refs.push(o.length);
    o.push(down(P.p(s + st)));
  }
  return refs;
}

export function back(o: Op[], path: V[], st: number) {
  const P = track(path);
  const n = Math.max(1, Math.round(P.L / st));
  const pts = Array.from({ length: n + 1 }, (_, k) => P.p((k * P.L) / n));
  for (let k = 1; k <= n; k++) o.push(up(pts[k]), down(pts[k - 1]));
}

export function split(o: Op[], path: V[], st: number) {
  const P = track(path);
  const n = Math.floor((P.L - st) / (st / 2));
  o.push(up(P.p(0)), down(P.p(st)));
  for (let k = 1; k <= n; k++) o.push(up(P.p((k * st) / 2)), down(P.p((k * st) / 2 + st)));
}

export function stem(o: Op[], path: V[], st: number, off: number) {
  const P = track(path);
  const n = Math.floor((P.L - st) / (st / 2));
  for (let k = 0; k <= n; k++) {
    const s0 = (k * st) / 2;
    o.push(up(add(P.p(s0), mul(P.n(s0), off))), down(sub(P.p(s0 + st), mul(P.n(s0 + st), off))));
  }
}

export function chain(o: Op[], path: V[], len: number, wf = 0.3) {
  const P = track(path);
  const n = Math.max(1, Math.round(P.L / len));
  const pts = Array.from({ length: n + 1 }, (_, k) => P.p((k * P.L) / n));
  o.push(up(pts[0]));
  for (let k = 0; k < n; k++) o.push(down(pts[k], { loop: 'round', wf }), up(pts[k + 1], { catch: true }));
  o.push(down(add(pts[n], mul(P.d(P.L), 1.1))));
}

export function daisy(o: Op[], c: V, ang: number, r0: number, len: number, wf = 0.34, tack = 1.3) {
  const a = add(c, polar(r0, ang));
  const tip = add(c, polar(r0 + len, ang));
  o.push(up(a), down(a, { loop: 'round', wf }), up(tip, { catch: true }), down(add(tip, polar(tack, ang))));
}

export function fly(o: Op[], a: V, b: V, c: V, tack: V) {
  o.push(up(a), down(b, { loop: 'sharp' }), up(c, { catch: true }), down(tack));
}

export function feather(o: Op[], start: V, dn: V, side: V, s: number, d: number, count: number) {
  let p = start;
  o.push(up(p));
  for (let k = 0; k < count; k++) {
    const dir = k % 2 === 0 ? side : mul(side, -1);
    const q = add(p, mul(dir, s));
    const r = add(add(p, mul(dir, s / 2)), mul(dn, d));
    o.push(down(q, { loop: 'sharp' }), up(r, { catch: true }));
    p = r;
  }
  o.push(down(add(p, mul(dn, 1.2))));
}

export function blanket(o: Op[], path: V[], h: number, sp: number, side = -1) {
  const P = track(path);
  const n = Math.max(1, Math.round(P.L / sp));
  const step = P.L / n;
  o.push(up(P.p(0)));
  for (let k = 1; k <= n; k++) {
    const s = k * step;
    o.push(down(add(P.p(s), mul(P.n(s), h * side)), { loop: 'sharp' }), up(P.p(s), { catch: true }));
  }
  o.push(down(add(P.p(P.L), mul(P.d(P.L), 1.1))));
}

export function cretan(o: Op[], axis: V[], n: number, hw: (t: number) => number, ih: number) {
  const P = track(axis);
  o.push(up(P.p(P.L * 0.02)));
  let last = P.p(0);
  for (let k = 0; k < n; k++) {
    const t = 0.07 + (k * 0.86) / (n - 1);
    const s = t * P.L;
    const side = k % 2 ? -1 : 1;
    last = add(P.p(s), mul(P.n(s), side * ih));
    o.push(down(add(P.p(s), mul(P.n(s), side * hw(t))), { loop: 'sharp' }), up(last, { catch: true }));
  }
  o.push(down(add(last, mul(P.d(P.L), 1.2))));
}

export function cross(o: Op[], origin: V, size: number, n: number) {
  const pt = (x: number, y: number) => add(origin, v(x * size, y * size));
  for (let k = 0; k < n; k++) o.push(up(pt(k, 1)), down(pt(k + 1, 0)));
  for (let k = n - 1; k >= 0; k--) o.push(up(pt(k + 1, 1)), down(pt(k, 0)));
}

/** Counted cross stitch: each row of `X` cells is worked as half crosses, then crossed on the way back. */
export function crossCells(o: Op[], origin: V, size: number, rows: string[]) {
  const pt = (x: number, y: number) => add(origin, v(x * size, y * size));
  rows.forEach((row, y) => {
    const xs = [...row].flatMap((ch, x) => (ch === 'X' ? [x] : []));
    for (const x of xs) o.push(up(pt(x, y + 1)), down(pt(x + 1, y)));
    for (const x of xs.reverse()) o.push(up(pt(x + 1, y + 1)), down(pt(x, y)));
  });
}

export function herringbone(o: Op[], start: V, h: number, L: number, b: number, count: number) {
  const top = start.y - h / 2;
  const bot = start.y + h / 2;
  let x = start.x;
  o.push(up(v(x, bot)));
  for (let k = 0; k < count; k++) {
    const y = k % 2 === 0 ? top : bot;
    x += L;
    o.push(down(v(x, y)));
    x -= b;
    if (k < count - 1) o.push(up(v(x, y)));
  }
}

export function satin(o: Op[], a: (t: number) => V, b: (t: number) => V, count: number, t0 = 0, t1 = 1) {
  for (let k = 0; k < count; k++) {
    const t = mix(t0, t1, k / (count - 1));
    o.push(up(a(t)), down(b(t)));
  }
}

export function fan(o: Op[], c: V, a0: number, a1: number, count: number, rIn: (k: number) => number, rOut: (k: number) => number, th?: Thread) {
  for (let k = 0; k < count; k++) {
    const ang = mix(a0, a1, (k + 0.5) / count);
    o.push(up(add(c, polar(rIn(k), ang)), k === 0 && th ? { th } : {}), down(add(c, polar(rOut(k), ang))));
  }
}

export function fishbone(o: Op[], axis: V[], hw: (t: number) => number, pairs: number, w: number) {
  const P = track(axis);
  o.push(up(P.p(P.L * 0.015)), down(P.p(P.L * 0.13)));
  for (let j = 0; j < pairs; j++) {
    const t = 0.08 + (j * 0.86) / (pairs - 1);
    for (const side of [1, -1]) {
      const s = t * P.L;
      const s2 = Math.min(P.L, (t + 0.075) * P.L);
      o.push(up(add(P.p(s), mul(P.n(s), side * hw(t)))), down(add(P.p(s2), mul(P.n(s2), -side * w * 0.45))));
    }
  }
}

export function seeds(o: Op[], c: V, r: number, n: number, len: number, seed: number, gap = len * 1.25, keep: (p: V) => boolean = () => true) {
  const rand = rng(seed);
  const pts: V[] = [];
  for (let tries = 0; pts.length < n && tries < n * 80; tries++) {
    const p = add(c, polar(r * Math.sqrt(rand()), rand() * Math.PI * 2));
    if (keep(p) && pts.every((q) => dist(p, q) > gap)) pts.push(p);
  }
  pts.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of pts) {
    const ang = rand() * Math.PI;
    o.push(up(add(p, polar(len / 2, ang))), down(sub(p, polar(len / 2, ang))));
  }
}

export function knot(o: Op[], p: V, w: number, wraps = 2, style: 'french' | 'colonial' = 'french') {
  o.push(up(p), { k: 'knot', to: add(p, v(w * 0.45, -w * 0.15)), wraps, style });
}

export function bullion(o: Op[], a: V, b: V, wraps: number) {
  o.push(up(a), { k: 'bullion', to: b, wraps });
}

export function pistil(o: Op[], c: V, ang: number, r0: number, len: number) {
  o.push(up(add(c, polar(r0, ang))), { k: 'knot', to: add(c, polar(r0 + len, ang)), wraps: 2 });
}

export function fourLegged(o: Op[], c: V, s: number) {
  o.push(up(add(c, v(0, -s))));
  const bar = o.length;
  o.push(down(add(c, v(0, s))), up(add(c, v(-s, 0))), { k: 'tie', at: c, under: bar }, down(add(c, v(s, 0))));
}

export function coral(o: Op[], path: V[], gap: number) {
  const P = track(path);
  const n = Math.max(1, Math.round(P.L / gap));
  o.push(up(P.p(0)));
  for (let k = 1; k < n; k++) o.push({ k: 'coral', at: P.p((k * P.L) / n) });
  o.push(down(P.p(P.L)));
}

/** Fractions of the engine's spline through [cur, ...via] that fall inside the given spans. */
function spanUnders(cur: V, via: V[], spans: { i: number; ref: number }[], lo = 0.3, hi = 0.7): Under[] {
  const path = spline([cur, ...via], 8);
  const acc = lengths(path);
  const L = acc[acc.length - 1];
  return spans.map(({ i, ref }) => {
    const s0 = acc[i * 8];
    const s1 = acc[(i + 1) * 8];
    return { a: (s0 + (s1 - s0) * lo) / L, b: (s0 + (s1 - s0) * hi) / L, ref };
  });
}

export function whipped(o: Op[], path: V[], st: number, gap: number, whip: Thread, h: number) {
  const P = track(path);
  const refs = running(o, path, st, gap);
  const mids: number[] = [];
  for (let s = 0; s + st <= P.L + 0.01; s += st + gap) mids.push(s + st / 2);
  const start = add(P.p(0), mul(P.n(0), -h));
  const via: V[] = [];
  mids.forEach((s) => {
    via.push(add(add(P.p(s), mul(P.n(s), -h)), mul(P.d(s), -h * 0.25)));
    via.push(add(add(P.p(s), mul(P.n(s), h)), mul(P.d(s), h * 0.25)));
  });
  const unders = spanUnders(start, via, refs.map((ref, k) => ({ i: 2 * k + 1, ref })));
  o.push(up(start, { th: whip }), { k: 'surface', via, unders });
  const endS = mids[mids.length - 1] + st / 2;
  o.push(down(add(P.p(Math.min(P.L, endS)), mul(P.n(endS), h * 0.9))));
}

export function couch(o: Op[], path: V[], laid: Thread, tack: Thread, gap: number) {
  const P = track(path);
  const nv = Math.max(7, Math.ceil(P.L / 2.5));
  const via = Array.from({ length: nv }, (_, k) => P.p(((k + 1) * P.L) / (nv + 1)));
  o.push(up(P.p(0), { th: laid }), down(P.p(P.L), { via }));
  const h = laid.width * 0.5 + tack.width * 0.35;
  const n = Math.max(1, Math.round(P.L / gap));
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) * P.L) / n;
    o.push(up(add(P.p(s), mul(P.n(s), h)), k === 0 ? { th: tack } : {}), down(sub(P.p(s), mul(P.n(s), h))));
  }
}

/** Where lines across `poly` along `ang` cross it: one [from, to] pair per stitch, `gap` apart. */
function scan(poly: V[], ang: number, gap: number): [V, V][] {
  const u = polar(1, ang);
  const n = perp(u);
  const ns = poly.map((p) => dot(p, n));
  const out: [V, V][] = [];
  for (let c = Math.min(...ns) + gap / 2; c < Math.max(...ns); c += gap) {
    const xs: number[] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const da = dot(a, n) - c;
      const db = dot(b, n) - c;
      if (da < 0 !== db < 0) xs.push(dot(lerp(a, b, da / (da - db)), u));
    });
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([add(mul(n, c), mul(u, xs[k])), add(mul(n, c), mul(u, xs[k + 1]))]);
  }
  return out;
}

/** Satin stitch over any outline: parallel stitches along `ang`, each one up on the near edge and down on the far one. */
export function satinFill(o: Op[], poly: V[], ang: number, gap: number) {
  for (const [a, b] of scan(poly, ang, gap)) o.push(up(a), down(b));
}

/** Long and short over an outline: alternating long and short stitches in `light` from the near edge, then `dark` filling the rest, split into them. */
export function longShortFill(o: Op[], poly: V[], ang: number, gap: number, light: Thread, dark: Thread) {
  const rows = scan(poly, ang, gap);
  rows.forEach(([a, b], k) => o.push(up(a, k === 0 ? { th: light } : {}), down(lerp(a, b, k % 2 ? 0.48 : 0.7))));
  rows.forEach(([a, b], k) => o.push(up(lerp(a, b, k % 2 ? 0.38 : 0.58), k === 0 ? { th: dark } : {}), down(b)));
}

/** True if `p` is inside the outline. */
export function inside(poly: V[], p: V): boolean {
  let hit = false;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) hit = !hit;
  });
  return hit;
}

export function wheel(o: Op[], c: V, R: number, w: number, spokes = 5, rot0 = -Math.PI / 2) {
  const ang = (k: number) => rot0 + (k * Math.PI * 2) / spokes;
  const refs: number[] = [];
  for (let k = 0; k < spokes; k++) {
    o.push(up(add(c, polar(R, ang(k)))));
    refs.push(o.length);
    o.push(down(c));
  }
  const r0 = w * 1.05;
  const pitch = w * 0.84;
  const rounds = Math.max(2, Math.floor((R * 0.98 - r0) / pitch));
  const th0 = ang(0) + Math.PI / spokes;
  const step = (Math.PI * 2) / 48;
  const radius = (th: number) => r0 + ((th - th0) / (Math.PI * 2)) * pitch;
  let cur = add(c, polar(r0, th0));
  o.push(up(cur));
  let m = 0;
  for (let j = 0; j < rounds; j++) {
    const via: V[] = [];
    const thetas: number[] = [];
    for (let i = 1; i <= 48; i++) {
      const th = th0 + (j * 48 + i) * step;
      thetas.push(th);
      via.push(add(c, polar(radius(th), th)));
    }
    const pts = [cur, ...via];
    const acc = lengths(pts);
    const L = acc[acc.length - 1];
    const unders: Under[] = [];
    for (let k = 0; k < spokes; k++) {
      let tc = ang(k);
      const lo = th0 + j * Math.PI * 2;
      while (tc < lo) tc += Math.PI * 2;
      if (tc > lo + Math.PI * 2) continue;
      const idx = (tc - lo) / step;
      const i0 = Math.floor(idx);
      const s = acc[i0] + (acc[Math.min(acc.length - 1, i0 + 1)] - acc[i0]) * (idx - i0);
      const half = (w * 0.9) / L;
      unders.push({ a: s / L - half, b: s / L + half, ref: refs[k] });
    }
    unders.sort((a, b) => a.a - b.a);
    const kept = unders.filter((_, i) => (m + i) % 2 === 0);
    m += unders.length;
    o.push({ k: 'surface', via, unders: kept, raw: true });
    cur = via[via.length - 1];
  }
  const endAng = th0 + rounds * Math.PI * 2 + 0.25;
  o.push(down(add(c, polar(R * 1.02, endAng))));
}

const leaf = (max: number, pow = 0.8) => (t: number) => max * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** pow;

export const STITCHES: Stitch[] = [
  {
    slug: 'running-stitch', name: 'Running stitch', family: 'Lines', level: 1,
    use: 'Dashed outlines, quilting lines, and the first stitch everyone learns.',
    steps: [
      'Bring the needle up from the back at the start of your line.',
      'Go back down one stitch-length along the line.',
      'Skip a gap about the same size, then come up again.',
      'Keep going: stitch, gap, stitch. Even spacing matters more than size.',
    ],
    tip: 'Keep the stitches and the gaps the same length. Evenness is what makes running stitch look deliberate.',
    watch: 'Pulling too hard puckers the fabric. Tug until the thread lies flat, then stop.',
    good: [['Outlines and dashed borders', 'The simplest line there is. Keep it even and it reads as a neat dashed edge.'], ['Quilting and sashiko', 'Japanese sashiko patterns are rows of running stitch worked through layers of cloth.'], ['Gathering and tacking', 'Long running stitches hold layers together or pull fabric into gathers, then come out.']],
    demo: () => {
      const o: Op[] = [];
      running(o, wave(-30, 30, 0, 6), 7, 4.4);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 4: 3 }), th: T(C.madder) };
    },
  },
  {
    slug: 'back-stitch', name: 'Back stitch', family: 'Lines', level: 1,
    use: 'Solid outlines and lettering. The workhorse of line work.',
    steps: [
      'Come up one stitch-length ahead of where the line starts.',
      'Go back down at the start. You stitch backwards.',
      'Come up one stitch-length ahead of the last stitch.',
      'Go down at the end of the previous stitch, sharing its hole.',
      'Repeat. The front reads as one solid line; the back shows long overlapping stitches.',
    ],
    tip: 'Use shorter stitches on tight curves. Long stitches turn curves into corners.',
    watch: 'Go down exactly in the previous hole. Missing it by a thread leaves gaps in the line.',
    good: [['Lettering', 'Solid, even lines with crisp corners make it the go-to for words and names.'], ['Line drawings', 'Clean outlines for redwork and line art, where one unbroken line matters.'], ['Edging other fills', 'A back-stitched outline sharpens a shape filled with satin or seed stitch.']],
    demo: () => {
      const o: Op[] = [];
      back(o, wave(-30, 30, 0, 6), 7.5);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, 5: 4 }), th: T(C.indigo) };
    },
  },
  {
    slug: 'split-stitch', name: 'Split stitch', family: 'Lines', level: 1,
    use: 'Fine outlines that look like a tiny chain, and the underlay for a padded satin edge.',
    steps: [
      'Come up at the start and make one straight stitch.',
      'Come back up through the middle of that stitch, splitting its strands.',
      'Go down half a stitch beyond the end of the last stitch.',
      'Split each new stitch in the middle and keep going.',
    ],
    tip: 'Use an even number of strands (2, 4 or 6) so the needle can split the thread cleanly down the middle.',
    watch: 'Come up from below through the thread. Stabbing down into it from the front frays it.',
    good: [['Smooth curves', 'Each stitch pierces the one before, so tight curves stay smooth with no corners.'], ['Edges under satin', 'Outline a shape in split stitch first and the satin over it gets a crisp, raised edge.'], ['Filling in rows', 'Packed rows that follow a shape make a fine, tapestry-like fill.']],
    demo: () => {
      const o: Op[] = [];
      split(o, wave(-30, 30, 0, 6), 9);
      return { ops: caps(o, { 0: 0, 2: 1, 3: 2, 4: 3 }), th: T(C.plum) };
    },
  },
  {
    slug: 'stem-stitch', name: 'Stem stitch', family: 'Lines', level: 1,
    use: 'Stems, vines and smooth curved outlines with a rope-like twist.',
    steps: [
      'Come up at the start of the line.',
      'Go down one stitch-length along the line.',
      'Come up halfway back, right beside the last stitch.',
      'Keep the working thread on the same side every time. That is what makes the twist.',
    ],
    tip: 'Keep the thread below the needle for stem stitch. Keep it above and you get outline stitch, which twists the other way.',
    watch: 'Swapping sides partway along breaks the rope and leaves a kink.',
    good: [['Stems and vines', 'Its twisted, rope-like line is made for stalks and curling tendrils.'], ['Flowing script', 'It bends smoothly through loops, so joined-up lettering stays graceful.'], ['Thicker lines', 'Work rows side by side for a solid stem or a broad branch.']],
    demo: () => {
      const o: Op[] = [];
      stem(o, wave(-30, 30, 0, 7), 9, 0.9);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 4: 3 }), th: T(C.sage) };
    },
  },
  {
    slug: 'whipped-running-stitch', name: 'Whipped running stitch', family: 'Lines', level: 2,
    use: 'Raised, corded lines. A second colour turns them into candy-cane stripes.',
    steps: [
      'Work a line of running stitch first.',
      'Bring a second thread up at the start of the line.',
      'Slide the needle under each running stitch, always from the same side, without piercing the fabric.',
      'Go down at the end. Only the first and last moves go through the fabric.',
    ],
    tip: 'Whip with a blunt tapestry needle so it can’t split the stitches or catch the fabric.',
    watch: 'Whip loosely. Tight whipping drags the running stitches out of line.',
    good: [['Bold, smooth lines', 'Whipping turns a dashed line into a smooth, raised cord.'], ['Two-colour lines', 'Whip in a contrasting colour for a candy-stripe twist.'], ['Quick borders', 'Fast to work along a hem or around a shape.']],
    demo: () => {
      const o: Op[] = [];
      whipped(o, wave(-28, 28, 0, 5), 6.5, 2.6, T(C.ochre, 2), 2.4);
      const i = o.findIndex((x) => x.k === 'up' && x.th);
      return { ops: caps(o, { 0: 0, [i]: 1, [i + 1]: 2, [i + 2]: 3 }), th: T(C.teal), slow: 4, fast: 0.45 };
    },
  },
  {
    slug: 'couching', name: 'Couching', family: 'Lines', level: 2,
    use: 'Laying down thick or precious threads (metallics, yarn, cord) that won’t pass through the fabric.',
    steps: [
      'Bring the thick laid thread up at the start of the line.',
      'Lay it along the line and take it down at the end.',
      'Bring a fine thread up right beside the laid thread.',
      'Cross over it and go down on the other side. That little stitch holds it in place.',
      'Repeat at even spacing, closer together on curves.',
    ],
    tip: 'On tight curves, tack every few millimetres so the laid thread follows the line instead of cutting the corner.',
    watch: 'Tack straight across the laid thread, not at a slant, or it starts to twist.',
    good: [['Threads too thick to sew', 'Wool, cord, ribbon or metallic thread that would fray or snag if pulled through the cloth.'], ['Spirals and lettering', 'The laid thread follows any curve in one sweep.'], ['Goldwork', 'Real metal threads are almost always couched, tacked down with fine silk.']],
    demo: () => {
      const o: Op[] = [];
      couch(o, curve([v(-30, 10), v(-14, -12), v(4, 10), v(20, -10), v(30, 2)]), T(C.gold, 3.6), T(C.madder, 1.4), 6.5);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }), th: T(C.gold, 3.6), slow: 6, fast: 0.5 };
    },
  },
  {
    slug: 'chain-stitch', name: 'Chain stitch', family: 'Loops', level: 1,
    use: 'Bold outlines and lettering. Rows of it fill a shape with texture.',
    steps: [
      'Come up at the start of the line.',
      'Go back down in the same hole, leaving a loop on the surface.',
      'Come up a stitch-length ahead, inside the loop, and pull gently.',
      'Each new loop anchors the one before it.',
      'Finish with a tiny stitch over the last loop to hold it down.',
    ],
    tip: 'Stop pulling when the loop is round and lies flat. A tight chain looks like a thin braid.',
    watch: 'Go down in the same hole or right beside it. Too far away and the chain looks open and lumpy.',
    good: [['Bold outlines', 'A thick, textured line that holds its own from across the room.'], ['Filling shapes', 'Rows worked side by side, or spiralling inward, fill a shape quickly.'], ['Vines and monograms', 'The loops flow round curves, so stems and initials look lovely in it.']],
    demo: () => {
      const o: Op[] = [];
      chain(o, wave(-28, 28, 0, 6), 8.5);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, [o.length - 1]: 4 }), th: T(C.madder) };
    },
  },
  {
    slug: 'lazy-daisy', R: 30, name: 'Lazy daisy', family: 'Loops', level: 1, aka: 'Detached chain',
    use: 'Petals and leaves, each in a single stitch.',
    steps: [
      'Come up at the base of the petal.',
      'Go back down in the same hole, leaving a loop.',
      'Come up at the tip of the petal, inside the loop.',
      'Pull until the loop is petal-shaped, then make a tiny stitch over the tip to hold it.',
      'Repeat around a centre point.',
    ],
    tip: 'Leave a little room in the middle for a French knot or two.',
    watch: 'Pull too hard and the petal collapses into a thin line. Keep it plump.',
    good: [['Flower petals', 'Five or six round a centre make a daisy in a few minutes.'], ['Small leaves', 'A single loop off a stem is a quick, plump leaf.'], ['Scattered fill', 'Single loops sprinkled at different angles make a light, textured background.']],
    demo: () => {
      const o: Op[] = [];
      for (let k = 0; k < 5; k++) daisy(o, v(0, 2), -Math.PI / 2 + (k * Math.PI * 2) / 5, 2.8, 15);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }), th: T(C.rose), slow: 4 };
    },
  },
  {
    slug: 'fly-stitch', R: 31, name: 'Fly stitch', family: 'Loops', level: 2,
    use: 'Ferns, grass and bird feet. Stack them and you have a whole leaf.',
    steps: [
      'Come up at the top left.',
      'Go down at the top right, level with it, leaving a loose loop.',
      'Come up in the middle, below, inside the loop.',
      'Make a tacking stitch to hold the V in place.',
      'Stack more below to build a fern.',
    ],
    tip: 'The tacking stitch is the dial: short makes a V, long makes a Y.',
    watch: 'Come up exactly halfway between the arms or the V leans to one side.',
    good: [['Ferns and fronds', 'Stacked one under the next, the Vs build a fern or a pine branch.'], ['Grass and leaf veins', 'Long tails become stalks; short ones make tufts of grass.'], ['Zigzag borders', 'A row of Vs side by side makes a simple edging.']],
    demo: () => {
      const o: Op[] = [];
      fly(o, v(-9, -20), v(9, -20), v(0, -11), v(0, -8));
      fly(o, v(-11, -10), v(11, -10), v(0, 0), v(0, 3));
      fly(o, v(-13, 1), v(13, 1), v(0, 12), v(0, 20));
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }), th: T(C.sage), slow: 4 };
    },
  },
  {
    slug: 'feather-stitch', R: 33, name: 'Feather stitch', family: 'Loops', level: 2,
    use: 'Seaweed, delicate branches and crazy-quilt seams.',
    steps: [
      'Come up on the centre line.',
      'Go down to one side, level with where you came up.',
      'Come up below and halfway between, with the loop under the needle.',
      'Now go down on the other side. Alternate left and right.',
      'Anchor the last loop with a tiny stitch.',
    ],
    tip: 'Draw two faint guide lines first. Feather stitch looks best when the arms are all the same width.',
    watch: 'Forgetting to keep the loop under the needle gives a plain zigzag that pulls out.',
    good: [['Foliage and seaweed', 'Its branching zigzag looks like twigs, ferns or waving weed.'], ['Crazy-quilt seams', 'The classic stitch for covering and decorating the seams between patches.'], ['Heirloom edging', 'Delicate borders on baby clothes, collars and hems.']],
    demo: () => {
      const o: Op[] = [];
      feather(o, v(-2.75, -24), v(0, 1), v(1, 0), 11, 8, 6);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, [o.length - 1]: 4 }), th: T(C.teal) };
    },
  },
  {
    slug: 'blanket-stitch', name: 'Blanket stitch', family: 'Loops', level: 1, aka: 'Buttonhole stitch',
    use: 'Edges and appliqué. Packed tight and worked in a circle, it makes wheels and scallops.',
    steps: [
      'Come up on the baseline.',
      'Go down above and to the right, leaving a loop.',
      'Come up on the baseline straight below, inside the loop.',
      'Pull snug and the loop turns into a corner. Repeat along the line.',
      'Finish with a small stitch over the last loop.',
    ],
    tip: 'Keep the uprights the same height and spacing. Pack them shoulder to shoulder and it becomes buttonhole stitch.',
    watch: 'Pulling the corners too tight bunches the baseline into a wavy line.',
    good: [['Edging blankets and felt', 'It wraps raw edges so they don\'t fray, the job it\'s named for.'], ['Appliqué', 'Holds a cut-out shape down while outlining it.'], ['Wheels and scallops', 'Worked round a circle with the legs pointing in, it makes a wheel.']],
    demo: () => {
      const o: Op[] = [];
      blanket(o, curve([v(-28, 10), v(0, 4), v(28, 10)]), 11, 6.2);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, [o.length - 1]: 4 }), th: T(C.indigo) };
    },
  },
  {
    slug: 'cretan-stitch', name: 'Cretan stitch', family: 'Loops', level: 3,
    use: 'Leaves with a braided centre vein, and decorative bands.',
    steps: [
      'Come up at the base of the leaf, on the centre line.',
      'Go down on the outer edge, then come up a little in from it, with the loop under the needle.',
      'Do the same on the opposite edge.',
      'Keep alternating edges. The crossing threads braid down the centre.',
    ],
    tip: 'Mark the outline and a centre line. Keep every bite the same depth toward the middle so the braid stays straight.',
    watch: 'Bites of different depths make the braid wander off the centre line.',
    good: [['Leaves with a braid', 'Worked across a leaf, it fills it with a plaited centre vein.'], ['Decorative bands', 'A row gives a woven, open band for borders.'], ['Feathery fronds', 'Change the depth of the bites for a looser, feathery look.']],
    demo: () => {
      const o: Op[] = [];
      cretan(o, curve([v(-26, 15), v(0, 2), v(26, -14)]), 13, leaf(12), 2);
      return { ops: caps(o, { 0: 0, 1: 1, 3: 2, 5: 3 }), th: T(C.moss) };
    },
  },
  {
    slug: 'cross-stitch', R: 30, name: 'Cross stitch', family: 'Crossed', level: 1,
    use: 'Counted patterns and pixel-style motifs.',
    steps: [
      'Come up at the bottom left of the first square.',
      'Go down at the top right, making a half cross.',
      'Work the whole row of half crosses, all leaning the same way.',
      'Come back along the row, crossing each one the other way.',
    ],
    tip: 'Every top stitch must lean the same direction. That consistency is what makes cross stitch look neat.',
    watch: 'Count the fabric threads for each cross; eyeballing it gives crosses of different sizes.',
    good: [['Counted patterns', 'Worked over the threads of even-weave fabric or Aida, following a chart.'], ['Samplers and alphabets', 'Square cells make blocky letters and the classic sampler motifs.'], ['Pixel pictures', 'Every cross is a pixel, so almost any small picture can be charted.']],
    demo: () => {
      const o: Op[] = [];
      cross(o, v(-18, -4.5), 9, 4);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 8: 3 }), th: T(C.madder) };
    },
  },
  {
    slug: 'herringbone-stitch', R: 34, name: 'Herringbone stitch', family: 'Crossed', level: 2,
    use: 'Bands, borders, and a base for laced and threaded stitches.',
    steps: [
      'Come up on the bottom line.',
      'Go down on the top line, ahead and to the right.',
      'Come up a little to the left, still on the top line.',
      'Go down on the bottom line, ahead again, then come up a little to the left.',
      'Alternate lines. The diagonals cross at each end.',
    ],
    tip: 'Rule two parallel guide lines and keep the small back-steps the same size.',
    watch: 'Uneven back-steps make the crossings drift up and down the band.',
    good: [['Bands and borders', 'A criss-crossed band that fills a strip quickly.'], ['Hems and appliqué', 'Holds a folded edge flat without much showing on the front.'], ['Shadow work', 'Worked closed on the back of sheer fabric, the colour glows softly through.']],
    demo: () => {
      const o: Op[] = [];
      herringbone(o, v(-29, 0), 13, 10, 3.5, 8);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 3: 3, 5: 4 }), th: T(C.plum) };
    },
  },
  {
    slug: 'satin-stitch', name: 'Satin stitch', family: 'Fills', level: 2,
    use: 'Smooth, glossy fills for leaves, petals and letters.',
    steps: [
      'Come up on one edge of the shape.',
      'Go down straight across, on the opposite edge.',
      'Come up on the first edge again, right next to the last stitch.',
      'Lay each stitch snugly beside the last so no fabric shows between them.',
    ],
    tip: 'Outline the shape in split stitch first and stitch over it. The edge comes out crisp and slightly raised.',
    watch: 'Stitches longer than about a centimetre snag and sag. Use long and short stitch for big shapes.',
    good: [['Small solid shapes', 'Petals, leaves, dots and berries with a smooth, glossy surface.'], ['Monograms', 'Padded satin letters are the classic finish on table and bed linen.'], ['Bold accents', 'A small solid shape draws the eye in a design made of lines.']],
    demo: () => {
      const o: Op[] = [];
      const P = track(curve([v(-26, 14), v(0, 3), v(26, -14)]));
      const hw = leaf(10.5, 0.75);
      const sl = 0.09;
      satin(o, (t) => add(P.p(t * P.L), mul(P.n(t * P.L), hw(t))), (t) => sub(P.p((t + sl) * P.L), mul(P.n((t + sl) * P.L), hw(t + sl))), 24, 0.02, 0.97 - sl);
      return { ops: caps(o, { 0: 0, 1: 1, 2: 2, 4: 3 }), th: T(C.sage), slow: 6, fast: 0.4 };
    },
  },
  {
    slug: 'long-and-short-stitch', R: 34, name: 'Long and short stitch', family: 'Fills', level: 3, aka: 'Thread painting',
    use: 'Shading and blending colour, like painting with thread.',
    steps: [
      'Start at the outer edge with alternating long and short stitches.',
      'Switch to the next shade.',
      'Come up below the first row and go down into it, splitting its stitches.',
      'Vary the lengths so there is no hard line between the shades.',
      'Finish with the darkest shade toward the centre.',
    ],
    tip: 'Angle every stitch toward one point, like the centre of the flower, so the shading flows.',
    watch: 'Rows of equal-length stitches leave a visible stripe between shades. Stagger them.',
    good: [['Shading and blending', 'Rows interlock so one colour melts into the next. This is thread painting.'], ['Large fills', 'Covers areas too wide for satin stitch, which would sag and snag.'], ['Realistic flowers and birds', 'Petals that fade from tip to base, feathers with soft gradients.']],
    demo: () => {
      const o: Op[] = [];
      const c = v(0, 21);
      const R0 = 39;
      const a0 = -Math.PI / 2 - 0.62;
      const a1 = -Math.PI / 2 + 0.62;
      const r = rng(5);
      fan(o, c, a0, a1, 23, (k) => R0 - (k % 2 ? 6 : 10.5), () => R0);
      const row2 = o.length;
      fan(o, c, a0 + 0.02, a1 - 0.02, 17, () => R0 - 17 - r() * 2.5, () => R0 - 6.5 - r() * 2.5, T(C.pink));
      const row3 = o.length;
      fan(o, c, a0 + 0.04, a1 - 0.04, 12, () => R0 - 25 + r() * 1.5, () => R0 - 14 - r() * 2.5, T(C.wine));
      return { ops: caps(o, { 0: 0, [row2]: 1, [row2 + 1]: 2, [row2 + 6]: 3, [row3]: 4 }), th: T(C.blush), slow: 6, fast: 0.35 };
    },
  },
  {
    slug: 'fishbone-stitch', name: 'Fishbone stitch', family: 'Fills', level: 2,
    use: 'Leaves with a natural centre vein.',
    steps: [
      'Make a short straight stitch at the leaf tip, down the centre line.',
      'Come up on the left edge and go down just across the centre line.',
      'Come up on the right edge and go down just across the centre line from the other side.',
      'Alternate sides, working down the leaf. The overlaps form the vein.',
    ],
    tip: 'Keep each stitch close to the one before it at the edge; the angle takes care of itself.',
    watch: 'Crossing too far over the centre makes the vein wide and messy.',
    good: [['Leaves', 'Fills a leaf and draws its centre vein at the same time.'], ['Feathers', 'The angled stitches mimic the barbs of a feather.'], ['Pointed petals', 'Tulip and lily petals with a natural line down the middle.']],
    demo: () => {
      const o: Op[] = [];
      fishbone(o, curve([v(4, -30), v(-2, -4), v(3, 28)]), leaf(13), 11, 2.2);
      return { ops: caps(o, { 0: 0, 2: 1, 4: 2, 6: 3 }), th: T(C.moss), slow: 6, fast: 0.45 };
    },
  },
  {
    slug: 'seed-stitch', R: 34, name: 'Seed stitch', family: 'Fills', level: 1, aka: 'Seeding',
    use: 'Speckled texture and light fills: pollen, sand, freckles.',
    steps: [
      'Make one tiny straight stitch.',
      'Come up a short distance away and stitch at a different angle.',
      'Scatter them in every direction, at roughly even spacing.',
    ],
    tip: 'Spread out, seeds read as a light tint; packed together, they read as shadow.',
    watch: 'Long jumps across the back show through light fabric. Work in small patches.',
    good: [['Textured fills', 'Speckled areas like sand, gravel, bread or fur.'], ['Shading by density', 'Pack seeds close for dark areas and spread them out for light ones.'], ['Light backgrounds', 'A loose scatter behind a motif fills the cloth without weighing it down.']],
    demo: () => {
      const o: Op[] = [];
      seeds(o, v(0, 0), 25, 40, 4, 9, 5.6);
      return { ops: caps(o, { 0: 0, 2: 1, 6: 2 }), th: T(C.indigo), slow: 6, fast: 0.4 };
    },
  },
  {
    slug: 'woven-wheel', R: 27, name: 'Woven wheel', family: 'Fills', level: 2, aka: 'Spider web rose',
    use: 'Plump, raised roses.',
    steps: [
      'Make five straight stitches from the edge of a circle into the centre. It must be an odd number.',
      'Come up near the centre, between two spokes.',
      'Weave over and under the spokes, round and round, without piercing the fabric.',
      'Keep weaving until the spokes are covered, then slip under the edge and go down.',
    ],
    tip: 'Weave with a blunt tapestry needle and keep the tension loose so the rose stays plump.',
    watch: 'An even number of spokes breaks the over-under pattern: every round lands on the same spokes.',
    good: [['Roses', 'The spiral of weaving reads at once as a full, round rose.'], ['Berries and buttons', 'Small wheels make raised dots for berries, buttons or flower centres.'], ['Raised texture', 'It sits up off the cloth, adding depth next to flat stitches.']],
    demo: () => {
      const o: Op[] = [];
      wheel(o, v(0, 0), 18, 2.2);
      return { ops: caps(o, { 0: 0, 10: 1, 11: 2, [o.length - 1]: 3 }), th: T(C.rose), slow: 12, fast: 0.6 };
    },
  },
  {
    slug: 'french-knot', R: 24, name: 'French knot', family: 'Knots', level: 2, knot: true,
    use: 'Flower centres, dots, eyes and texture.',
    steps: [
      'Come up where you want the knot.',
      'Hold the needle flat and wrap the thread around it twice.',
      'Point the needle down right beside where you came up, not in the same hole.',
      'Keep the wraps snug against the fabric and pull through.',
    ],
    tip: 'Keep the working thread taut while the needle goes down. Slack thread is what makes knots messy.',
    watch: 'Going down in the exact same hole pulls the knot through to the back.',
    good: [['Flower centres', 'A cluster of knots is the classic middle of a daisy or sunflower.'], ['Dots and eyes', 'Single knots for the eyes of birds and animals, berries, or full stops.'], ['Textured fills', 'Packed knots for a sheep\'s fleece, moss or a pebbly path.']],
    demo: () => {
      const o: Op[] = [];
      [-14, 0, 14].forEach((x) => knot(o, v(x, 0), 2.2));
      return { ops: caps(o, { 0: 0, 1: [1, 2, 3] }), th: T(C.rust), slow: 2, fast: 0.7 };
    },
  },
  {
    slug: 'colonial-knot', R: 24, name: 'Colonial knot', family: 'Knots', level: 2, knot: true, aka: 'Candlewicking knot',
    use: 'Taller, tidier dots than a French knot, and candlewicking.',
    steps: [
      'Come up where you want the knot.',
      'Wrap the thread around the needle tip in a figure eight: under, over, then around.',
      'Point the needle down right beside where you came up.',
      'Pull the thread snug around the needle, then pull through.',
    ],
    tip: 'The figure eight makes a knot that sits up and keeps its shape better than a French knot.',
    watch: 'Loose wraps make a floppy knot. Snug them down before you pull through.',
    good: [['Neat raised dots', 'Firmer and more even than a French knot, and less likely to pull through.'], ['Candlewicking', 'The traditional knot of white-on-white candlewick designs.'], ['Grapes and lilac', 'Clusters and cones built from rows of knots.']],
    demo: () => {
      const o: Op[] = [];
      [-14, 0, 14].forEach((x) => knot(o, v(x, 0), 2.2, 2, 'colonial'));
      return { ops: caps(o, { 0: 0, 1: [1, 2, 3] }), th: T(C.indigo), slow: 2, fast: 0.7 };
    },
  },
  {
    slug: 'bullion-knot', R: 27, name: 'Bullion knot', family: 'Knots', level: 3, knot: true,
    use: 'Rosebuds, caterpillars and raised lines.',
    steps: [
      'Come up at one end of the knot.',
      'Go down at the other end and bring the tip back up where the thread is. Leave the needle in.',
      'Wrap the thread around the needle until the wraps are as long as the stitch.',
      'Hold the wraps and pull the needle through them.',
      'Lay the coil flat and go down at the far end.',
    ],
    tip: 'Use a long, narrow needle (a milliner’s needle) whose eye is no wider than its shaft, so it slides through the wraps.',
    watch: 'Too few wraps and the knot arches; too many and it bunches. Wrap to the stitch length.',
    good: [['Roses and rosebuds', 'Two or three curved bullions make a bud; add more for a full rose.'], ['Lavender and wheat', 'Short bullions up a stem make lavender heads or ears of wheat.'], ['Caterpillars and cords', 'Long coils for small creatures and raised, rope-like accents.']],
    demo: () => {
      const o: Op[] = [];
      bullion(o, v(5, -7), v(-7, -7), 9);
      bullion(o, v(6, 0), v(-7, 0), 10);
      bullion(o, v(5, 7), v(-7, 7), 9);
      return { ops: caps(o, { 0: 0, 1: [1, 2, 3, 4] }), th: T(C.rose), slow: 2, fast: 0.65 };
    },
  },
  {
    slug: 'pistil-stitch', R: 30, name: 'Pistil stitch', family: 'Knots', level: 2, knot: true,
    use: 'Stamens and flower tufts: a stem with a dot on the end.',
    steps: [
      'Come up at the base of the stem.',
      'Wrap the thread around the needle twice, as for a French knot.',
      'Go down at the end of the stem, keeping the wraps on the needle.',
      'Pull through. You get a straight stitch with a knot on the end.',
    ],
    tip: 'Fan them out from a single centre to make a dandelion clock.',
    watch: 'If the wraps slide off before the needle goes down, the knot ends up at the wrong end.',
    good: [['Stamens', 'A long tail with a knot at the end, fanned round a flower\'s centre.'], ['Fireworks and dandelion clocks', 'A ring of them bursts outward like a firework.'], ['Seed heads', 'Grasses and alliums with dots on stalks.']],
    demo: () => {
      const o: Op[] = [];
      for (let k = 0; k < 5; k++) pistil(o, v(0, 16), -Math.PI / 2 + (k - 2) * 0.42, 2, 24);
      return { ops: caps(o, { 0: 0, 1: [1, 2, 3] }), th: T(C.plum), slow: 2, fast: 0.7 };
    },
  },
  {
    slug: 'four-legged-knot', R: 28, name: 'Four-legged knot', family: 'Knots', level: 2, knot: true,
    use: 'Stars, sparkles and scattered texture.',
    steps: [
      'Make a vertical straight stitch, slightly loose.',
      'Come up to the left of its middle.',
      'Slide the needle under the crossing diagonally, without piercing the fabric, with the thread under the tip.',
      'Pull to tighten a knot in the middle, then go down on the right.',
    ],
    tip: 'Leave the first stitch a little loose; the knot pulls it tight.',
    watch: 'Piercing the fabric under the crossing locks the knot in the wrong place.',
    good: [['Stars and sparkles', 'A cross with a knot in the middle reads as a little star.'], ['Scattered fills', 'Spaced evenly, it makes a dotted, textured background.'], ['Tiny flowers', 'In a bright colour it doubles as a four-petalled bloom.']],
    demo: () => {
      const o: Op[] = [];
      [-16, 0, 16].forEach((x) => fourLegged(o, v(x, 0), 6));
      return { ops: caps(o, { 0: 0, 2: 1, 3: [2, 3] }), th: T(C.teal), slow: 5, fast: 0.6 };
    },
  },
  {
    slug: 'coral-stitch', name: 'Coral stitch', family: 'Knots', level: 2, knot: true,
    use: 'Knotted lines: stems, waves and textured outlines.',
    steps: [
      'Come up at the start of the line.',
      'Lay the thread along the line.',
      'Take a tiny stitch across the line, with the thread looped under the needle tip.',
      'Pull through to form a knot. Repeat along the line.',
    ],
    tip: 'Space the knots evenly; closer together reads as beads, farther apart as a knotted cord.',
    watch: 'Forgetting the loop under the needle gives you a plain stitch with no knot.',
    good: [['Knotted lines', 'Knots spaced along a line, like beads on a string.'], ['Textured stems', 'Gives stems and branches a knobbly, natural look.'], ['Seaweed and coral', 'Wiggly knotted lines for underwater scenes, as the name suggests.']],
    demo: () => {
      const o: Op[] = [];
      coral(o, wave(-28, 28, 0, 7), 7.5);
      return { ops: caps(o, { 0: 0, 1: [1, 2, 3] }), th: T(C.madder), slow: 3, fast: 0.6 };
    },
  },
];

export const bySlug = (slug: string) => STITCHES.find((s) => s.slug === slug)!;

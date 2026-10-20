import type { Op } from './engine.ts';
import {
  T, C, curve, running, back, split, stem, whipped, couch, chain, daisy, fly, feather, blanket, cretan, crossCells,
  herringbone, fan, fishbone, seeds, knot, bullion, pistil, fourLegged, coral, wheel, satinFill, longShortFill, inside,
  type Demo,
} from './stitches.ts';
import { ring, closed, leafW, leafLine } from './projects.ts';
import { type V, v, add, mul, polar, offset } from './geom.ts';

/** Small pictures of what each stitch is good for, one per entry in the stitch's `good` list, in the same order. */
type Ex = (o: Op[]) => void;

const W = 1.2;
const deg = (d: number) => (d * Math.PI) / 180;
/** Runs `f` in `color`: its first move picks up that floss. */
const In = (color: string, f: Ex, w = W): Ex => (o) => {
  const n = o.length;
  f(o);
  if (o[n]) o[n] = { ...o[n], th: T(color, w) };
};
const all = (...parts: Ex[]): Ex => (o) => parts.forEach((p) => p(o));
const line = (a: V, b: V) => [a, b];
const arc = (c: V, r: number, a0: number, a1: number, n = 24) => Array.from({ length: n + 1 }, (_, k) => add(c, polar(r, deg(a0 + ((a1 - a0) * k) / n))));
const heart = (c: V, s: number, n = 44) => Array.from({ length: n + 1 }, (_, k) => {
  const t = (k / n) * Math.PI * 2;
  return add(c, mul(v(16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))), s / 16));
});
/** A leaf outline and its axis from tip to base. */
const leafAt = (base: V, ang: number, len: number, w: number) => {
  const u = polar(1, deg(ang));
  const axis = curve([add(base, mul(u, len)), add(add(base, mul(u, len / 2)), mul(v(-u.y, u.x), 0.5)), base]);
  return { axis, poly: leafLine(axis, leafW(w)) };
};
const along = (path: V[], gap: number) => {
  const out: V[] = [path[0]];
  let left = gap;
  for (let i = 1; i < path.length; i++) {
    let a = path[i - 1];
    const b = path[i];
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (d >= left) {
      a = add(a, mul(v(b.x - a.x, b.y - a.y), left / d));
      out.push(a);
      d -= left;
      left = gap;
    }
    left -= d;
  }
  return out;
};
const sq = (h: number) => [v(-h, -h), v(h, -h), v(h, h), v(-h, h), v(-h, -h)];
const bird = curve([v(-9, -1), v(-6, -5), v(-1, -5.4), v(4, -3), v(10, -6.5), v(8.6, -0.6), v(3.6, 2.6), v(-4, 3), v(-8.4, 1.4), v(-9, -1)]);
const cherries = (o: Op[], fill: (c: V) => void) => {
  In(C.sage, (o) => {
    back(o, curve([v(1, -10), v(-1, -4), v(-4, 2)]), 1.8);
    back(o, curve([v(1, -10), v(3, -4), v(5, 1)]), 1.8);
  })(o);
  [v(-4.6, 4.6), v(5.4, 3.6)].forEach(fill);
};

export const EXAMPLES: Record<string, Ex[]> = {
  'running-stitch': [
    In(C.madder, (o) => running(o, heart(v(0, 0), 11), 2, 1.3)),
    In(C.indigo, (o) => [-8, 0, 8].forEach((k) => {
      running(o, line(v(-12, k), v(12, k)), 2, 1.3);
      running(o, line(v(k, -12), v(k, 12)), 2, 1.3);
    })),
    In(C.ochre, (o) => [-3, 3].forEach((y) => running(o, line(v(-13, y), v(13, y)), 5, 1.5))),
  ],
  'back-stitch': [
    In(C.indigo, (o) => {
      back(o, line(v(-8, -8), v(-8, 6)), 2);
      back(o, curve([v(-8, 0), v(-6, -3), v(-3, -3), v(-1.5, 0), v(-1.5, 6)]), 2);
      back(o, line(v(4, -2), v(4, 6)), 2);
      back(o, line(v(4, -6.2), v(4, -5)), 1.2);
    }),
    In(C.madder, (o) => {
      back(o, [v(-9, 9), v(-9, -2), v(0, -10), v(9, -2), v(9, 9), v(-9, 9)], 2);
      back(o, [v(-2.5, 9), v(-2.5, 3), v(2.5, 3), v(2.5, 9)], 1.8);
    }),
    all(In(C.blush, (o) => satinFill(o, ring(v(0, 0), 8, 30), deg(60), 0.85)), In(C.wine, (o) => back(o, ring(v(0, 0), 8.6, 30), 2))),
  ],
  'split-stitch': [
    In(C.plum, (o) => split(o, curve([v(-12, 6), v(-6, -6), v(0, 0), v(6, 6), v(12, -6)]), 2)),
    all(In(C.moss, (o) => split(o, leafAt(v(-8, 8), -40, 20, 4.4).poly, 1.8)), In(C.moss, (o) => satinFill(o, leafAt(v(-8, 8), -40, 20, 4.4).poly, deg(50), 0.85))),
    In(C.teal, (o) => [-7.5, -5, -2.5, 0, 2.5, 5, 7.5].forEach((y, k) => {
      const x = Math.sqrt(Math.max(0, 81 - y * y));
      split(o, k % 2 ? line(v(x, y), v(-x, y)) : line(v(-x, y), v(x, y)), 1.6);
    })),
  ],
  'stem-stitch': [
    In(C.sage, (o) => stem(o, curve([v(-4, 12), v(-2, 4), v(4, -2), v(6, -8), v(3, -11), v(0, -9), v(2, -6)]), 2.2, 0.26)),
    In(C.plum, (o) => stem(o, Array.from({ length: 141 }, (_, k) => {
      const t = -Math.PI / 2 + (k / 140) * Math.PI * 6.5;
      return v(1.6 * t - 3.6 * Math.sin(t) - 14, -3.6 * Math.cos(t) + 1);
    }), 1.5, 0.24)),
    In(C.rust, (o) => {
      const p = curve([v(-12, 8), v(-4, 2), v(4, -2), v(12, -8)]);
      [-1, 0, 1].forEach((k) => stem(o, offset(p, k * 1.1), 2.2, 0.26));
    }),
  ],
  'whipped-running-stitch': [
    In(C.madder, (o) => whipped(o, curve([v(-13, 2), v(-6, -5), v(0, 2), v(6, 8), v(13, 1)]), 2.4, 1, T(C.madder, 0.9), 1.25)),
    In(C.indigo, (o) => whipped(o, line(v(-13, 0), v(13, 0)), 2.4, 1, T(C.gold, 0.9), 1.25)),
    In(C.teal, (o) => whipped(o, curve([v(-9, -9), v(9, -9), v(9, 9), v(-9, 9), v(-9, -9)]), 2.4, 1, T(C.ochre, 0.9), 1.25)),
  ],
  couching: [
    In(C.plum, (o) => couch(o, curve([v(-13, 3), v(-6, -5), v(1, 3), v(7, 7), v(13, -2)]), T(C.plum, 3.2), T(C.gold, 0.7), 3.4), 3.2),
    In(C.gold, (o) => couch(o, Array.from({ length: 49 }, (_, k) => polar(1.6 + 8 * (k / 48), deg(-90 + 620 * (k / 48)))), T(C.gold, 1.8), T(C.madder, 0.6), 2.8), 1.8),
    In(C.gold, (o) => couch(o, closed(Array.from({ length: 10 }, (_, k) => polar(k % 2 ? 4.4 : 10, deg(-90 + k * 36)))), T(C.gold, 1.8), T(C.ochre, 0.5), 2.2), 1.8),
  ],
  'chain-stitch': [
    In(C.madder, (o) => chain(o, heart(v(0, 0), 10.5), 2.4, 0.42)),
    In(C.ochre, (o) => chain(o, Array.from({ length: 61 }, (_, k) => polar(1.2 + 9 * (k / 60), deg(720 * (k / 60)))), 2.2, 0.42)),
    In(C.teal, (o) => chain(o, curve([v(6, -9), v(0, -11), v(-5, -8), v(-3, -2), v(3, 1), v(6, 6), v(1, 10), v(-6, 8)]), 2.4, 0.42)),
  ],
  'lazy-daisy': [
    all(In(C.sky, (o) => { for (let k = 0; k < 6; k++) daisy(o, v(0, 0), deg(-90 + k * 60), 1.6, 6, 0.42, 0.7); }), In(C.ochre, (o) => knot(o, v(0, 0), W))),
    all(In(C.sage, (o) => stem(o, curve([v(0, 12), v(-1, 2), v(1, -6), v(0, -12)]), 2.2, 0.26)), In(C.moss, (o) => [[-1, 7, 210], [-0.6, 2, -30], [0.6, -3, 200], [0.7, -8, -40]].forEach(([x, y, a]) => daisy(o, v(x, y), deg(a), 0, 4.6, 0.46, 0.5)))),
    In(C.rose, (o) => [[-8, -6, 20], [2, -9, 110], [9, -4, 200], [-5, 3, 290], [5, 4, 60], [-1, 10, 160], [-10, 8, 240], [10, 8, 330]].forEach(([x, y, a]) => daisy(o, v(x, y), deg(a), 0, 3.4, 0.46, 0.5))),
  ],
  'fly-stitch': [
    In(C.sage, (o) => {
      for (let k = 0; k < 6; k++) {
        const y = -10 + k * 3.4;
        const wd = 2.2 + k * 0.7;
        fly(o, v(-wd, y), v(wd, y), v(0, y + 2.4), v(0, y + 3.4));
      }
    }),
    In(C.moss, (o) => [[-9, 5], [-4, 7], [1, 4.4], [6, 6.4], [10, 5]].forEach(([x, h]) => fly(o, v(x - 2, 6 - h), v(x + 2, 6 - h), v(x, 6), v(x, 11)))),
    In(C.indigo, (o) => [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5].forEach((x) => fly(o, v(x - 2, -2), v(x + 2, -2), v(x, 1.6), v(x, 2.4)))),
  ],
  'feather-stitch': [
    In(C.teal, (o) => feather(o, v(-0.8, -12), v(0, 1), v(1, 0), 3.2, 2.4, 9)),
    all(In(C.gold, (o) => back(o, line(v(-13, 0), v(13, 0)), 2.2)), In(C.plum, (o) => feather(o, v(-12, -0.8), v(1, 0), v(0, 1), 3.2, 2.4, 10))),
    all(In(C.blush, (o) => feather(o, v(-12, -6.8), v(1, 0), v(0, 1), 2.6, 2.4, 10)), In(C.sky, (o) => feather(o, v(-12, 3.2), v(1, 0), v(0, 1), 2.6, 2.4, 10))),
  ],
  'blanket-stitch': [
    all(In('#e9c7a4', (o) => satinFill(o, sq(8.6), deg(0), 0.9)), In(C.indigo, (o) => blanket(o, sq(9), 2.2, 1.8, 1))),
    all(In(C.madder, (o) => satinFill(o, heart(v(0, 0), 9.4), deg(90), 0.85)), In(C.ochre, (o) => blanket(o, heart(v(0, 0), 10), 2, 1.8, 1))),
    In(C.teal, (o) => blanket(o, ring(v(0, 0), 9, 40), 6.4, 1.9, 1)),
  ],
  'cretan-stitch': [
    In(C.moss, (o) => cretan(o, curve([v(-11, 6), v(0, 1), v(11, -6)]), 12, leafW(5.6), 0.6)),
    In(C.rose, (o) => cretan(o, line(v(-13, 0), v(13, 0)), 11, () => 2.6, 0.5)),
    In(C.sage, (o) => cretan(o, curve([v(-11, 8), v(-3, -1), v(9, -8)]), 9, leafW(5), 1.6)),
  ],
  'cross-stitch': [
    In(C.indigo, (o) => crossCells(o, v(-6.25, -6.25), 2.5, ['..X..', '.X.X.', 'X.X.X', '.X.X.', '..X..'])),
    In(C.madder, (o) => crossCells(o, v(-6.25, -6.25), 2.5, ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'])),
    In(C.madder, (o) => crossCells(o, v(-8.75, -7.5), 2.5, ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'])),
  ],
  'herringbone-stitch': [
    In(C.teal, (o) => herringbone(o, v(-12.5, 0), 3.4, 3.1, 1.05, 11)),
    all(In(C.gold, (o) => back(o, line(v(-13, 0), v(13, 0)), 2.2)), In(C.indigo, (o) => herringbone(o, v(-12.5, 0), 3.6, 3.1, 1.05, 11))),
    In(C.blush, (o) => herringbone(o, v(-10, 0), 4, 2.2, 1.1, 18)),
  ],
  'satin-stitch': [
    In(C.madder, (o) => [[-6, -4, 3.2], [3, -6, 2.6], [5, 4, 3.4], [-4, 6, 2.4]].forEach(([x, y, r]) => satinFill(o, ring(v(x, y), r, 24), deg(70), 0.8))),
    In(C.plum, (o) => fan(o, v(0, 0), deg(45), deg(315), 46, () => 5.4, () => 9.4)),
    (o) => cherries(o, (c) => In(C.madder, (o) => satinFill(o, ring(c, 3.4, 24), deg(70), 0.8))(o)),
  ],
  'long-and-short-stitch': [
    (o) => longShortFill(o, ring(v(0, 0), 9, 36), deg(90), 0.85, T(C.blush, W), T(C.wine, W)),
    (o) => longShortFill(o, leafAt(v(-9, 9), -45, 24, 6).poly, deg(45), 0.85, T(C.leaf, W), T(C.sage, W)),
    (o) => longShortFill(o, curve([v(0, 10), v(-7, 2), v(-6, -6), v(0, -10), v(6, -6), v(7, 2), v(0, 10)]), deg(90), 0.85, T(C.blush, W), T(C.pink, W)),
  ],
  'fishbone-stitch': [
    In(C.sage, (o) => fishbone(o, leafAt(v(-7, 9), -50, 22, 4.6).axis, leafW(4.6), 10, W)),
    In(C.sky, (o) => fishbone(o, curve([v(9, -11), v(2, -2), v(-9, 11)]), leafW(2.6), 12, W)),
    all(In(C.sage, (o) => stem(o, line(v(0, 13), v(0, 7)), 2, 0.26)), In(C.pink, (o) => [-42, 0, 42].forEach((a) => fishbone(o, leafAt(v(0, 7), -90 + a, 13, 2.8).axis, leafW(2.8), 7, W)))),
  ],
  'seed-stitch': [
    In(C.ochre, (o) => seeds(o, v(0, 0), 10, 34, 1.3, 3, 2.3)),
    In(C.indigo, (o) => [[-12, -4, 1.7], [-4, 4, 2.6], [4, 12, 3.8]].forEach(([x0, x1, g], k) => seeds(o, v((x0 + x1) / 2, 0), 9, 40, 1.3, 11 + k, g, (p) => p.x >= x0 && p.x < x1 && Math.abs(p.y) < 8))),
    all(In(C.madder, (o) => back(o, heart(v(0, 0), 8), 1.8)), In(C.blush, (o) => seeds(o, v(0, 0), 13, 26, 1.1, 5, 3, (p) => !inside(heart(v(0, 0), 10), p)))),
  ],
  'woven-wheel': [
    In(C.rose, (o) => wheel(o, v(0, 0), 10, W, 5)),
    all(In(C.wine, (o) => [v(-6, 2), v(6, 2)].forEach((c) => wheel(o, c, 4.4, W, 5))), In(C.wine, (o) => wheel(o, v(0, -6), 4.4, W, 5))),
    all(In(C.rose, (o) => wheel(o, v(-4, -2), 7, W, 5)), In(C.blush, (o) => wheel(o, v(7, 5), 4.4, W, 5)), In(C.wine, (o) => wheel(o, v(6, -7), 3.2, W, 5))),
  ],
  'french-knot': [
    all(In(C.sky, (o) => { for (let k = 0; k < 6; k++) daisy(o, v(0, 0), deg(-90 + k * 60), 3, 6, 0.42, 0.7); }), In(C.ochre, (o) => [v(0, 0), v(1.8, 0.6), v(-1.7, 0.8), v(0.3, -1.8), v(-0.4, 1.9), v(1.4, -1.4), v(-1.5, -1.2)].forEach((p) => knot(o, p, W)))),
    all(In(C.indigo, (o) => back(o, bird, 1.8)), In(C.ochre, (o) => back(o, [v(-9, -2.4), v(-12, -1.2), v(-9, 0)], 1.4)), In('#2a211b', (o) => knot(o, v(-5.6, -2.6), W))),
    all(
      In('#f6f1e6', (o) => { for (let y = -5; y <= 5; y += 2.2) for (let x = -8; x <= 8; x += 2.3) if ((x / 9) ** 2 + (y / 6) ** 2 < 1) knot(o, v(x + (y % 4.4 ? 1.1 : 0), y), W); }),
      In('#2a211b', (o) => { back(o, line(v(-4, 5), v(-4, 10)), 1.6); back(o, line(v(4, 5), v(4, 10)), 1.6); satinFill(o, ring(v(10.5, -2), 2.6, 18), deg(80), 0.8); }),
    ),
  ],
  'colonial-knot': [
    In(C.madder, (o) => [-10, -6.6, -3.3, 0, 3.3, 6.6, 10].forEach((x) => knot(o, v(x, 0), W, 2, 'colonial'))),
    In('#f4ead2', (o) => along(heart(v(0, 0), 10.5), 3).slice(0, -1).forEach((p) => knot(o, p, W, 2, 'colonial'))),
    all(
      In(C.sage, (o) => back(o, curve([v(0, -12), v(1, -9), v(0, -7)]), 1.5)),
      In(C.plum, (o) => [[-5, 0, 4], [-3.3, 3, 3], [-1.7, 6, 2], [0, 9, 1]].forEach(([x0, y, n]) => { for (let k = 0; k < n; k++) knot(o, v(x0 + k * 3.4 - 0.2, y - 5), W, 2, 'colonial'); })),
      In(C.moss, (o) => daisy(o, v(0.5, -7.5), deg(-20), 0, 5, 0.46, 0.5)),
    ),
  ],
  'bullion-knot': [
    all(
      In(C.wine, (o) => { bullion(o, v(-1.6, 0.8), v(1.6, -0.8), 6); bullion(o, v(-1.4, 2.2), v(2, 0.6), 6); }),
      In(C.rose, (o) => { for (let k = 0; k < 5; k++) bullion(o, polar(4, deg(k * 72 - 10)), polar(4, deg(k * 72 + 80)), 10); }),
      In(C.blush, (o) => { for (let k = 0; k < 7; k++) bullion(o, polar(7, deg(k * 51.4 + 20)), polar(7, deg(k * 51.4 + 90)), 13); }),
    ),
    all(In(C.sage, (o) => stem(o, curve([v(0, 13), v(0.4, 2), v(-0.3, -12)]), 2.2, 0.26)), In('#8a6fb8', (o) => [-11, -8, -5, -2, 1].forEach((y, k) => bullion(o, v(0, y), add(v(0, y), polar(3.6, deg(k % 2 ? -150 : -30))), 7)))),
    all(
      In(C.moss, (o) => arc(v(0, 10), 11, 205, 330, 9).forEach((p) => {
        const n = mul(add(p, mul(v(0, 10), -1)), 1 / 11);
        bullion(o, add(p, mul(n, 1.8)), add(p, mul(n, -1.8)), 6);
      })),
      In('#2a211b', (o) => knot(o, add(v(0, 10), polar(11, deg(342))), W)),
    ),
  ],
  'pistil-stitch': [
    In(C.plum, (o) => { for (let k = 0; k < 5; k++) pistil(o, v(0, 8), deg(-90 + (k - 2) * 20), 0.6, 13); }),
    all(In(C.madder, (o) => { for (let k = 0; k < 10; k++) pistil(o, v(0, 0), deg(k * 36), 1, 8); }), In(C.gold, (o) => { for (let k = 0; k < 10; k++) pistil(o, v(0, 0), deg(k * 36 + 18), 1, 4.4); })),
    all(
      In(C.sage, (o) => [[-6, 12, -7, -4], [0, 12, 0, -7], [6, 12, 7, -3]].forEach(([a, b, c, d]) => stem(o, curve([v(a, b), v((a + c) / 2, (b + d) / 2), v(c, d)]), 2.2, 0.26))),
      In(C.plum, (o) => [v(-7, -4), v(0, -7), v(7, -3)].forEach((c) => { for (let k = 0; k < 7; k++) pistil(o, c, deg(-90 + (k - 3) * 30), 0.6, 3.4); })),
    ),
  ],
  'four-legged-knot': [
    In(C.gold, (o) => [[-6, -5, 2.6], [6, -2, 1.8], [-1, 7, 1.4]].forEach(([x, y, s]) => fourLegged(o, v(x, y), s))),
    In(C.teal, (o) => [-7, 0, 7].forEach((y) => [-7, 0, 7].forEach((x) => fourLegged(o, v(x, y), 1.6)))),
    all(In(C.pink, (o) => fourLegged(o, v(-6, -4), 2)), In(C.ochre, (o) => fourLegged(o, v(5, -5), 2)), In(C.sky, (o) => fourLegged(o, v(0, 5), 2))),
  ],
  'coral-stitch': [
    In(C.indigo, (o) => coral(o, line(v(-13, 0), v(13, 0)), 2.6)),
    In(C.rust, (o) => {
      coral(o, curve([v(0, 12), v(-1, 3), v(1, -4), v(0, -12)]), 2.6);
      coral(o, curve([v(-0.6, 4), v(-5, -1), v(-8, -6)]), 2.4);
      coral(o, curve([v(0.8, -2), v(5, -6), v(7, -10)]), 2.4);
    }),
    In(C.teal, (o) => [-7, 0, 7].forEach((x, k) => coral(o, curve([v(x, 12), v(x - 2, 6), v(x + 2, 0), v(x - 1, -6 - k * 2)]), 2.4))),
  ],
};

/** The picture for `good[k]` of stitch `slug`. */
export function example(slug: string, k: number): Demo {
  const o: Op[] = [];
  EXAMPLES[slug][k](o);
  return { ops: o, th: T(C.madder, W), fast: 0.25 };
}

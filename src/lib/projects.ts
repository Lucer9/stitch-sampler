import { compile, frameAt, type Op, type Thread } from './engine.ts';
import {
  T, track, curve, stem, back, daisy, fly, fishbone, seeds, knot, bullion, wheel, satinFill, longShortFill, inside, type Demo,
} from './stitches.ts';
import { type V, v, add, sub, mul, perp, polar, norm } from './geom.ts';

/** What the player needs to teach something: a step per caption, a hoop zoom and the moves. */
export interface Lesson {
  steps: string[];
  R?: number;
  knot?: boolean;
  demo: () => Demo;
  /** Pattern lines traced on the cloth before stitching. */
  pen?: V[][];
}

/** One colour of a project, worked in one stitch. */
export interface Part {
  stitch: string;
  floss: [name: string, color: string];
  /** Extra colours the part switches to. */
  also?: [name: string, color: string][];
  step: string;
  make: (o: Op[], th: Thread) => void;
  /** The pattern lines for this part; left out, they are traced from the finished stitches. */
  outline?: V[][];
}

export interface Project {
  slug: string;
  name: string;
  level: 1 | 2 | 3;
  blurb: string;
  R: number;
  parts: Part[];
}

const W = 1.3;
const deg = (d: number) => (d * Math.PI) / 180;
export const ring = (c: V, r: number, n = 28) => Array.from({ length: n + 1 }, (_, k) => add(c, polar(r, (k / n) * Math.PI * 2)));
export const closed = (poly: V[]) => [...poly, poly[0]];
export const leafW = (max: number) => (t: number) => max * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.8;
/** The outline of a leaf drawn along `axis` with half-width `hw`. */
export const leafLine = (axis: V[], hw: (t: number) => number) => {
  const A = track(axis);
  const edge = (k: number) => Array.from({ length: 17 }, (_, j) => add(A.p((j / 16) * A.L), mul(A.n((j / 16) * A.L), k * hw(j / 16))));
  return closed([...edge(1), ...edge(-1).reverse()]);
};
/** A leaf's axis from its tip to `base`, bowed a little to one side. */
const leaf = (base: V, ang: number, len: number, bow = 0.6) => {
  const u = polar(1, ang);
  return curve([add(base, mul(u, len)), add(add(base, mul(u, len / 2)), mul(perp(u), bow)), base]);
};

function lavender(): Project {
  const stems = [
    curve([v(-3.2, 25), v(-1.2, 14), v(-4.5, -2), v(-9.5, -20)]),
    curve([v(0, 26), v(0, 14), v(0.6, -4), v(1.2, -24)]),
    curve([v(3.2, 25), v(1.2, 14), v(5.5, -2), v(10.5, -18)]),
  ].map(track);
  /** A point `f` of the way up a stem, nudged `side` units sideways, and the way up there. */
  const up = (S: (typeof stems)[number], f: number, side = 0) => {
    const s = f * S.L;
    const d = S.d(s);
    return { p: add(S.p(s), mul(perp(d), side)), d };
  };
  const band = [v(-5.2, 13.4), v(0, 12.7), v(5.2, 13.4), v(5.2, 16.4), v(0, 15.7), v(-5.2, 16.4)];
  const FS = [0.57, 0.64, 0.71, 0.78, 0.85, 0.91];
  return {
    slug: 'lavender-sprig', name: 'Lavender sprig', level: 1, R: 31,
    blurb: 'Three stalks of lavender tied with a ribbon. A first project that teaches five stitches.',
    parts: [
      {
        stitch: 'stem-stitch', floss: ['Sage', '#557a3f'],
        step: 'Stem stitch the three stalks, working from the bottom up so the twist runs the same way.',
        make: (o) => stems.forEach((S) => stem(o, Array.from({ length: 41 }, (_, k) => S.p((S.L * k) / 40)), 2.4, 0.28)),
        outline: stems.map((S) => Array.from({ length: 41 }, (_, k) => S.p((S.L * k) / 40))),
      },
      {
        stitch: 'lazy-daisy', floss: ['Lavender', '#8a6fb8'],
        step: 'Lazy daisy buds up the top of each stalk, angled outwards and getting smaller towards the tip.',
        make: (o) => stems.forEach((S) => {
          FS.forEach((f, k) => {
            const side = k % 2 ? 1 : -1;
            const { p, d } = up(S, f, side * 0.5);
            daisy(o, p, Math.atan2(d.y, d.x) + side * deg(38), 0, 3.5 - (f - 0.57) * 3, 0.42, 0.5);
          });
          const { p, d } = up(S, 0.97);
          daisy(o, p, Math.atan2(d.y, d.x), 0, 2.4, 0.42, 0.5);
        }),
      },
      {
        stitch: 'french-knot', floss: ['Lilac', '#b39ad8'],
        step: 'A French knot at the very tip of each stalk, and one tucked between the buds.',
        make: (o) => stems.forEach((S) => {
          const tip = up(S, 1);
          knot(o, add(tip.p, mul(tip.d, 1.6)), W);
          knot(o, up(S, 0.675, 1.6).p, W);
        }),
      },
      {
        stitch: 'satin-stitch', floss: ['Dusty rose', '#c4566a'],
        step: 'Satin stitch a band across the stalks where they meet, stitches running top to bottom.',
        make: (o) => satinFill(o, band, deg(90), 0.85),
        outline: [closed(band)],
      },
      {
        stitch: 'lazy-daisy', floss: ['Dusty rose', '#c4566a'],
        step: 'Two big lazy daisy loops either side of the band make the bow.',
        make: (o) => {
          daisy(o, v(-5, 14.9), deg(195), 0, 5, 0.5, 0.5);
          daisy(o, v(5, 14.9), deg(-15), 0, 5, 0.5, 0.5);
        },
      },
      {
        stitch: 'back-stitch', floss: ['Dusty rose', '#c4566a'],
        step: 'Back stitch two ribbon tails trailing down from the bow.',
        make: (o) => {
          back(o, curve([v(-1.6, 16.2), v(-4.4, 19), v(-6.2, 23.4)]), 1.9);
          back(o, curve([v(1.6, 16.2), v(4.6, 18.6), v(6.4, 22.8)]), 1.9);
        },
      },
    ],
  };
}

function toadstool(): Project {
  const cap = [
    ...Array.from({ length: 25 }, (_, k) => v(14 * Math.cos(Math.PI + (k / 24) * Math.PI), -2 + 13 * Math.sin(Math.PI + (k / 24) * Math.PI))),
    ...Array.from({ length: 11 }, (_, k) => v(14 - (28 * (k + 1)) / 12, -2 - 1.6 * Math.sin((Math.PI * (k + 1)) / 12))),
  ];
  const foot = [v(-3.6, -0.6), v(3.6, -0.6), v(4.6, 12.6), v(3.4, 15), v(-3.4, 15), v(-4.6, 12.6)];
  const spots = [v(-7.4, -7.6), v(0.4, -11), v(7, -8.6), v(-2.4, -5.2), v(9.6, -4.4), v(-10.6, -4), v(3.6, -5)];
  return {
    slug: 'toadstool', name: 'Toadstool', level: 2, R: 26,
    blurb: 'A spotted toadstool on a tuft of grass. Satin for the cap, shading for the stalk, knots and seeds for texture.',
    parts: [
      {
        stitch: 'satin-stitch', floss: ['Madder red', '#b0372c'],
        step: 'Satin stitch the cap with stitches running top to bottom, packed close so no cloth shows.',
        make: (o) => satinFill(o, cap, deg(90), 0.85),
        outline: [closed(cap)],
      },
      {
        stitch: 'colonial-knot', floss: ['Cream', '#f4ead2'],
        step: 'Colonial knots for the spots, worked on top of the satin.',
        make: (o) => spots.forEach((p) => knot(o, p, W, 2, 'colonial')),
      },
      {
        stitch: 'back-stitch', floss: ['Biscuit', '#c9a77a'],
        step: 'Back stitch the line of the gills under the rim of the cap.',
        make: (o) => back(o, curve([v(-12, -1.2), v(0, -0.2), v(12, -1.2)]), 2),
        outline: [curve([v(-12, -1.2), v(0, -0.2), v(12, -1.2)])],
      },
      {
        stitch: 'long-and-short-stitch', floss: ['Ecru', '#efe3c8'], also: [['Oat', '#c8ad80']],
        step: 'Long and short down the stalk: alternate long and short stitches in ecru, then fill below in the darker oat.',
        make: (o, th) => longShortFill(o, foot, deg(90), 0.85, th, T('#c8ad80', W)),
        outline: [closed(foot)],
      },
      {
        stitch: 'fly-stitch', floss: ['Moss', '#6a8431'],
        step: 'Fly stitch tufts of grass either side of the stalk.',
        make: (o) => [-12.5, -8.5, 8.5, 12.5].forEach((x, k) => {
          const h = k % 3 ? 2.6 : 3.2;
          fly(o, v(x - 2, 15.6 - h), v(x + 2, 15.6 - h), v(x, 15.6), v(x, 17));
        }),
      },
      {
        stitch: 'seed-stitch', floss: ['Earth', '#8a5a2b'],
        step: 'Seed stitch the soil underneath, scattered in every direction.',
        make: (o) => seeds(o, v(0, 18.8), 15, 26, 1.2, 9, 2.1, (p) => ((p.x / 15) ** 2 + ((p.y - 18.8) / 2.8) ** 2 < 1) && !inside(foot, p)),
        outline: [],
      },
    ],
  };
}

function posy(): Project {
  const roses: [V, number, string][] = [[v(-7, -5), 5, '#c4566a'], [v(7, -7), 4.6, '#d98a94'], [v(-0.5, -16), 4.2, '#a8384f']];
  const stems = [
    curve([v(0, 22), v(-2, 12), v(-6, 3), v(-7, 0.4)]),
    curve([v(0.5, 22), v(2.5, 10), v(6, 1), v(7, -2)]),
    curve([v(0.2, 22), v(0.6, 8), v(0, -4), v(-0.4, -11.4)]),
    curve([v(-5.2, 4), v(-10, -4.6), v(-12.6, -10.6)]),
    curve([v(5, 1), v(10, -6.4), v(12.4, -12)]),
  ];
  const buds: [V, V][] = [[v(-12.6, -10.6), norm(v(-2.6, -6))], [v(12.4, -12), norm(v(2.4, -5.6))]];
  const leaves = [leaf(v(-3, 12), deg(200), 8), leaf(v(3, 10.5), deg(-18), 8, -0.6), leaf(v(-10.4, 0.6), deg(165), 7.4), leaf(v(10.4, -1.4), deg(12), 7, -0.6)];
  const breath = [v(-6.6, -20.6), v(-8.6, -18.4), v(-5, -22.8), v(6, -19.6), v(7.8, -17.4), v(4.4, -21.8), v(-15.4, -3.4), v(-16.6, -6), v(15.6, -5.6), v(16.4, -8.4)];
  return {
    slug: 'rose-posy', name: 'Rose posy', level: 3, R: 29,
    blurb: 'Woven roses with bullion buds, fishbone leaves and a cloud of baby’s breath. Raised stitches that stand off the cloth.',
    parts: [
      {
        stitch: 'stem-stitch', floss: ['Forest', '#4f6f3a'],
        step: 'Stem stitch the stems, the long ones first, then the two branches out to the buds.',
        make: (o) => stems.forEach((p) => stem(o, p, 2.2, 0.26)),
        outline: stems,
      },
      {
        stitch: 'fishbone-stitch', floss: ['Sage', '#6f8f4a'],
        step: 'Fishbone stitch four leaves off the stems, each stitch crossing just past the centre line.',
        make: (o) => leaves.forEach((ax) => fishbone(o, ax, leafW(2.5), 7, W)),
        outline: leaves.map((ax) => leafLine(ax, leafW(2.5))),
      },
      {
        stitch: 'woven-wheel', floss: ['Rose', '#c4566a'], also: [['Blush', '#d98a94'], ['Deep rose', '#a8384f']],
        step: 'Woven wheel roses: five spokes each, then weave over and under from the middle out until the spokes are hidden.',
        make: (o, th) => roses.forEach(([c, r, color], k) => {
          const at = o.length;
          wheel(o, c, r, W, 5, deg(-90 + k * 23));
          o[at] = { ...o[at], th: k ? T(color, W) : th };
        }),
        outline: roses.map(([c, r]) => ring(c, r * 0.72)),
      },
      {
        stitch: 'bullion-knot', floss: ['Deep rose', '#a8384f'],
        step: 'Two bullion knots side by side at the end of each branch make a rosebud.',
        make: (o) => buds.forEach(([p, d]) => {
          const n = perp(d);
          bullion(o, sub(p, mul(n, 0.8)), add(add(p, mul(d, 3.6)), mul(n, 0.8)), 6);
          bullion(o, add(p, mul(n, 0.8)), sub(add(p, mul(d, 3.6)), mul(n, 0.8)), 6);
        }),
      },
      {
        stitch: 'french-knot', floss: ['Ivory', '#f6f1e6'],
        step: 'Scatter French knots in little clusters for baby’s breath.',
        make: (o) => breath.forEach((p) => knot(o, p, W)),
      },
    ],
  };
}

export const PROJECTS: Project[] = [lavender(), toadstool(), posy()];
export const projectBySlug = (slug: string) => PROJECTS.find((p) => p.slug === slug)!;

/** Moves of one part, with its colour on the first move. */
function partOps(part: Part, k: number): Op[] {
  const th = T(part.floss[1], W);
  const o: Op[] = [];
  part.make(o, th);
  return o.map((op, j) => ({ ...op, th: j === 0 ? op.th ?? th : op.th, cap: j === 0 ? k : undefined }));
}

/** Pattern lines traced from what a part leaves on the front. */
function traced(ops: Op[], th: Thread): V[][] {
  const prog = compile(ops, { th });
  return frameAt(prog, prog.dur + 1).pieces.flatMap((p) => {
    if (p.side !== 'front') return [];
    if (p.t === 'line') return [p.pts];
    if (p.t === 'knot') return [ring(p.c, p.r * 0.6, 12)];
    if (p.t === 'coils') return [[p.a, p.b]];
    return [];
  });
}

/** A project as something the player can teach: one step per part, the pattern traced on the cloth first. */
export function lesson(p: Project): Lesson {
  const ops = p.parts.flatMap((part, k) => partOps(part, k));
  const pen = p.parts.flatMap((part, k) => part.outline ?? traced(partOps(part, k), T(part.floss[1], W)));
  return {
    steps: p.parts.map((part) => part.step),
    R: p.R,
    pen,
    demo: () => ({ ops, th: T(p.parts[0].floss[1], W), fast: 0.3 }),
  };
}

/** Every colour a project uses, once. */
export function floss(p: Project): [string, string][] {
  const seen = new Map<string, string>();
  for (const part of p.parts) for (const [n, c] of [part.floss, ...(part.also ?? [])]) seen.set(c, n);
  return [...seen].map(([c, n]) => [n, c]);
}


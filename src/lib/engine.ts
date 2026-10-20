import {
  type V, v, add, sub, mul, lerp, dist, norm, perp, rot, clamp01, mix, inOut, out, span,
  spline, lengths, at, slice, resample, lerpPath, quad, cubic,
} from './geom.ts';

export type Side = 'front' | 'back';
export interface Thread { color: string; width: number }
/** Fractions `a`..`b` of a surface path that pass under the thread laid by op `ref`. */
export interface Under { a: number; b: number; ref: number }

type Base = { cap?: number | number[]; th?: Thread };
export type Op = Base & (
  | { k: 'up'; p: V; catch?: boolean; fresh?: boolean }
  | { k: 'down'; p: V; loop?: 'round' | 'sharp'; wf?: number; via?: V[] }
  | { k: 'knot'; to: V; wraps: number; style?: 'french' | 'colonial' }
  | { k: 'bullion'; to: V; wraps: number }
  | { k: 'coral'; at: V }
  | { k: 'tie'; at: V; under: number }
  | { k: 'surface'; via: V[]; unders?: Under[]; raw?: boolean }
);

export type Piece =
  | { t: 'line'; pts: V[]; th: Thread; z: number; side: Side; live?: boolean; bare?: boolean; lift?: number }
  | { t: 'knot'; c: V; r: number; th: Thread; z: number; side: Side; style: 'french' | 'colonial' | 'coral'; form: number; spin: number }
  | { t: 'coils'; a: V; b: V; n: number; th: Thread; z: number; side: Side; lift: number }
  | { t: 'wrap'; c: V; d: V; th: Thread; z: number; side: Side; sweep: number; half: 'back' | 'front'; fig8: boolean }
  | { t: 'tail'; c: V; d: V; th: Thread; z: number; side: Side; end: boolean };

export interface Needle {
  tip: V; d: V; flat: number; vis: number; lift: number; side: Side; z: number; len: number; w: number;
  /** Which end is inside the fabric: `tip` while diving, `eye` while coming up. */
  cut?: 'tip' | 'eye';
  /** Fractions of the needle, measured from the tip, hidden under the fabric. */
  hide?: [number, number];
  /** Which end hangs lowest while the needle is clear of the cloth: -1 the eye, 1 the tip. Its shadow follows. */
  lean?: number;
}
export interface Hole { p: V; n: number; up: boolean; ev: number }
export interface Frame { pieces: Piece[]; needle: Needle | null; cap: number; ev: number }
/** What the side view needs to know about an event. */
export interface Sec {
  z: number; k: Op['k'] | 'end'; a: V | null; b: V | null; th: Thread;
  sp?: number; wraps?: number; style?: 'french' | 'colonial'; far?: boolean;
}
export interface Ev { t0: number; t1: number; cap?: number | number[]; phases?: number[]; hole?: Hole; sec: Sec; build: (q: number, f: Frame, t: number) => void }
export interface Program { evs: Ev[]; dur: number; holes: Hole[]; box: { x0: number; y0: number; x1: number; y1: number } }

export const NZ = 1e6;

interface Loop { a: V; b: V; c: V; style: 'round' | 'sharp'; wf: number; c0: number; c1: number }

function petal(a: V, b: V, c: V, wf: number): V[] {
  const m = lerp(a, b, 0.5);
  const axis = sub(c, m);
  const L = Math.hypot(axis.x, axis.y) || 1;
  const u = norm(axis);
  const n = perp(u);
  const side = dist(a, b) < 1e-6 ? 1 : Math.sign((a.x - m.x) * n.x + (a.y - m.y) * n.y) || 1;
  const w = wf * L * side;
  const one = cubic(a, add(add(a, mul(u, L * 0.4)), mul(n, w * 0.95)), add(c, mul(n, w * 0.6)), c, 16);
  const two = cubic(c, sub(c, mul(n, w * 0.6)), sub(add(b, mul(u, L * 0.4)), mul(n, w * 0.95)), b, 16);
  return [...one, ...two.slice(1)];
}

function sharp(a: V, b: V, c: V): V[] {
  const r = 0.12;
  return [a, ...quad(lerp(c, a, r), c, lerp(c, b, r), 8), b];
}

/** The loop before it is caught; `k` stretches it, for slack not yet pulled through. */
function looseLoop(l: Loop, k = 1): V[] {
  const m = lerp(l.a, l.b, 0.5);
  return resample(petal(l.a, l.b, add(m, mul(sub(l.c, m), 1.25 * k)), Math.max(l.wf, 0.34) * (1.15 + (k - 1) * 0.3)), 40);
}

/** How far the needle overshoots the loop it lays, so pulling from behind can shrink it. */
const SLACK = 1.3;

function loopShape(l: Loop, pull: number, t: number): V[] {
  const loose = looseLoop(l);
  if (pull < 1) return lerpPath(looseLoop(l, SLACK), loose, inOut(pull));
  const tight = clamp01((t - l.c0) / (l.c1 - l.c0));
  if (tight <= 0) return loose;
  const shape = resample(l.style === 'round' ? petal(l.a, l.b, l.c, l.wf) : sharp(l.a, l.b, l.c), 40);
  return lerpPath(loose, shape, inOut(tight));
}

/** `pts` with its last `cut` units, the part still on the needle, replaced by a run to the eye. */
function toEye(pts: V[], eye: V, cut: number): V[] {
  const acc = lengths(pts);
  const L = acc[acc.length - 1];
  return L <= cut ? [pts[0], eye] : [...slice(pts, 0, 1 - cut / L, acc), eye];
}

const sag = (a: V, b: V, k = 1): V[] => {
  const L = dist(a, b);
  return quad(a, add(lerp(a, b, 0.5), v(0, Math.min(1.4, L * 0.08) * k)), b, 8);
};

/** Tilt of the needle off its direction of travel, so the trailing thread stays visible. */
const TILT = 0.55;
/** Share of the needle that shows when it has just come up or is about to go down. */
const P0 = 0.42;

function target(op: Op | undefined): V | null {
  if (!op) return null;
  switch (op.k) {
    case 'up': case 'down': return op.p;
    case 'knot': case 'bullion': return op.to;
    case 'coral': case 'tie': return op.at;
    case 'surface': return op.via[0];
  }
}

export interface CompileOpts {
  th: Thread;
  /** Needle length in fabric units. */
  needle?: number;
  /** Ops played at full length before the tempo speeds up. */
  slow?: number;
  /** Duration multiplier after the first `slow` ops. */
  fast?: number;
  /** Global duration multiplier. */
  pace?: number;
}

export function compile(ops: Op[], o: CompileOpts): Program {
  const evs: Ev[] = [];
  const holes: Hole[] = [];
  const NL = o.needle ?? o.th.width * 10;
  const W = () => th.width;
  let t = 0;
  let cur: V | null = null;
  let th = o.th;
  let hn = 0;
  let pending: Loop | null = null;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (p: V, r = 0) => {
    box.x0 = Math.min(box.x0, p.x - r); box.y0 = Math.min(box.y0, p.y - r);
    box.x1 = Math.max(box.x1, p.x + r); box.y1 = Math.max(box.y1, p.y + r);
  };
  let sec: Sec = { z: -1, k: 'end', a: null, b: null, th: o.th };
  const push = (dur: number, cap: Op['cap'], hole: Hole | undefined, build: Ev['build'], phases?: number[]) => {
    if (hole) { hole.ev = evs.length; holes.push(hole); }
    evs.push({ t0: t, t1: t + dur, cap, phases, hole, build, sec });
    t += dur;
  };
  /**
   * The needle comes up steeply, is pulled clear so the thread follows it out of the hole, rises off the cloth,
   * hops to the next hole and stabs down. Between moves it hovers at `R0`, its eye `OUT` past the last hole.
   */
  const OUT = NL * 0.5;
  const R0 = { lift: 2.6, flat: P0 };
  /** Projection of a needle stabbing straight down. */
  const STAB = 0.24;
  const rest = (p: V, d: V) => add(p, mul(d, NL * R0.flat + OUT));
  /** Where the needle was left above the cloth by the last move, so the next one starts from there; null once it dives. */
  type Pose = { tip: V; d: V; flat: number; lift: number; lean: number };
  let pose: Pose | null = null;
  const resume = (a: V, d: V): Pose => pose ?? { tip: rest(a, d), d, flat: R0.flat, lift: R0.lift, lean: -1 };
  /** A needle nearer the eye looks bigger. */
  const needle = (n: Partial<Needle> & { tip: V; d: V }): Needle => ({
    flat: 0.5, vis: 1, lift: 0, side: 'front', z: NZ, len: NL, w: th.width, ...n,
    ...(n.side !== 'back' ? { w: th.width * (1 + (n.lift ?? 0) * 0.07) } : {}),
  });
  /** Direction from `p` to the first later target that is not `p` itself. */
  const aim = (p: V, i: number): V => {
    for (let j = i + 1; j < Math.min(ops.length, i + 4); j++) {
      const q = target(ops[j]);
      if (q && dist(p, q) > 0.5) return norm(sub(q, p));
    }
    return v(1, 0);
  };

  ops.forEach((op, i) => {
    const tempo = (i < (o.slow ?? 8) ? 1 : o.fast ?? 0.6) * (o.pace ?? 1);
    const fresh = op.k === 'up' && (!cur || !!op.fresh || (!!op.th && op.th !== th));
    if (op.th) th = op.th;
    const thr = th;
    const w = W();
    const zi = i;
    const next = target(ops[i + 1]);

    switch (op.k) {
      case 'up': {
        const a = cur;
        const p = op.p;
        grow(p, w);
        const nd = rot(aim(p, i), TILT);
        const travel = fresh || !a ? 0 : (0.22 + dist(a, p) * 0.016) * tempo;
        const emerge = 0.62 * tempo;
        const T = travel + emerge;
        const sp = travel / T;
        if (op.catch && pending) {
          pending.c0 = t + travel;
          pending.c1 = t + T + 0.4 * tempo;
          pending = null;
        }
        const end = fresh ? a : null;
        sec = { z: zi, k: 'up', a, b: p, th: thr, sp };
        pose = { tip: rest(p, nd), d: nd, flat: R0.flat, lift: R0.lift, lean: -1 };
        push(T, op.cap, { p, n: ++hn, up: true, ev: 0 }, (q, f) => {
          if (end) f.pieces.push({ t: 'tail', c: end, d: v(0.6, 0.8), th: thr, z: -1, side: 'back', end: true });
          if (fresh || !a) {
            f.pieces.push({ t: 'tail', c: p, d: nd, th: thr, z: -1, side: 'back', end: false });
          } else {
            const s = inOut(span(q, 0, sp));
            const dB = rot(norm(sub(p, a)), TILT);
            const LB = NL * Math.max(0.12, Math.min(P0 + 0.2, dist(a, p) / NL));
            const tip = lerp(add(a, mul(dB, LB)), p, s);
            const end = q < sp ? sub(tip, mul(dB, LB)) : lerp(sub(p, mul(dB, LB)), p, out(span(q, sp, 1)));
            f.pieces.push({ t: 'line', pts: [a, end], th: thr, z: zi, side: 'back', live: q < sp });
            if (q < sp) f.needle = needle({ tip, d: dB, flat: LB / NL, lift: Math.sin(Math.PI * s) * 1.5, side: 'back' });
          }
          if (q >= sp) {
            const poke = span(q, sp, sp + (1 - sp) * 0.42);
            const draw = inOut(span(q, sp + (1 - sp) * 0.42, 1));
            const flat0 = 0.18;
            if (draw <= 0) {
              const s = out(poke);
              f.needle = needle({ tip: add(p, mul(nd, NL * flat0 * s)), d: nd, flat: flat0, vis: s, cut: 'eye' });
            } else {
              const flat = mix(flat0, R0.flat, draw);
              const lift = R0.lift * draw;
              const eye = add(p, mul(nd, OUT * draw));
              if (q < 1) f.pieces.push({ t: 'line', pts: sag(p, eye, 0.3), th: thr, z: zi, side: 'front', live: true, lift: lift * 0.5 });
              f.needle = needle({ tip: add(eye, mul(nd, NL * flat)), d: nd, flat, lift, lean: -1 });
            }
          }
        });
        cur = p;
        break;
      }

      case 'down': {
        const a = cur!;
        const p = op.p;
        grow(p, w);
        const loop: Loop | null = op.loop
          ? { a, b: p, c: target(ops[i + 1]) ?? p, style: op.loop, wf: op.wf ?? 0.32, c0: Infinity, c1: Infinity }
          : null;
        if (loop) { pending = loop; grow(loop.c, w * 3); }
        const path = loop ? looseLoop(loop, SLACK) : op.via ? spline([a, ...op.via, p], 10) : [a, p];
        const swept = !!(loop || op.via);
        op.via?.forEach((q) => grow(q, w));
        const acc = lengths(path);
        const L = acc[acc.length - 1];
        const lay = (0.3 + L * 0.022) * tempo;
        const dive = 0.3 * tempo;
        const T = lay + dive;
        const sp = lay / T;
        const nd = rot(aim(a, i - 1), TILT);
        const st = resume(a, nd);
        pose = null;
        /** A swept needle points along its path, eye trailing, so the thread leaves the eye instead of the tip. */
        const along = (s: number) => rot(norm(sub(at(path, Math.min(1, s + 0.04), acc).p, at(path, Math.max(0, s - 0.04), acc).p)), TILT * 0.45);
        const ndEnd = swept ? along(1) : nd;
        const flatIn = STAB;
        sec = { z: zi, k: 'down', a, b: p, th: thr, sp };
        push(T, op.cap, { p, n: ++hn, up: false, ev: 0 }, (q, f, tt) => {
          if (q < sp) {
            const s = inOut(q / sp);
            const k = Math.min(1, s * 3);
            const tip = swept ? lerp(st.tip, at(path, s, acc).p, k) : lerp(st.tip, p, s);
            const d = swept ? norm(lerp(st.d, along(s), k)) : norm(lerp(st.d, nd, k));
            const hop = Math.sin(Math.PI * s);
            const proj = mix(st.flat, flatIn, s) + 0.2 * hop;
            const lift = st.lift * (1 - s) + 1.6 * hop;
            const lean = mix(st.lean, 1, s);
            const eye = sub(tip, mul(d, NL * proj));
            const sEye = s - (NL * proj) / L;
            const pts = swept && sEye > 0 ? [...slice(path, 0, sEye, acc), eye] : sag(a, eye);
            f.pieces.push({ t: 'line', pts, th: thr, z: zi, side: 'front', live: true, lift: lift * 0.5 });
            f.needle = needle({ tip, d, flat: proj, lift, lean });
          } else {
            const s = inOut(span(q, sp, 1));
            const eye = sub(p, mul(ndEnd, NL * flatIn * (1 - s)));
            const laid = loop ? loopShape(loop, s, tt) : op.via ? path : null;
            const pts = laid ? (q < 1 ? toEye(laid, eye, NL * flatIn * (1 - s)) : laid) : q >= 1 ? path : sag(a, eye, 1 - s);
            f.pieces.push({ t: 'line', pts, th: thr, z: zi, side: 'front', live: q < 1 && !loop });
            if (q < 1) f.needle = needle({ tip: p, d: ndEnd, flat: flatIn, vis: 1 - s, cut: 'tip' });
          }
        });
        cur = p;
        break;
      }

      case 'knot': {
        const a = cur!;
        const b = op.to;
        const n = op.wraps;
        const fig8 = op.style === 'colonial';
        const far = dist(a, b) > w * 1.6;
        const nd = far ? norm(sub(b, a)) : rot(v(1, 0), -0.5);
        const T0 = add(a, mul(nd, w * 2.4));
        const st = resume(a, rot(aim(a, i - 1), TILT));
        pose = null;
        const r = w * (0.95 + 0.12 * n) * (fig8 ? 1.15 : 1);
        grow(b, r * 2);
        const T = (1.9 + n * 0.5) * tempo;
        sec = { z: zi, k: 'knot', a, b, th: thr, wraps: n, style: fig8 ? 'colonial' : 'french', far };
        push(T, op.cap, { p: b, n: ++hn, up: false, ev: 0 }, (q, f) => {
          const s1 = span(q, 0, 0.14);
          const s2 = span(q, 0.14, 0.58);
          const s3 = span(q, 0.58, 0.8);
          const s4 = span(q, 0.8, 1);
          let tip = lerp(st.tip, T0, inOut(s1));
          let flat = mix(st.flat, 0.9, inOut(s1));
          const dir = s1 < 1 ? norm(lerp(st.d, nd, inOut(s1))) : nd;
          if (s3 > 0) { tip = lerp(T0, b, inOut(s3)); flat = 0.9 - 0.6 * inOut(s3); }
          const proj = flat;
          const eye = sub(tip, mul(dir, NL * proj));
          if (s4 <= 0) {
            const coils: V[] = [];
            for (let j = 0; j < n; j++) {
              const sweep = clamp01(s2 * n - j);
              if (sweep <= 0) break;
              const c = sub(tip, mul(nd, (w * 1.1 + j * w * (fig8 ? 1.05 : 0.8)) * proj));
              coils.push(c);
              f.pieces.push({ t: 'wrap', c, d: nd, th: thr, z: NZ - 1, side: 'front', sweep, half: 'back', fig8 });
              f.pieces.push({ t: 'wrap', c, d: nd, th: thr, z: NZ + 1, side: 'front', sweep, half: 'front', fig8 });
            }
            const side = mul(perp(nd), w * 0.9);
            const first = coils.length ? add(coils[0], side) : eye;
            const last = coils.length ? sub(coils[coils.length - 1], side) : eye;
            f.pieces.push({ t: 'line', pts: sag(a, first), th: thr, z: zi, side: 'front', live: true });
            if (coils.length) f.pieces.push({ t: 'line', pts: [last, eye], th: thr, z: NZ - 2, side: 'front', live: true });
            const low = 1.4 * flat * (1 - inOut(s3));
            f.needle = needle({ tip, d: dir, flat, lift: s1 < 1 ? mix(st.lift, low, inOut(s1)) : low, lean: s1 < 1 ? mix(st.lean, 0, inOut(s1)) : inOut(s3) });
          } else {
            if (far) f.pieces.push({ t: 'line', pts: [a, b], th: thr, z: zi, side: 'front' });
            f.pieces.push({ t: 'knot', c: b, r, th: thr, z: zi + 0.5, side: 'front', style: fig8 ? 'colonial' : 'french', form: inOut(s4), spin: i * 1.7 });
            if (q < 1) {
              f.needle = needle({ tip: b, d: nd, flat: 0.3, vis: 1 - inOut(s4), cut: 'tip' });
              f.pieces.push({ t: 'line', pts: [b, sub(b, mul(nd, NL * 0.3 * (1 - inOut(s4))))], th: thr, z: zi + 0.4, side: 'front', live: true });
            }
          }
          if (s4 > 0 && !far) f.pieces.push({ t: 'line', pts: [a, b], th: thr, z: zi, side: 'back' });
        }, [0, 0.58, 0.8]);
        cur = b;
        break;
      }

      case 'bullion': {
        const a = cur!;
        const b = op.to;
        const n = op.wraps;
        const u = norm(sub(a, b));
        const Lab = dist(a, b);
        const P = Lab + w * 1.5;
        const len = P + Lab + w * 3.5;
        const tipF = add(a, mul(u, P));
        grow(b, w * 2); grow(tipF, w);
        const T = (2.6 + n * 0.22) * tempo;
        sec = { z: zi, k: 'bullion', a, b, th: thr, wraps: n };
        const st = resume(a, rot(aim(a, i - 1), TILT));
        pose = null;
        push(T, op.cap, { p: b, n: ++hn, up: false, ev: 0 }, (q, f) => {
          const s1 = span(q, 0.1, 0.16);
          const s2 = span(q, 0.16, 0.6);
          const s3 = span(q, 0.6, 0.8);
          const s4 = span(q, 0.8, 1);
          const coilEnd = add(a, mul(u, Lab));
          if (q < 0.06) {
            const e = inOut(span(q, 0, 0.06));
            const tip = lerp(st.tip, b, e);
            const d = norm(lerp(st.d, u, e));
            const flat = mix(st.flat, 1, e);
            const ln = mix(NL, len, e);
            f.needle = needle({ tip, d, flat, len: ln, lift: mix(st.lift, 0.3, e), lean: mix(st.lean, 0, e) });
            f.pieces.push({ t: 'line', pts: sag(a, sub(tip, mul(d, ln * flat))), th: thr, z: zi, side: 'front', live: true });
          } else if (q < 0.1) {
            const tip = lerp(b, a, inOut(span(q, 0.06, 0.1)));
            f.needle = needle({ tip, d: u, flat: 1, lift: 0.3, len, hide: [0, dist(tip, b) / len] });
            f.pieces.push({ t: 'line', pts: [a, sub(tip, mul(u, len))], th: thr, z: zi, side: 'front', live: true });
          } else if (s3 <= 0) {
            const tip = lerp(a, tipF, out(s1));
            const ta = dist(tip, a) / len;
            f.needle = needle({ tip, d: u, flat: 1, lift: 0.3, len, hide: [ta, ta + Lab / len], vis: 1 });
            const eye = sub(tip, mul(u, len));
            f.pieces.push({ t: 'line', pts: s2 > 0 ? [a, add(a, mul(u, w * 0.5))] : [a, eye], th: thr, z: zi, side: 'front', live: true });
            for (let j = 0; j < n; j++) {
              const sweep = clamp01(s2 * n - j);
              if (sweep <= 0) break;
              const c = add(a, mul(u, w * 0.55 + (j * (Lab - w * 0.6)) / Math.max(1, n - 1)));
              f.pieces.push({ t: 'wrap', c, d: u, th: thr, z: NZ - 1, side: 'front', sweep, half: 'back', fig8: false });
              f.pieces.push({ t: 'wrap', c, d: u, th: thr, z: NZ + 1, side: 'front', sweep, half: 'front', fig8: false });
            }
            const k = Math.min(n, Math.floor(s2 * n + 1));
            const reach = add(a, mul(u, w * 0.55 + (Math.max(0, k - 1) * (Lab - w * 0.6)) / Math.max(1, n - 1)));
            const off = sub(reach, mul(perp(u), w));
            if (s2 > 0) f.pieces.push({ t: 'line', pts: quad(off, add(lerp(off, eye, 0.5), mul(perp(u), w * 2)), eye, 10), th: thr, z: NZ - 2, side: 'front', live: true });
          } else if (s4 <= 0) {
            const tip = add(tipF, mul(u, out(s3) * (len + w * 2)));
            const ta = dist(tip, a) / len;
            f.needle = needle({ tip, d: u, flat: 1, lift: 0.6, len, hide: ta < 1 ? [ta, Math.min(1, ta + Lab / len)] : undefined });
            f.pieces.push({ t: 'coils', a, b: coilEnd, n, th: thr, z: zi, side: 'front', lift: 0 });
            const eye = sub(tip, mul(u, len));
            f.pieces.push({ t: 'line', pts: sag(coilEnd, eye), th: thr, z: zi + 0.2, side: 'front', live: true });
          } else {
            const end = add(a, rot(mul(u, Lab), Math.PI * inOut(s4)));
            f.pieces.push({ t: 'coils', a, b: end, n, th: thr, z: zi, side: 'front', lift: Math.sin(Math.PI * s4) * 1.5 });
            if (q < 1) {
              const dive = span(s4, 0.55, 1);
              const dB = rot(norm(sub(b, a)), TILT);
              f.needle = needle({ tip: b, d: dB, flat: 0.35, vis: 1 - dive, cut: 'tip' });
              f.pieces.push({ t: 'line', pts: sag(end, sub(b, mul(dB, NL * 0.35 * (1 - dive))), 0.4), th: thr, z: zi + 0.2, side: 'front', live: true });
            }
          }
          f.pieces.push({ t: 'line', pts: [b, a], th: thr, z: zi, side: 'back', live: q < 0.16 });
        }, [0, 0.16, 0.6, 0.8]);
        cur = b;
        break;
      }

      case 'coral': {
        const s0 = cur!;
        const P = op.at;
        const d = norm(sub(P, s0));
        const n = perp(d);
        const p1 = add(P, mul(n, w * 1.1));
        const p2 = sub(P, mul(n, w * 1.1));
        grow(P, w * 2);
        const T = 1.5 * tempo;
        const st = resume(s0, rot(aim(s0, i - 1), TILT));
        pose = { tip: add(p2, mul(n, -(w * 1.5 + NL))), d: mul(n, -1), flat: 1, lift: 0.4, lean: 0 };
        sec = { z: zi, k: 'coral', a: s0, b: P, th: thr };
        push(T, op.cap, { p: P, n: ++hn, up: false, ev: 0 }, (q, f) => {
          const s1 = span(q, 0, 0.3);
          const s2 = span(q, 0.3, 0.6);
          const s3 = span(q, 0.6, 1);
          const nd = mul(n, -1);
          if (s3 <= 0) {
            const tip = s2 > 0 ? add(p2, mul(nd, w * 1.5 * out(s2))) : lerp(st.tip, p2, inOut(s1));
            const dn = s2 > 0 ? nd : norm(lerp(st.d, nd, inOut(s1)));
            const flat = s2 > 0 ? 1 : mix(st.flat, 1, inOut(s1));
            const ta = dist(tip, p2) / NL;
            f.needle = needle({ tip, d: dn, flat, lift: s2 > 0 ? 0.2 : mix(st.lift, 0.2, inOut(s1)), lean: s2 > 0 ? 0 : mix(st.lean, 0, inOut(s1)), hide: s2 > 0 ? [ta, ta + (w * 2.2) / NL] : undefined });
            const eye = sub(tip, mul(dn, NL * flat));
            const loopTip = add(P, mul(d, w * 2.6 * out(s1)));
            const around = add(tip, mul(d, w * 1.2));
            const pts = s2 > 0
              ? [s0, ...cubic(P, loopTip, add(around, mul(n, -w)), around, 12), eye]
              : [s0, ...quad(P, loopTip, add(P, mul(n, -w * 2 * s1)), 8), eye];
            f.pieces.push({ t: 'line', pts, th: thr, z: zi, side: 'front', live: true });
          } else {
            f.pieces.push({ t: 'line', pts: [s0, P], th: thr, z: zi, side: 'front' });
            f.pieces.push({ t: 'knot', c: P, r: w * 0.95, th: thr, z: zi + 0.5, side: 'front', style: 'coral', form: inOut(s3), spin: i * 2.3 + Math.atan2(d.y, d.x) });
            if (q < 1) {
              const tip = add(p2, mul(nd, w * 1.5 + s3 * NL));
              f.needle = needle({ tip, d: nd, flat: 1, lift: 0.4 });
              f.pieces.push({ t: 'line', pts: sag(P, sub(tip, mul(nd, NL)), 0.4), th: thr, z: zi + 0.4, side: 'front', live: true });
            }
          }
          if (s2 > 0) f.pieces.push({ t: 'line', pts: [p1, p2], th: thr, z: zi, side: 'back' });
        }, [0, 0.3, 0.6]);
        cur = P;
        break;
      }

      case 'tie': {
        const L0 = cur!;
        const X = op.at;
        const ref = op.under;
        const dd = norm(v(-1, 1));
        const from = sub(X, mul(dd, w * 2));
        const to = add(X, mul(dd, w * 2));
        const T = 1.9 * tempo;
        const st = resume(L0, rot(aim(L0, i - 1), TILT));
        pose = { tip: add(to, mul(dd, NL)), d: dd, flat: 0.95, lift: 0.5, lean: 0 };
        sec = { z: zi, k: 'tie', a: L0, b: X, th: thr };
        push(T, op.cap, undefined, (q, f) => {
          const s0 = inOut(span(q, 0, 0.2));
          const s1 = span(q, 0.2, 0.6);
          const s2 = span(q, 0.6, 1);
          if (s1 <= 0) {
            const tip = lerp(st.tip, from, s0);
            const d = norm(lerp(st.d, dd, s0));
            const flat = mix(st.flat, 0.95, s0);
            f.needle = needle({ tip, d, flat, lift: mix(st.lift, 0.3, s0), lean: mix(st.lean, 0, s0) });
            f.pieces.push({ t: 'line', pts: sag(L0, sub(tip, mul(d, NL * flat))), th: thr, z: zi, side: 'front', live: true });
          } else if (s2 <= 0) {
            const tip = lerp(from, to, inOut(s1));
            f.needle = needle({ tip, d: dd, flat: 0.95, lift: 0.3, z: ref - 0.4 });
            const eye = sub(tip, mul(dd, NL * 0.95));
            f.pieces.push({ t: 'line', pts: [L0, ...quad(add(X, mul(perp(dd), w * 1.4)), add(tip, mul(perp(dd), -w * 1.2)), add(tip, mul(dd, w)), 8)], th: thr, z: zi, side: 'front', live: true });
            f.pieces.push({ t: 'line', pts: [add(tip, mul(dd, w)), eye], th: thr, z: ref - 0.45, side: 'front', live: true });
          } else {
            f.pieces.push({ t: 'line', pts: [L0, X], th: thr, z: zi, side: 'front' });
            f.pieces.push({ t: 'knot', c: X, r: w * 1.05, th: thr, z: ref + 0.5, side: 'front', style: 'french', form: inOut(s2), spin: 0.8 });
            if (q < 1) {
              const tip = add(to, mul(dd, s2 * NL));
              f.needle = needle({ tip, d: dd, flat: 0.95, lift: 0.5 });
              f.pieces.push({ t: 'line', pts: sag(X, sub(tip, mul(dd, NL * 0.95)), 0.4), th: thr, z: ref + 0.6, side: 'front', live: true });
            }
          }
        }, [0, 0.6]);
        cur = X;
        break;
      }

      case 'surface': {
        const a = cur!;
        const path = op.raw ? [a, ...op.via] : spline([a, ...op.via], 8);
        op.via.forEach((q) => grow(q, w));
        const acc = lengths(path);
        const L = acc[acc.length - 1];
        const unders = op.unders ?? [];
        const T = (0.35 + L * 0.03) * tempo;
        sec = { z: zi, k: 'surface', a, b: path[path.length - 1], th: thr };
        const st = resume(a, rot(aim(a, i - 1), TILT));
        const last = at(path, 1, acc);
        pose = { tip: last.p, d: last.d, flat: 0.95, lift: 0.4, lean: 0 };
        push(T, op.cap, undefined, (q, f) => {
          const s = inOut(q);
          const k0 = Math.min(1, s * 3);
          const on = at(path, s, acc);
          const tip = lerp(st.tip, on.p, k0);
          const dn = norm(lerp(st.d, on.d, k0));
          const flat = mix(st.flat, 0.95, k0);
          const eye = sub(tip, mul(dn, NL * flat));
          const sE = q < 1 ? Math.max(0, s - (NL * flat) / L) : 1;
          const cuts = [0, ...unders.flatMap((u) => [u.a, u.b]), 1].filter((c, k, arr) => k === 0 || c > arr[k - 1]);
          for (let k = 0; k < cuts.length - 1; k++) {
            const c0 = cuts[k];
            const c1 = Math.min(cuts[k + 1], sE);
            if (c1 <= c0) break;
            const u = unders.find((x) => x.a <= c0 && x.b >= cuts[k + 1]);
            f.pieces.push({ t: 'line', pts: slice(path, c0, c1, acc), th: thr, z: u ? u.ref - 0.5 : zi, side: 'front', bare: true, live: q < 1 });
          }
          if (q < 1) {
            const u = unders.find((x) => x.a <= s && x.b >= s);
            f.needle = needle({ tip, d: dn, flat, lift: mix(st.lift, 0.4, k0), lean: mix(st.lean, 0, k0), z: u ? u.ref - 0.4 : NZ });
            f.pieces.push({ t: 'line', pts: [sE > 0 ? at(path, sE, acc).p : a, eye], th: thr, z: u ? u.ref - 0.45 : zi, side: 'front', bare: true, live: true });
          }
        });
        cur = path[path.length - 1];
        break;
      }
    }
  });

  const last = cur;
  const thr = th;
  sec = { z: -1, k: 'end', a: last, b: last, th: thr };
  push(0.6, undefined, undefined, (_q, f) => {
    if (last) f.pieces.push({ t: 'tail', c: last, d: v(0.6, 0.8), th: thr, z: -1, side: 'back', end: true });
  });

  return { evs, dur: t, holes, box };
}

function capAt(e: Ev, q: number): number | undefined {
  if (!Array.isArray(e.cap)) return e.cap;
  const ph = e.phases ?? [0];
  let k = 0;
  while (k + 1 < ph.length && q >= ph[k + 1]) k++;
  return e.cap[Math.min(k, e.cap.length - 1)];
}

/** Caption shown at time `t`. */
export function captionAt(prog: Program, t: number): number {
  return frameAt(prog, t).cap;
}

export function frameAt(prog: Program, t: number): Frame {
  const f: Frame = { pieces: [], needle: null, cap: 0, ev: 0 };
  for (let i = 0; i < prog.evs.length; i++) {
    const e = prog.evs[i];
    if (t < e.t0) break;
    f.needle = null;
    const q = e.t1 > e.t0 ? clamp01((t - e.t0) / (e.t1 - e.t0)) : 1;
    e.build(q, f, t);
    f.cap = capAt(e, q) ?? f.cap;
    f.ev = i;
  }
  return f;
}

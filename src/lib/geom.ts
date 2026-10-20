export type V = { x: number; y: number };

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y);
export const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y);
export const mul = (a: V, s: number): V => v(a.x * s, a.y * s);
export const lerp = (a: V, b: V, t: number): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const len = (a: V): number => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y;
export const norm = (a: V): V => {
  const l = len(a);
  return l < 1e-9 ? v(1, 0) : v(a.x / l, a.y / l);
};
export const perp = (a: V): V => v(-a.y, a.x);
export const rot = (a: V, ang: number): V => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return v(a.x * c - a.y * s, a.x * s + a.y * c);
};
export const polar = (r: number, ang: number): V => v(r * Math.cos(ang), r * Math.sin(ang));

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const inOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const out = (t: number): number => 1 - (1 - t) ** 3;
export const span = (q: number, a: number, b: number): number => clamp01((q - a) / (b - a));

export function cubic(p0: V, p1: V, p2: V, p3: V, n = 24): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push(
      v(
        u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      ),
    );
  }
  return pts;
}

export function quad(p0: V, p1: V, p2: V, n = 12): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push(v(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y));
  }
  return pts;
}

/** Centripetal-free Catmull-Rom through every point, `n` samples per span. */
export function spline(points: V[], n = 12): V[] {
  if (points.length < 3) return points.slice();
  const pts: V[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    const seg = cubic(p1, c1, c2, p2, n);
    if (i > 0) seg.shift();
    pts.push(...seg);
  }
  return pts;
}

export function lengths(pts: V[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
  return acc;
}

export const pathLength = (pts: V[]): number => lengths(pts)[pts.length - 1] ?? 0;

/** Point and unit tangent at fraction `t` of the path's arc length. */
export function at(pts: V[], t: number, acc = lengths(pts)): { p: V; d: V } {
  const total = acc[acc.length - 1];
  if (pts.length < 2 || total === 0) return { p: pts[0], d: v(1, 0) };
  const target = clamp01(t) * total;
  let i = 1;
  while (i < acc.length - 1 && acc[i] < target) i++;
  const seg = acc[i] - acc[i - 1] || 1;
  const k = (target - acc[i - 1]) / seg;
  return { p: lerp(pts[i - 1], pts[i], k), d: norm(sub(pts[i], pts[i - 1])) };
}

/** The part of the path between fractions `a` and `b` of its arc length. */
export function slice(pts: V[], a: number, b: number, acc = lengths(pts)): V[] {
  const total = acc[acc.length - 1];
  if (b <= a || total === 0) return [];
  const ta = clamp01(a) * total;
  const tb = clamp01(b) * total;
  const out: V[] = [at(pts, a, acc).p];
  for (let i = 1; i < pts.length - 1; i++) if (acc[i] > ta && acc[i] < tb) out.push(pts[i]);
  out.push(at(pts, b, acc).p);
  return out;
}

export function resample(pts: V[], n: number): V[] {
  const acc = lengths(pts);
  const out: V[] = [];
  for (let i = 0; i < n; i++) out.push(at(pts, i / (n - 1), acc).p);
  return out;
}

export const lerpPath = (a: V[], b: V[], t: number): V[] => a.map((p, i) => lerp(p, b[i], t));

export function offset(pts: V[], d: number): V[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    return add(p, mul(perp(norm(sub(b, a))), d));
  });
}

/** Deterministic PRNG (mulberry32), so every render of a stitch is identical. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

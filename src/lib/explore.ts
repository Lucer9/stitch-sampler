import { frameAt, type Frame, type Program } from './engine.ts';
import { Scene } from './render.ts';
import { type V, v, sub, dot, dist, add, mul } from './geom.ts';

export interface Region {
  prog: Program;
  /** Tooltip text: the stitch, then a quieter detail. */
  name: string;
  detail: string;
}

/** Distance from `p` to segment `a`-`b`. */
function toSeg(p: V, a: V, b: V) {
  const d = sub(b, a);
  const L = dot(d, d);
  const t = L ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L)) : 0;
  return dist(p, add(a, mul(d, t)));
}

/** True if fabric point `p` lands on the thread `f` leaves on the front. */
function hits(f: Frame, p: V) {
  return f.pieces.some((q) => {
    if (q.side !== 'front') return false;
    if (q.t === 'line') return q.pts.some((a, i) => i > 0 && toSeg(p, q.pts[i - 1], a) < q.th.width * 0.7 + 0.5);
    if (q.t === 'knot') return dist(p, q.c) < q.r + 0.6;
    if (q.t === 'coils') return toSeg(p, q.a, q.b) < q.th.width * 1.2;
    return false;
  });
}

/**
 * A finished design in a hoop that names its parts: hovering one veils the rest and shows its stitch, clicking it
 * calls `pick`. The topmost part under the pointer wins, so a knot on a fill is found before the fill.
 */
export function explore(el: HTMLCanvasElement, tip: HTMLElement, regions: Region[], R: number, pick: (k: number) => void, hover?: (k: number | null) => void) {
  const scene = new Scene(el, { mode: 'hoop', R, pitch: 0.85 });
  const finals = regions.map((r) => frameAt(r.prog, r.prog.dur + 1));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const abort = new AbortController();
  let base: HTMLCanvasElement | null = null;
  let lit: number | null = null;
  let shown: number | null = null;
  let fade = 0;
  let raf = 0;
  let last = 0;

  const draw = () => {
    base ??= scene.bake(finals);
    const k = shown;
    scene.draw([], { side: 'front', base, after: k !== null && fade > 0 ? (g) => scene.spotlight(g, [finals[k]], fade) : undefined });
  };
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const goal = lit === null ? 0 : 1;
    fade = reduce ? goal : goal > fade ? Math.min(goal, fade + dt / 0.16) : Math.max(goal, fade - dt / 0.24);
    if (lit !== null) shown = lit;
    draw();
    raf = fade !== goal ? requestAnimationFrame(loop) : 0;
  };
  const light = (k: number | null) => {
    if (k === lit) return;
    lit = k;
    hover?.(k);
    el.style.cursor = k === null ? '' : 'pointer';
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  const at = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const dpr = scene.W / r.width;
    const p = scene.fabric(v((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr), 'front');
    for (let k = finals.length - 1; k >= 0; k--) if (hits(finals[k], p)) return k;
    return null;
  };

  el.addEventListener('pointermove', (e) => {
    const k = at(e);
    light(k);
    tip.toggleAttribute('data-on', k !== null);
    if (k === null) return;
    const r = el.getBoundingClientRect();
    tip.innerHTML = '';
    tip.append(regions[k].name);
    const d = document.createElement('span');
    d.className = 'dim';
    d.textContent = regions[k].detail;
    tip.append(d);
    tip.style.transform = `translate(${e.clientX - r.left + 16}px, ${e.clientY - r.top + 14}px)`;
  }, { signal: abort.signal });
  el.addEventListener('pointerleave', () => {
    light(null);
    tip.removeAttribute('data-on');
  }, { signal: abort.signal });
  el.addEventListener('click', (e) => {
    const k = at(e);
    if (k !== null) pick(k);
  }, { signal: abort.signal });
  const ro = new ResizeObserver(() => {
    if (!scene.resize()) return;
    base = null;
    draw();
  });
  ro.observe(el);
  draw();

  return {
    light,
    stop: () => {
      abort.abort();
      ro.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}

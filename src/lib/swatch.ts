import { compile, frameAt } from './engine.ts';
import { Scene } from './render.ts';
import { bySlug } from './stitches.ts';
import { lesson, projectBySlug } from './projects.ts';

/** Renders every `canvas[data-swatch]` (a stitch, or with `data-project` a project) once it nears the viewport; hovering its link replays it. `data-zoom` crops in on the middle. */
export function mountSwatches() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        swatch(e.target as HTMLCanvasElement, reduce);
      }
    },
    { rootMargin: '600px' },
  );
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-swatch]').forEach((c) => io.observe(c));
}

function swatch(el: HTMLCanvasElement, reduce: boolean) {
  const d = el.dataset.project ? lesson(projectBySlug(el.dataset.project)).demo() : bySlug(el.dataset.swatch!).demo();
  const prog = compile(d.ops, d);
  const b = prog.box;
  const size = (Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.22 + 6) / +(el.dataset.zoom ?? 1);
  const scene = new Scene(el, { mode: 'swatch', view: { x: (b.x0 + b.x1) / 2 - size / 2, y: (b.y0 + b.y1) / 2 - size / 2, w: size, h: size }, pitch: 1.05 });
  const end = prog.dur + 1;
  const draw = (t: number) => {
    const f = frameAt(prog, t);
    scene.draw(f, { side: 'front', pierced: prog.holes.filter((h) => prog.evs[h.ev].t1 <= t).map((h) => h.p), numbers: false });
  };
  draw(end);
  el.dataset.ready = '';
  if (reduce || el.dataset.still !== undefined) return;
  const host = el.closest<HTMLElement>('a, [data-swatch-host]') ?? el;
  let raf = 0;
  let t0 = 0;
  const rate = Math.max(2.5, prog.dur / 3.2);
  const loop = (now: number) => {
    const t = ((now - t0) / 1000) * rate;
    draw(Math.min(t, end));
    raf = t < end ? requestAnimationFrame(loop) : 0;
  };
  host.addEventListener('pointerenter', () => {
    cancelAnimationFrame(raf);
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  });
  host.addEventListener('pointerleave', () => {
    cancelAnimationFrame(raf);
    raf = 0;
    draw(end);
  });
  new ResizeObserver(() => scene.resize() && draw(end)).observe(el);
}

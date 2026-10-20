import { compile, frameAt } from './engine.ts';
import { Scene } from './render.ts';
import { bySlug } from './stitches.ts';
import { lesson, projectBySlug } from './projects.ts';
import { example } from './examples.ts';

/** Renders every `canvas[data-swatch]` (a stitch; with `data-project` a project; with `data-example="slug/k"` a use of it) once it nears the viewport; hovering its link replays it. */
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
  const [slug, k] = (el.dataset.example ?? '').split('/');
  const d = el.dataset.project ? lesson(projectBySlug(el.dataset.project)).demo() : k ? example(slug, +k) : bySlug(el.dataset.swatch!).demo();
  const prog = compile(d.ops, d);
  const b = prog.box;
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.22 + 6;
  const ar = el.clientWidth / Math.max(1, el.clientHeight) || 1;
  const vw = size * Math.max(1, ar);
  const vh = size * Math.max(1, 1 / ar);
  const scene = new Scene(el, { mode: 'swatch', view: { x: (b.x0 + b.x1) / 2 - vw / 2, y: (b.y0 + b.y1) / 2 - vh / 2, w: vw, h: vh }, pitch: 1.05 });
  const end = prog.dur + 1;
  const draw = (t: number) => {
    const f = frameAt(prog, t);
    scene.draw(f, { side: 'front', pierced: prog.holes.filter((h) => prog.evs[h.ev].t1 <= t).map((h) => h.p), numbers: false });
  };
  draw(end);
  el.dataset.ready = '';
  if (reduce) return;
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

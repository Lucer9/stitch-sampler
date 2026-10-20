import { compile, frameAt, type Program } from './engine.ts';
import { Scene } from './render.ts';
import { bySlug } from './stitches.ts';

/** The first repeat of a stitch: until the last step's caption first finishes, framed on the thread it leaves. */
function focus(prog: Program, steps: number) {
  const ev = prog.evs.find((e) => (Array.isArray(e.cap) ? e.cap.includes(steps - 1) : e.cap === steps - 1));
  const end = Math.min(prog.dur, ev ? ev.t1 : prog.dur);
  const pts = frameAt(prog, end).pieces.flatMap((p) => (p.side !== 'front' ? [] : p.t === 'line' ? p.pts : p.t === 'coils' ? [p.a, p.b] : [p.c]));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const size = Math.max(20, Math.max(...xs) - Math.min(...xs) + 10, Math.max(...ys) - Math.min(...ys) + 10);
  return { end, view: { x: cx - size / 2, y: cy - size / 2, w: size, h: size } };
}

/**
 * The header's Stitches menu: opens on hover (and on click, tap or keyboard through the popover), and shows the
 * hovered stitch in a large preview, playing one repeat of it close up.
 */
export function mountMenu() {
  const menu = document.getElementById('stitch-menu');
  const open = document.querySelector<HTMLButtonElement>('[popovertarget="stitch-menu"]');
  const el = menu?.querySelector<HTMLCanvasElement>('.look canvas');
  if (!menu || !open || !el) return;
  const name = menu.querySelector<HTMLElement>('.look-n')!;
  const use = menu.querySelector<HTMLElement>('.look-u')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shut = 0;
  let raf = 0;
  let cur = '';
  let play: { scene: Scene; prog: Program; end: number; t0: number } | null = null;

  const show = () => {
    clearTimeout(shut);
    if (!menu.matches(':popover-open')) menu.showPopover();
  };
  const hide = () => {
    clearTimeout(shut);
    shut = window.setTimeout(() => menu.hidePopover(), 220);
  };
  for (const t of [open, menu]) {
    t.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show());
    t.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide());
  }
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.hidePopover()));

  const draw = (now: number) => {
    if (!play) return;
    const { scene, prog, end, t0 } = play;
    const t = reduce ? end : ((now - t0) / 1000) % (end + 1.2);
    const f = frameAt(prog, Math.min(t, end));
    scene.draw(f, { side: 'front', pierced: prog.holes.filter((h) => prog.evs[h.ev].t1 <= t).map((h) => h.p), numbers: false });
    raf = reduce ? 0 : requestAnimationFrame(draw);
  };

  const look = (slug: string) => {
    if (slug === cur) return;
    cur = slug;
    const s = bySlug(slug);
    const d = s.demo();
    const prog = compile(d.ops, d);
    const { end, view } = focus(prog, s.steps.length);
    play = { scene: new Scene(el, { mode: 'swatch', view, pitch: 1.05 }), prog, end, t0: performance.now() };
    name.textContent = s.name;
    use.textContent = s.use;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  };

  menu.querySelectorAll<HTMLAnchorElement>('a[data-look]').forEach((a) => {
    a.addEventListener('pointerenter', () => look(a.dataset.look!));
    a.addEventListener('focus', () => look(a.dataset.look!));
  });
  menu.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'open') {
      const first = menu.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ?? menu.querySelector<HTMLAnchorElement>('a[data-look]')!;
      cur = '';
      look(first.dataset.look!);
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
}

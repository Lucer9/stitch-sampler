import { compile, frameAt, type Program, type Hole, type Frame } from './engine.ts';
import { Scene } from './render.ts';
import { SideView } from './side.ts';
import { bySlug, type Stitch } from './stitches.ts';
import { type V, dist } from './geom.ts';

const HOLD = 2.6;
/** Holes closer than this count as one target in practice mode. */
const NEAR = 2.4;

export function mountPlayer() {
  const root = document.querySelector<HTMLElement>('[data-player]');
  if (root) new Player(root, bySlug(root.dataset.slug!));
}

class Player {
  private root: HTMLElement;
  private s: Stitch;
  private prog: Program;
  private scene: Scene;
  private side: SideView | null = null;
  private t = 0;
  private playing = false;
  private speed = 1;
  private view: 'front' | 'back' = 'front';
  private stopAt: number | null = null;
  private held = 0;
  private touched = false;
  private visible = false;
  private raf = 0;
  private last = 0;
  private cap = -1;
  private practice: { k: number; misses: number; first: number; picks: V[]; gap: number; bad: number; hot: number } | null = null;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private $ = <T extends Element>(sel: string) => this.root.querySelector<T>(sel)!;

  constructor(root: HTMLElement, s: Stitch) {
    this.root = root;
    this.s = s;
    const d = s.demo();
    this.prog = compile(d.ops, d);
    this.scene = new Scene(this.$<HTMLCanvasElement>('canvas.hoop'), { mode: 'hoop', R: s.R ?? 38, pitch: 0.85 });
    this.t = this.reduce ? this.prog.dur : 0;
    this.bind();
    new ResizeObserver(() => {
      if (this.scene.resize()) this.side?.resize();
      this.placeDots();
      this.draw();
    }).observe(this.scene.el);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible && !this.touched && !this.reduce && !this.practice) this.play();
      this.tick();
    }, { threshold: 0.35 }).observe(this.scene.el);
    document.addEventListener('visibilitychange', () => this.tick());
    this.draw();
  }

  private bind() {
    this.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button');
      if (!b || !this.root.contains(b)) return;
      if (b.dataset.speed) return this.setSpeed(+b.dataset.speed);
      if (b.dataset.pick) return this.pick(+b.dataset.pick);
      switch (b.dataset.act) {
        case 'play': return this.toggle();
        case 'restart': this.engage(); this.seek(0); return this.play();
        case 'next': return this.step(1);
        case 'prev': return this.step(-1);
        case 'flip': return this.flip();
        case 'side': return this.toggleSide();
        case 'practice': return this.togglePractice();
      }
    });
    document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        const e = this.prog.evs.findIndex((ev) => (Array.isArray(ev.cap) ? ev.cap.includes(+b.dataset.step!) : ev.cap === +b.dataset.step!));
        if (e < 0 || this.practice) return;
        this.engage();
        this.seek(this.prog.evs[e].t0);
        this.play();
        this.scene.el.scrollIntoView({ block: 'nearest', behavior: this.reduce ? 'auto' : 'smooth' });
      }),
    );
    const scrub = this.$<HTMLInputElement>('.scrub');
    scrub.addEventListener('input', () => {
      this.engage();
      this.pause();
      this.seek((+scrub.value / 1000) * this.prog.dur);
    });
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === ' ' && !(e.target as HTMLElement).closest('button,a')) { e.preventDefault(); this.toggle(); }
      else if (k === 'arrowright') { e.preventDefault(); this.step(1); }
      else if (k === 'arrowleft') { e.preventDefault(); this.step(-1); }
      else if (k === 'f') this.flip();
      else if (k === 's' && this.s.knot) this.toggleSide();
    });
  }

  /** The viewer took control: stop auto-replaying and start announcing steps. */
  private engage() {
    this.touched = true;
    this.$<HTMLElement>('.now-t').setAttribute('aria-live', 'polite');
  }

  private seek(t: number) {
    this.t = Math.max(0, Math.min(this.prog.dur, t));
    this.stopAt = null;
    this.held = 0;
    this.draw();
  }

  private play() {
    if (this.t >= this.prog.dur) this.t = 0;
    this.playing = true;
    this.held = 0;
    this.sync();
    this.tick();
  }

  private pause() {
    this.playing = false;
    this.stopAt = null;
    this.sync();
  }

  private toggle() {
    if (this.practice) return;
    this.engage();
    this.playing ? this.pause() : this.play();
  }

  private setSpeed(v: number) {
    this.speed = v;
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed! === v)));
  }

  /** Plays to the end of the next needle move, or jumps back to the start of the previous one. */
  private step(dir: 1 | -1) {
    if (this.practice) return;
    this.engage();
    const evs = this.prog.evs;
    if (dir > 0) {
      const e = evs.find((ev) => ev.t1 > this.t + 1e-3);
      if (!e) return;
      this.stopAt = e.t1;
      this.playing = true;
      this.sync();
      this.tick();
    } else {
      const before = evs.filter((ev) => ev.t0 < this.t - 0.05);
      const e = before[before.length - 1];
      this.pause();
      this.seek(e ? e.t0 : 0);
    }
  }

  private tick() {
    const run = this.visible && !document.hidden;
    if (run && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.stopAt !== null && this.t >= this.stopAt) {
        this.t = this.stopAt;
        this.playing = false;
        this.stopAt = null;
        this.sync();
        if (this.practice) this.awaitPick();
      } else if (this.t >= this.prog.dur) {
        this.t = this.prog.dur;
        this.playing = false;
        this.sync();
        if (this.practice) this.finishPractice();
      }
    } else if (!this.touched && !this.practice && !this.reduce && this.t >= this.prog.dur) {
      this.held += dt;
      if (this.held > HOLD) this.play();
    }
    this.draw(now / 1000);
    this.raf = requestAnimationFrame(this.loop);
  };

  private holesAt(f: Frame) {
    const { holes, evs } = this.prog;
    const done = holes.filter((h) => evs[h.ev].t1 <= this.t + 1e-6);
    const e = evs[f.ev];
    let target: Hole | null = e.hole && this.t < e.t1 ? e.hole : null;
    if (!target) target = holes.find((h) => evs[h.ev].t1 > this.t + 1e-6) ?? null;
    const next = target ? holes[holes.indexOf(target) + 1] ?? null : null;
    return { pierced: done.map((h) => h.p), target, next };
  }

  private draw(time = performance.now() / 1000) {
    const f = frameAt(this.prog, this.t);
    const { pierced, target, next } = this.holesAt(f);
    const p = this.practice;
    const ended = this.t >= this.prog.dur - 1e-6;
    this.scene.draw(f, {
      side: this.view,
      pierced,
      target: p || ended ? null : target,
      next: p || ended ? null : next,
      time,
      dots: p ? p.picks : undefined,
      dotR: p ? p.gap * 0.42 : undefined,
      hot: p?.hot,
      bad: p?.bad,
    });
    this.side?.draw(f, this.prog, this.t);
    this.$<HTMLInputElement>('.scrub').value = String(Math.round((this.t / this.prog.dur) * 1000));
    if (f.cap !== this.cap) {
      this.cap = f.cap;
      this.$<HTMLElement>('.now-n').textContent = `Step ${f.cap + 1} of ${this.s.steps.length}`;
      this.$<HTMLElement>('.now-t').textContent = this.s.steps[f.cap];
      document.querySelectorAll('[data-step]').forEach((b, i) => b.toggleAttribute('data-on', i === f.cap));
    }
  }

  private sync() {
    const b = this.$<HTMLButtonElement>('[data-act="play"]');
    const ended = !this.playing && this.t >= this.prog.dur;
    b.dataset.state = this.playing ? 'playing' : ended ? 'ended' : 'paused';
    b.setAttribute('aria-label', this.playing ? 'Pause' : ended ? 'Replay' : 'Play');
  }

  private flip() {
    if (this.practice) return;
    const el = this.$<HTMLElement>('.flipper');
    const btn = this.$<HTMLButtonElement>('[data-act="flip"]');
    const swap = () => {
      this.view = this.view === 'front' ? 'back' : 'front';
      btn.setAttribute('aria-pressed', String(this.view === 'back'));
      btn.querySelector('span')!.textContent = this.view === 'back' ? 'Show the front' : 'Flip to the back';
      this.root.dataset.view = this.view;
      this.draw();
    };
    if (this.reduce) return swap();
    el.animate([{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(90deg)' }], { duration: 260, easing: 'cubic-bezier(.5,0,1,1)' }).finished.then(() => {
      swap();
      el.animate([{ transform: 'perspective(1400px) rotateY(-90deg)' }, { transform: 'perspective(1400px) rotateY(0deg)' }], { duration: 300, easing: 'cubic-bezier(0,0,.3,1)' });
    });
  }

  private toggleSide() {
    const box = this.$<HTMLElement>('.sidebox');
    const btn = this.$<HTMLButtonElement>('[data-act="side"]');
    const on = box.hidden;
    box.hidden = !on;
    btn.setAttribute('aria-pressed', String(on));
    if (on && !this.side) this.side = new SideView(this.$<HTMLCanvasElement>('canvas.side'));
    if (on) this.side!.resize();
    this.draw();
  }

  private togglePractice() {
    const btn = this.$<HTMLButtonElement>('[data-act="practice"]');
    if (this.practice) {
      this.practice = null;
      this.root.dataset.practice = '';
      btn.setAttribute('aria-pressed', 'false');
      btn.querySelector('span')!.textContent = 'Try it yourself';
      this.$<HTMLElement>('.dots').innerHTML = '';
      this.say('');
      this.draw();
      return;
    }
    if (this.view === 'back') this.flip();
    const picks: V[] = [];
    for (const h of this.prog.holes) if (!picks.some((p) => dist(p, h.p) < NEAR)) picks.push(h.p);
    let gap = Infinity;
    picks.forEach((a, i) => picks.slice(i + 1).forEach((b) => (gap = Math.min(gap, dist(a, b)))));
    this.practice = { k: 0, misses: 0, first: 0, picks, gap, bad: -1, hot: -1 };
    this.root.dataset.practice = 'on';
    btn.setAttribute('aria-pressed', 'true');
    btn.querySelector('span')!.textContent = 'Stop practising';
    this.touched = true;
    this.pause();
    this.seek(0);
    const dots = this.$<HTMLElement>('.dots');
    dots.innerHTML = picks.map((_, i) => `<button type="button" data-pick="${i}" aria-label="Hole ${i + 1}"></button>`).join('');
    this.placeDots();
    this.awaitPick();
  }

  private placeDots() {
    if (!this.practice) return;
    const dpr = this.scene.W / this.scene.el.clientWidth;
    const size = Math.max(24, Math.min(44, (this.practice.gap * this.scene.s) / dpr));
    this.root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => {
      b.style.width = b.style.height = `${size}px`;
      b.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
      const q = this.scene.screen(this.practice!.picks[+b.dataset.pick!], 'front');
      b.style.left = `${q.x / dpr}px`;
      b.style.top = `${q.y / dpr}px`;
    });
  }

  private awaitPick() {
    const p = this.practice!;
    const h = this.prog.holes[p.k];
    if (!h) return this.finishPractice();
    p.misses = 0;
    p.hot = -1;
    p.bad = -1;
    this.seek(this.prog.evs[h.ev].t0);
    this.say(h.up ? `Where does the needle come up${p.k ? ' next' : ' first'}?` : 'Where does it go down?');
  }

  private pick(i: number) {
    const p = this.practice;
    if (!p || this.playing) return;
    const h = this.prog.holes[p.k];
    if (dist(p.picks[i], h.p) < NEAR) {
      if (p.misses === 0) p.first++;
      p.k++;
      p.bad = -1;
      p.hot = -1;
      const nxt = this.prog.holes[p.k];
      this.stopAt = nxt ? this.prog.evs[nxt.ev].t0 : null;
      this.say(p.misses ? 'That’s it.' : 'Yes!');
      this.playing = true;
      this.tick();
      return;
    }
    p.misses++;
    p.bad = i;
    if (p.misses >= 2) p.hot = p.picks.findIndex((q) => dist(q, h.p) < NEAR);
    this.say(p.misses >= 2 ? 'Not quite. It’s the highlighted hole.' : 'Not that one. Try again.');
    this.draw();
  }

  private finishPractice() {
    const p = this.practice!;
    const n = this.prog.holes.length;
    this.say(`Done. ${p.first} of ${n} holes right on the first try.`);
    p.hot = -1;
    p.bad = -1;
  }

  private say(text: string) {
    const el = this.$<HTMLElement>('.prompt');
    el.textContent = text;
    el.classList.toggle('on', !!text);
  }
}

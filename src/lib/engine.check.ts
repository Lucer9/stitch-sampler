import assert from 'node:assert/strict';
import { compile, frameAt, type Frame, type Piece } from './engine.ts';
import { STITCHES } from './stitches.ts';

/** Whenever the needle's eye is above the cloth, some thread on that side must end in it. */
function threaded(f: Frame): boolean {
  const n = f.needle;
  if (!n || n.cut === 'eye') return true;
  const L = n.len * n.flat * n.vis;
  const eye = { x: n.tip.x - n.d.x * L, y: n.tip.y - n.d.y * L };
  const near = (q: { x: number; y: number }) => Math.hypot(q.x - eye.x, q.y - eye.y) < n.w * 0.35;
  return f.pieces.some((p) => p.t === 'line' && p.side === n.side && (near(p.pts[0]) || near(p.pts[p.pts.length - 1])));
}

const finite = (p: Piece) => JSON.stringify(p, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? 'BAD' : x)).indexOf('BAD') < 0;

assert.equal(STITCHES.length, 25);
assert.equal(new Set(STITCHES.map((s) => s.slug)).size, 25);
for (const s of STITCHES) {
  const d = s.demo();
  const prog = compile(d.ops, d);
  assert.ok(prog.dur > 2 && prog.dur < 120, `${s.slug} duration ${prog.dur}`);
  prog.holes.forEach((h, i) => assert.equal(h.n, i + 1, `${s.slug} hole numbering`));
  for (let t = 0; t <= prog.dur + 0.5; t += prog.dur / 97) {
    const f = frameAt(prog, t);
    for (const p of f.pieces) assert.ok(finite(p), `${s.slug} NaN at t=${t.toFixed(2)} ${p.t}`);
    assert.ok(f.cap >= 0 && f.cap < s.steps.length, `${s.slug} caption ${f.cap} out of range`);
  }
  const end = frameAt(prog, prog.dur + 1);
  assert.equal(end.needle, null, `${s.slug} needle left at the end`);
  assert.ok(end.pieces.some((p) => p.side === 'front'), `${s.slug} nothing on the front`);
  const caps = new Set<number>();
  for (let t = 0; t <= prog.dur; t += 0.05) caps.add(frameAt(prog, t).cap);
  assert.equal(caps.size, s.steps.length, `${s.slug} shows ${caps.size}/${s.steps.length} captions`);
  console.log(`ok ${s.slug.padEnd(24)} ${prog.dur.toFixed(1)}s  ${prog.holes.length} holes`);
}

for (const s of STITCHES) {
  const d = s.demo();
  const prog = compile(d.ops, d);
  for (let t = 0; t <= prog.dur; t += prog.dur / 401) assert.ok(threaded(frameAt(prog, t)), `${s.slug}: thread not in the eye at t=${t.toFixed(2)}`);
}
console.log('ok thread stays in the eye');

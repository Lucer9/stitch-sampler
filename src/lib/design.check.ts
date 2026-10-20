import assert from 'node:assert/strict';
import { fromAI, type AIDesign } from './design.ts';
import { lesson } from './projects.ts';
import { compile, frameAt } from './engine.ts';

const ok: AIDesign = {
  name: 'Cherries', blurb: 'Two cherries on a stem.', note: '', level: 1,
  parts: [
    { stitch: 'stem-stitch', color: '#557a3f', colorName: 'Sage', step: 'Stems.', why: 'Rope-like line.', paths: [[[0, -12], [-3, -2], [-6, 6]], [[0, -12], [4, -2], [6, 5]]] },
    { stitch: 'satin-stitch', color: '#b0372c', colorName: 'Red', step: 'Cherries.', why: 'Glossy fill.', shapes: [[[-9, 6], [-6, 3], [-3, 6], [-6, 9]], [[3, 5], [6, 2], [9, 5], [6, 8]]], angle: 45 },
    { stitch: 'fishbone-stitch', color: '#6f8f4a', colorName: 'Leaf', step: 'Leaf.', why: 'Built-in vein.', leaves: [{ base: [0, -12], tip: [9, -16], width: 4 }] },
  ],
};
const { project, why } = fromAI(ok);
assert.equal(project.parts.length, 3);
assert.deepEqual(why.map((w) => w.stitch), ['stem-stitch', 'satin-stitch', 'fishbone-stitch']);
const l = lesson(project);
const prog = compile(l.demo().ops, l.demo());
for (let t = 0; t <= prog.dur; t += prog.dur / 60) {
  assert.ok(!/NaN|null/.test(JSON.stringify(frameAt(prog, t).pieces, (_, x) => (typeof x === 'number' && !Number.isFinite(x) ? 'NaN' : x))), `bad frame at ${t}`);
}
assert.ok(prog.holes.every((h) => Math.hypot(h.p.x, h.p.y) <= 27), 'a hole left the hoop');

const hostile = fromAI({
  name: 'x', blurb: '', note: '', level: 9,
  parts: [
    { stitch: 'not-a-stitch', color: 'red', colorName: '', step: '', why: '' },
    { stitch: 'french-knot', color: 'zz', colorName: 'Dot', step: '', why: '', points: [[1e9, 2], ['a', 1] as unknown as number[], [0, 0], [0.5, 0]] },
  ],
} as AIDesign);
assert.equal(hostile.project.parts.length, 1, 'unknown stitches are dropped');
assert.equal(hostile.project.parts[0].floss[1], '#7a5c3e', 'bad colours fall back');
assert.equal(hostile.project.level, 2, 'bad levels fall back');
assert.throws(() => fromAI({ name: '', blurb: '', note: '', level: 1, parts: [] }), /could be stitched/);
console.log('ok design translator');

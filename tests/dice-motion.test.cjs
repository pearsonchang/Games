const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

test('dice canvas stops offscreen, resumes once, and completes with the correct top faces', () => {
  let time = 0, sequence = 0, paints = 0, completed = 0;
  const frames = new Map();
  const node = () => ({style: {}, attrs: {}, classList: {add() {}, remove() {}}, setAttribute(k, v) { this.attrs[k] = v; }});
  const cubes = Array.from({length: 3}, node), shadows = Array.from({length: 3}, node), slots = Array.from({length: 3}, node);
  const row = {...node(), querySelectorAll: selector => selector === '.die-canvas' ? cubes : selector === '.die-shadow' ? shadows : slots};
  const context = vm.createContext({row, matchMedia: () => ({matches: false}), ResizeObserver: class {observe() {}}, drawDice() { paints++; }, performance: {now: () => time}, requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame(id) { frames.delete(id); }});
  vm.runInContext(fs.readFileSync('src/dice-visual.js', 'utf8') + '\nconst visual = new DiceVisual(row);', context);
  const run = code => vm.runInContext(code, context);
  const frame = now => { time = now; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now)); };
  run('visual.roll()'); frame(100); assert.equal(frames.size, 1);
  run('visual.setPaused(true)'); assert.equal(frames.size, 0);
  const previous = paints; run('visual.paint()'); frame(1000); assert.equal(paints, previous);
  run('visual.setPaused(false); visual.setPaused(false)'); assert.equal(frames.size, 1);
  frame(1010); assert.ok(paints > previous);
  run('visual.setPaused(true)'); context.done = () => { completed++; };
  run('visual.settle([2,4,6], done)'); assert.equal(frames.size, 0);
  time = 3000; run('visual.setPaused(false)'); frame(3000);
  assert.equal(completed, 1); assert.equal(frames.size, 0);
  assert.deepEqual(cubes.map(c => c.attrs['aria-label']), ['顶面 2 点', '顶面 4 点', '顶面 6 点']);
});

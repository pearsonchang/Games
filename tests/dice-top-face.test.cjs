const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DICE_TOP_ORIENTATIONS } = require('../src/dice-visual.js');
const { DiceRound } = require('../server/engines/dice.cjs');
const { dots, rotate } = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../src/dice-renderer.js'), 'utf8') +
  '\n({dots: DiceMesh.dots, rotate: diceRotate})'
);

// Count the actual rendered pips whose face normal points up after settling.
function topPips(value) {
  const [x, y] = DICE_TOP_ORIENTATIONS[value];
  return dots.filter(dot => rotate(rotate(dot.normal, 'y', y), 'x', x)[1] < -.999).length;
}
for (let value = 1; value <= 6; value++) {
  assert.equal(topPips(value), value, `Result ${value} must be on the top face`);
}

for (const [values, mode, target, amount] of [
  [[1, 3, 5], 'size', 'small', 100],
  [[6, 5, 3], 'size', 'big', 100],
  [[2, 4, 6], 'sum', 12, 200],
  [[4, 4, 4], 'triple', null, 1500],
  [[2, 2, 2], 'size', 'small', 0],
]) {
  let now = 0, balance = 1000, i = 0, result;
  const round = new DiceRound({
    now: () => now,
    random: () => (values[i++] - .5) / 6,
    charge: cost => (balance -= cost, true),
    credit: reward => balance += reward,
    onFinish: value => result = value,
  });
  assert.equal(round.start(mode, target), true);
  now = 1600;
  round.tick();
  const visible = result.values.map(topPips);
  assert.deepEqual(visible, values);
  assert.equal(result.sum, visible.reduce((sum, value) => sum + value, 0));
  assert.equal(result.amount, amount);
  assert.equal(balance, 950 + amount);
  round.tick();
  assert.equal(balance, 950 + amount, 'Settled rounds must not pay twice');
}
console.log('Passed: all 6 top faces and 5 round settlement cases.');

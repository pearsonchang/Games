const assert = require('node:assert/strict');
const {test} = require('node:test');
const {webcrypto} = require('node:crypto');
const {PointsWallet} = require('../src/platform-wallet.js');
const {GameBridge} = require('../src/platform-bridge.js');
const Session = require('../src/platform-session.js');
const Fairness = require('../src/fairness-core.js');
const engines = {
  minesweeper: require('../src/mines-engine.js').MinesRound,
  rocket: require('../src/rocket-engine.js').RocketRound,
  dice: require('../src/dice-engine.js').DiceRound,
  plinko: require('../src/plinko-engine.js').PlinkoRound,
  horse: require('../src/horse-engine.js').HorseRound,
  slots: require('../src/slots-engine.js').SlotsRound,
  matrix: require('../src/matrix-engine.js').MatrixRound,
  blocks: require('../src/blocks-engine.js').BlocksRound,
  '2048': require('../src/2048-engine.js').FusionRound
};
const requests = {minesweeper: {type: 'mines-start'}, rocket: {type: 'rocket-launch'}, dice: {type: 'dice-roll', mode: 'size', target: 'small'}, plinko: {type: 'plinko-drop', lane: 2}, horse: {type: 'horse-start', selected: 1}, slots: {type: 'slots-spin'}, matrix: {type: 'matrix-spin'}, blocks: {type: 'blocks-start'}, '2048': {type: '2048-start'}};
const copy = value => JSON.parse(JSON.stringify(value));
function reseal(record) {
  const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
  const {checksum, ...payload} = record;
  let hash = 2166136261;
  for (const character of canonical(payload)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  record.checksum = (hash >>> 0).toString(16).padStart(8, '0');
  return record;
}
function setup({now = 1000, fairness, initial = 10000} = {}) {
  const clock = {value: now}, wallet = new PointsWallet(initial, () => 'test');
  const session = {visited: false, activeGame: 'minesweeper', rounds: [], loadedGames: new Set()};
  const frames = Object.fromEntries(Object.keys(engines).map(id => [id, {contentWindow: {messages: [], postMessage(value) { this.messages.push(value); }}}]));
  const bridge = new GameBridge({engines, wallet, frames, loadedGames: session.loadedGames, origin: 'https://test.local', fairnessProviders: {dice: fairness}, onFinish(result) { session.rounds.push({...result, time: wallet.clock()}); }});
  for (const round of Object.values(bridge.rounds)) { round.now = () => clock.value; round.random = () => .5; }
  function send(id, fields = requests[id]) {
    session.loadedGames.add(id); session.visited = true; session.activeGame = id;
    bridge.handle({origin: 'https://test.local', source: frames[id].contentWindow, data: {roundId: bridge.rounds[id].id, ...fields}});
  }
  return {wallet, bridge, session, clock, frames, send};
}
function finish(fixture, id) {
  const round = fixture.bridge.rounds[id];
  if (id === 'minesweeper') {
    const safe = round.board.findIndex(cell => !cell.mine);
    fixture.send(id, {type: 'mines-reveal', index: safe});
    fixture.send(id, {type: 'mines-collect'});
  } else if (id === 'blocks' || id === '2048') round.finish('abandoned');
  else { fixture.clock.value += 120000; fixture.bridge.pulse(); }
}

test('wallet checkpoint retains integer balance, ledger and transaction idempotency without leaking references', () => {
  const first = new PointsWallet(1000, () => 'a');
  first.charge(50, 'debit', 'debit-1'); first.credit(59.52, 'prize', 'credit-1');
  const saved = first.exportState(), second = new PointsWallet(0, () => 'b');
  assert.equal(second.importState(copy(saved)), true);
  assert.equal(second.points, 1009.52);
  assert.equal(second.charge(50, 'repeat', 'debit-1'), false);
  assert.equal(second.credit(59.52, 'repeat', 'credit-1'), false);
  saved.entries[0].amount = 99999; saved.transactions.length = 0;
  assert.equal(second.points, 1009.52);
  for (const mutate of [r => r.cents++, r => r.entries[1].amount = -2000, r => r.transactions.push(r.transactions[0]), r => r.entries[0].extra = true]) {
    const bad = second.exportState(); mutate(bad);
    assert.equal(second.importState(bad), false);
    assert.equal(second.points, 1009.52);
  }
});

for (const id of Object.keys(engines)) test(`${id}: full active and completed round survive JSON round trips with no redraw or duplicate settlement`, () => {
  const first = setup(); first.send(id);
  if (id === 'minesweeper') {
    first.send(id, {type: 'mines-flag', index: first.bridge.rounds[id].board.findIndex(c => c.mine)});
    first.send(id, {type: 'mines-reveal', index: first.bridge.rounds[id].board.findIndex(c => !c.mine)});
  }
  if (id === 'blocks') first.send(id, {type: 'blocks-place', slot: 0, row: 0, col: 0, revision: 0});
  if (id === '2048') first.send(id, {type: '2048-move', direction: 'left', revision: 0});
  const saved = copy(Session.capture(first)), second = setup();
  let randomCalls = 0;
  for (const round of Object.values(second.bridge.rounds)) round.random = () => { randomCalls++; return .1; };
  assert.equal(Session.restore(saved, second), true);
  assert.equal(randomCalls, 0, 'restore must preserve all hidden outcomes');
  assert.equal(second.wallet.points, first.wallet.points);
  assert.equal(second.session.loadedGames.size, 0, 'DOM loading state belongs to the new process');
  assert.deepEqual(Session.capture(second), saved);
  finish(second, id);
  const complete = copy(Session.capture(second)), balance = second.wallet.points;
  assert.equal(second.session.rounds.length, 1);
  const third = setup({now: second.clock.value + 120000});
  assert.equal(Session.restore(complete, third), true);
  for (let i = 0; i < 20; i++) third.bridge.pulse();
  assert.equal(third.wallet.points, balance);
  assert.equal(third.session.rounds.length, 1);
  assert.equal(Session.restore(complete, third), false, 'a live bridge cannot be rewound by importing again');
  third.send(id, requests[id]);
  assert.equal(third.bridge.rounds[id].counter, 2);
  assert.equal(third.wallet.ledger.filter(e => e.amount < 0).length, 2);
});

test('all nine concurrent rounds restore together; expired hidden games settle once using the original results', () => {
  const first = setup();
  for (const id of Object.keys(engines)) first.send(id);
  const saved = copy(Session.capture(first)), second = setup({now: 121000});
  for (const round of Object.values(second.bridge.rounds)) round.random = () => { throw new Error('restore redrew a result'); };
  assert.equal(Session.restore(saved, second), true);
  assert.equal(second.session.rounds.length, 6);
  for (const id of ['minesweeper', 'blocks', '2048']) assert.equal(second.bridge.rounds[id].state, 'playing');
  assert.equal(second.session.loadedGames.size, 0);
  assert.equal(Object.values(second.frames).flatMap(f => f.contentWindow.messages).length, 0);
  const after = copy(Session.capture(second));
  for (let i = 0; i < 100; i++) second.bridge.pulse();
  assert.deepEqual(Session.capture(second), after);
  first.clock.value = second.clock.value; first.bridge.pulse();
  assert.deepEqual(second.wallet.exportState(), first.wallet.exportState());
  assert.deepEqual(second.session.rounds, first.session.rounds);
});

test('an unexpired restored round keeps progressing even before its iframe is loaded', () => {
  const first = setup(); first.send('horse');
  const second = setup({now: 5000});
  assert.equal(Session.restore(copy(Session.capture(first)), second), true);
  assert.equal(second.bridge.rounds.horse.elapsed, 4000);
  assert.equal(second.bridge.rounds.horse.state, 'racing');
  second.clock.value = 16900; second.bridge.pulse();
  assert.equal(second.bridge.rounds.horse.state, 'finished');
  assert.equal(second.session.rounds.length, 1);
  assert.equal(second.session.loadedGames.size, 0);
});

test('invalid, damaged, future-version and polluted saves are rejected before changing a wallet or round', () => {
  const first = setup(); first.send('minesweeper'); first.send('blocks');
  const good = copy(Session.capture(first));
  const mutations = [r => r.schemaVersion = 2, r => r.checksum = '00000000', r => r.wallet.cents++, r => r.bridge.rounds.minesweeper.board[0].mine = !r.bridge.rounds.minesweeper.board[0].mine, r => r.bridge.rounds.blocks.tray[0].cells[0] = [99, 99], r => r.bridge.finished.push('rocket:rocket-9'), r => r.bridge.rounds.rocket.counter = 9, r => r.bridge.rounds.rocket.charge = 'injected', r => r.session.activeGame = 'external', r => r.session.rounds.push({gameId: 'unknown'}), r => r.bridge.rounds.blocks.board.length = 2];
  for (const mutate of mutations) {
    const bad = copy(good); mutate(bad); const fresh = setup(), before = Session.capture(fresh);
    assert.equal(Session.restore(bad, fresh), false);
    assert.deepEqual(Session.capture(fresh), before);
    if (bad.schemaVersion === 1 && bad.checksum !== '00000000') {
      assert.equal(Session.restore(reseal(bad), fresh), false, 'schema and cross-field invariants also reject a damaged payload with a recomputed checksum');
      assert.deepEqual(Session.capture(fresh), before);
    }
  }
  const poisoned = JSON.parse(JSON.stringify(good).replace('"schemaVersion":1', '"__proto__":{"polluted":true},"schemaVersion":1'));
  assert.equal(Session.restore(poisoned, setup()), false);
  assert.equal({}.polluted, undefined);
});

test('long sessions keep bounded history while old charges, payouts and completion callbacks remain deduplicated', () => {
  const first = setup();
  for (let i = 0; i < 1200; i++) {
    first.send('slots'); first.clock.value += 3000; first.bridge.pulse();
  }
  const oldResult = first.session.rounds[0], saved = copy(Session.capture(first));
  assert.equal(saved.session.rounds.length, 200);
  assert.equal(saved.wallet.entries.length, 500);
  assert.equal(saved.wallet.entries[0].label, '历史结余');
  assert.equal(saved.wallet.transactions.length, 2);
  assert.equal(saved.bridge.finished.length, 1);
  assert.ok(JSON.stringify(saved).length < 100000);
  const second = setup({now: first.clock.value});
  assert.equal(Session.restore(saved, second), true);
  const balance = second.wallet.points;
  assert.equal(second.wallet.charge(50, 'old charge', 'slots:1:debit'), false);
  assert.equal(second.wallet.credit(oldResult.amount, 'old payout', 'slots:slots-1:credit'), false);
  second.bridge.rounds.slots.onFinish(oldResult);
  assert.equal(second.session.rounds.length, 200);
  assert.equal(second.wallet.points, balance);
  second.send('slots');
  assert.equal(second.bridge.rounds.slots.id, 'slots-1201');
  assert.equal(second.wallet.points, balance - 50);
  assert.doesNotThrow(() => Session.capture(second));
});

test('prepared fairness dice restore original receipt and nonce, settle once, and next roll gets a new nonce', async () => {
  const provider = new Fairness.DemoProvider({crypto: webcrypto}), first = setup({fairness: provider});
  first.send('dice'); await first.bridge.rounds.dice.preparation;
  const saved = copy(Session.capture(first)), receipt = copy(provider.rounds.get('dice-1').record);
  const nextProvider = new Fairness.DemoProvider({crypto: webcrypto}), second = setup({now: 10000, fairness: nextProvider});
  assert.equal(Session.restore(saved, second), true);
  assert.equal(second.bridge.rounds.dice.state, 'finished');
  assert.deepEqual(second.bridge.rounds.dice.proof, receipt);
  assert.equal((await Fairness.verify(second.bridge.rounds.dice.proof, webcrypto)).ok, true);
  assert.equal(nextProvider.history.length, 1);
  for (let i = 0; i < 10; i++) second.bridge.pulse();
  assert.equal(nextProvider.history.length, 1);
  const completed = Session.capture(second);
  assert.equal(Session.restore(copy(completed), setup({fairness: new Fairness.DemoProvider({crypto: webcrypto})})), true);
  second.send('dice'); await second.bridge.rounds.dice.preparation;
  assert.equal(second.bridge.rounds.dice.id, 'dice-2');
  assert.equal(second.bridge.rounds.dice.state, 'rolling');
  assert.equal(nextProvider.highestNonce, 2);
});

test('interrupted preparing dice receive exactly one refund, no fabricated revealed proof, and can play again', async () => {
  const provider = new Fairness.DemoProvider({crypto: webcrypto});
  provider.prepare = () => new Promise(() => {});
  const first = setup({fairness: provider}); first.send('dice');
  const saved = copy(Session.capture(first));
  const second = setup({fairness: new Fairness.DemoProvider({crypto: webcrypto})});
  assert.equal(Session.restore(saved, second), true);
  assert.equal(second.wallet.points, 10000);
  assert.equal(second.bridge.rounds.dice.state, 'error');
  assert.equal(second.bridge.rounds.dice.proof.state, 'failed');
  assert.equal(second.session.rounds.length, 0);
  const refunded = Session.capture(second), third = setup({fairness: new Fairness.DemoProvider({crypto: webcrypto})});
  assert.equal(Session.restore(copy(refunded), third), true);
  assert.equal(third.wallet.points, 10000);
  assert.equal(third.wallet.ledger.filter(e => e.label.includes('退回')).length, 1);
  assert.equal(Session.restore(saved, third), false);
  third.send('dice'); await third.bridge.rounds.dice.preparation;
  assert.equal(third.wallet.points, 9950);
  assert.equal(third.bridge.rounds.dice.id, 'dice-2');
  assert.equal(third.bridge.rounds.dice.state, 'rolling');
});

test('rolling dice retain their proof status if Web Crypto availability changes between sessions', async () => {
  const first = setup({fairness: new Fairness.DemoProvider({crypto: webcrypto})});
  first.send('dice'); await first.bridge.rounds.dice.preparation;
  const receipt = copy(first.bridge.rounds.dice.fairness.rounds.get('dice-1').record);
  const second = setup();
  assert.equal(Session.restore(copy(Session.capture(first)), second), true);
  assert.doesNotThrow(() => Session.capture(second));
  second.clock.value = 5000; second.bridge.pulse();
  assert.deepEqual(second.bridge.rounds.dice.proof, receipt);
  assert.equal(second.bridge.rounds.dice.fairness, null);
  const plain = setup(); plain.send('dice');
  const verified = setup({fairness: new Fairness.DemoProvider({crypto: webcrypto})});
  assert.equal(Session.restore(copy(Session.capture(plain)), verified), true);
  assert.doesNotThrow(() => Session.capture(verified));
  verified.clock.value = 5000; verified.bridge.pulse();
  assert.equal(verified.bridge.rounds.dice.proof, null);
  verified.send('dice'); await verified.bridge.rounds.dice.preparation;
  assert.equal(verified.bridge.rounds.dice.proof.state, 'prepared');
});

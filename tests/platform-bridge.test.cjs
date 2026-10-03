const assert = require('node:assert/strict');
const {test} = require('node:test');
const {PointsWallet} = require('../src/platform-wallet.js');
const {GameBridge} = require('../src/platform-bridge.js');
const {MinesRound} = require('../src/mines-engine.js');
const {RocketRound} = require('../src/rocket-engine.js');
const {DiceRound} = require('../src/dice-engine.js');
const {PlinkoRound} = require('../src/plinko-engine.js');
const {HorseRound} = require('../src/horse-engine.js');

test('wallet rejects invalid values, protects the ledger, and applies each transaction once', () => {
  const wallet = new PointsWallet(1000, () => 'test');
  for (const amount of [NaN, Infinity, -1, '50', null, Number.MAX_SAFE_INTEGER]) {
    assert.equal(wallet.charge(amount, 'bad'), false);
    assert.equal(wallet.credit(amount, 'bad'), false);
  }
  assert.equal(wallet.charge(1001, 'too much', 'retry'), false);
  assert.equal(wallet.charge(50, 'round', 'retry'), true);
  assert.equal(wallet.charge(50, 'round', 'retry'), false);
  assert.equal(wallet.credit(59.52, 'reward', 'reward-1'), true);
  assert.equal(wallet.credit(59.52, 'reward', 'reward-1'), false);
  assert.equal(wallet.points, 1009.52);
  const ledger = wallet.ledger; ledger[0].amount = 999999; ledger.pop();
  assert.equal(wallet.ledger.length, 3);
  assert.equal(wallet.ledger.reduce((sum, e) => sum + Math.round(e.amount * 100), 0), Math.round(wallet.points * 100));
});

const engines = {minesweeper: MinesRound, rocket: RocketRound, dice: DiceRound, plinko: PlinkoRound, horse: HorseRound};
const requests = {
  minesweeper: {type: 'mines-start'}, rocket: {type: 'rocket-launch'},
  dice: {type: 'dice-roll', mode: 'size', target: 'small'},
  plinko: {type: 'plinko-drop', lane: 4}, horse: {type: 'horse-start', selected: 0}
};
for (const gameId of Object.keys(engines)) test(`${gameId}: stale, duplicate, foreign and missing-ID requests never start or settle another round`, () => {
  const wallet = new PointsWallet();
  const frames = Object.fromEntries(Object.keys(engines).map(id => [id, {contentWindow: {messages: [], postMessage(d) { this.messages.push(d); }}}]));
  const loadedGames = new Set();
  let now = 0, finishes = 0;
  const bridge = new GameBridge({engines, frames, wallet, loadedGames, origin: 'https://test.local', onFinish() { finishes++; }});
  const round = bridge.rounds[gameId]; round.now = () => now; round.random = () => .5;
  const send = (extra = {}, source = frames[gameId].contentWindow, origin = 'https://test.local') => bridge.handle({source, origin, data: {...requests[gameId], ...extra}});
  send({roundId: ''}); assert.equal(wallet.points, 1000); // Not loaded yet.
  loadedGames.add(gameId);
  send(); send({roundId: 0}); send({roundId: ''}, {}, 'https://test.local');
  send({roundId: ''}, frames[gameId].contentWindow, 'https://foreign.local');
  send({type: 'game-reward', amount: 100000, roundId: ''}); send({type: {}});
  assert.equal(wallet.points, 1000);
  send({roundId: ''}); assert.equal(wallet.points, 950);
  const firstId = round.id;
  send({roundId: ''}); assert.equal(round.id, firstId); assert.equal(wallet.points, 950);
  if (gameId === 'minesweeper') send({type: 'mines-forfeit', roundId: firstId});
  else { now = 999999; bridge.sync(gameId); }
  assert.equal(finishes, 1);
  const settled = wallet.points;
  send({roundId: ''}); bridge.sync(gameId);
  assert.equal(wallet.points, settled); assert.equal(round.id, firstId); assert.equal(finishes, 1);
  send({roundId: firstId}); assert.equal(wallet.points, settled - 50);
  const secondId = round.id;
  if (gameId === 'rocket') {
    send({type: 'rocket-collect', roundId: firstId}); assert.equal(round.state, 'flying');
    send({type: 'rocket-collect', roundId: secondId});
    const collected = wallet.points;
    send({type: 'rocket-collect', roundId: secondId}); assert.equal(wallet.points, collected);
  }
  send({roundId: firstId}); assert.equal(round.id, secondId);
  assert.equal(wallet.ledger.filter(e => e.amount < 0).length, 2);
});

test('an immediate rocket crash cannot turn a repeated launch into a second debit', () => {
  const wallet = new PointsWallet(), source = {postMessage() {}};
  const bridge = new GameBridge({engines: {rocket: RocketRound}, wallet, frames: {rocket: {contentWindow: source}}, loadedGames: new Set(['rocket']), origin: 'https://test.local'});
  bridge.rounds.rocket.random = () => .99;
  const event = {origin: 'https://test.local', source, data: {type: 'rocket-launch', roundId: ''}};
  bridge.handle(event); bridge.handle(event);
  assert.equal(bridge.rounds.rocket.state, 'crashed'); assert.equal(wallet.points, 950);
});

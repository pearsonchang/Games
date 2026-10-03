'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {initialState, evolve, transact, validate, ServiceError} = require('../server/service.cjs');
const {SQLiteStore, RedisStore, configuredStore, CAS, TTL_SECONDS} = require('../server/store.cjs');
const requests = {
  minesweeper: {type: 'mines-start', revision: 0}, rocket: {type: 'rocket-launch'},
  dice: {type: 'dice-roll', mode: 'size', target: 'small'},
  plinko: {type: 'plinko-drop', lane: 4}, horse: {type: 'horse-start', selected: 0}
};
const act = (gameId, extra = {}) => ({op: 'act', gameId, ...requests[gameId], roundId: '', requestId: randomUUID(), ...extra});
function harness() {
  let state = initialState(), now = 10000;
  return {send(body) {const result = evolve(state, body, {now, random: () => 0}); state = result.data; return result.response;}, get state() {return state;}, time(value) {now = value;}};
}
test('only public snapshots cross the boundary; hidden mines and future results stay private', () => {
  const h = harness();
  const initial = h.send({op: 'connect'});
  assert.equal(initial.points, 1000);
  for (const game of Object.keys(requests)) h.send(act(game));
  const response = h.send({op: 'sync'}), mine = response.games.minesweeper;
  assert.equal(response.points, 750);
  assert.equal(h.state.games.minesweeper.board.filter(c => c.mine).length, 10);
  assert.equal(mine.cells.length, 54);
  for (const cell of mine.cells) assert.deepEqual(Object.keys(cell).sort(), ['flagged', 'index', 'revealed']);
  for (const forbidden of ['board', 'random', 'wallet', 'crashAt', 'capAt', 'runs', 'values', 'receipts', 'transactions']) {
    assert.equal(Object.hasOwn(response, forbidden), false);
    for (const game of Object.values(response.games)) assert.equal(Object.hasOwn(game, forbidden), false, forbidden);
  }
  assert.equal(response.games.dice.result, null);
  assert.equal(response.games.horse.result, null);
  assert.equal(JSON.stringify(response).includes('playroom_session'), false);
  const opened = h.send(act('minesweeper', {type: 'mines-reveal', roundId: mine.roundId, revision: mine.revision, index: 20}));
  assert.deepEqual(opened.games.minesweeper.cells[20], {index: 20, revealed: true, flagged: false, mine: false});
  assert.equal(opened.games.minesweeper.cells.filter(c => Object.hasOwn(c, 'mine')).length, 1);
  const same = h.send({op: 'sync', knownRounds: {plinko: response.games.plinko.roundId}});
  assert.equal(Object.hasOwn(same.games.plinko, 'path'), false);
});
for (const game of Object.keys(requests)) test(`${game}: replay, stale round and background settlement cannot duplicate credits or debits`, () => {
  const h = harness(), first = act(game);
  let response = h.send(first), snapshot = response.games[game];
  assert.equal(response.action.ok, true); assert.equal(response.points, 950);
  assert.equal(h.send(first).points, 950);
  assert.equal(h.send({...first, requestId: randomUUID()}).action.ok, false);
  if (game === 'minesweeper') {
    response = h.send(act(game, {type: 'mines-reveal', roundId: snapshot.roundId, revision: snapshot.revision, index: 20}));
    snapshot = response.games[game];
    const collect = act(game, {type: 'mines-collect', roundId: snapshot.roundId, revision: snapshot.revision});
    response = h.send(collect);
    assert.equal(response.points, 1009.52);
    assert.equal(h.send(collect).points, 1009.52);
    assert.equal(h.send({...collect, requestId: randomUUID()}).action.ok, false);
  } else { h.time(1000000); response = h.send({op: 'sync'}); }
  const settled = response.points;
  assert.equal(response.rounds.length, 1);
  assert.equal(h.send({op: 'connect'}).points, settled);
  assert.equal(h.send({...first, requestId: randomUUID()}).points, settled);
  assert.equal(h.send({op: 'sync'}).rounds.length, 1);
  const current = response.games[game];
  const next = h.send(act(game, {roundId: current.roundId, ...(game === 'minesweeper' ? {revision: current.revision} : {})}));
  assert.equal(next.action.ok, true); assert.equal(next.points, settled - 50);
  assert.equal(next.ledger.filter(e => e.amount < 0).length, 2);
  assert.notEqual(next.games[game].roundId, current.roundId);
});
test('mine flag revision and request receipts make toggle retry safe; first click can lose', () => {
  const h = harness(); let r = h.send(act('minesweeper')).games.minesweeper;
  const flag = act('minesweeper', {type: 'mines-flag', roundId: r.roundId, revision: r.revision, index: 20});
  const first = h.send(flag); assert.equal(first.games.minesweeper.cells[20].flagged, true);
  assert.equal(h.send(flag).games.minesweeper.cells[20].flagged, true);
  assert.equal(h.send({...flag, requestId: randomUUID()}).action.ok, false);
  assert.throws(() => h.send({...flag, index: 21}), e => e.status === 409);
  r = first.games.minesweeper;
  const lost = h.send(act('minesweeper', {type: 'mines-reveal', roundId: r.roundId, revision: r.revision, index: 0}));
  assert.equal(lost.games.minesweeper.state, 'lost'); assert.equal(lost.points, 950); assert.equal(lost.rounds[0].amount, 0);
});
test('reject forged amounts, boards, future times, malformed identifiers and cross-game actions', () => {
  const invalid = [null, [], {op: 'credit', amount: 1000}, {op: 'connect', amount: 1000},
    ...['amount', 'balance', 'wallet', 'board', 'seed', 'random', 'now', 'won', 'payout'].map(key => ({...act('minesweeper'), [key]: 1000000})),
    act('minesweeper', {type: 'rocket-launch'}), act('minesweeper', {revision: -1}), act('minesweeper', {roundId: 0}),
    act('dice', {mode: 'sum', target: '18'}), act('plinko', {lane: -1}), act('horse', {selected: 4}),
    ...['__proto__', 'constructor', 'toString', {}, null].flatMap(value => [act(value), act('dice', {type: value})])];
  for (const body of invalid) assert.throws(() => validate(body), e => e instanceof ServiceError && e.status === 400, JSON.stringify(body));
});
test('all games enforce the same server wallet when insufficient', () => {
  for (const game of Object.keys(requests)) {
    const state = initialState(); state.wallet.cents = 4999;
    const r = evolve(state, act(game), {random: () => 0, now: 1000});
    assert.equal(r.response.action.ok, false); assert.equal(r.response.points, 49.99);
    assert.equal(r.response.games[game].roundId, '');
  }
});
test('SQLite survives restart; simultaneous identical requests and cross-game spends are atomic', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-ledger-')), filename = path.join(dir, 'points.sqlite');
  let a = new SQLiteStore(filename), b = new SQLiteStore(filename);
  const opts = {clock: () => 1000, random: () => 0};
  try {
    await a.create('player', initialState());
    const start = act('minesweeper');
    const all = await Promise.all(Array.from({length: 100}, (_, i) => transact(i % 2 ? a : b, 'player', start, opts)));
    assert.ok(all.every(r => r.points === 950 && r.games.minesweeper.roundId === 'mines-1'));
    let r = all[0].games.minesweeper;
    await transact(a, 'player', act('minesweeper', {type: 'mines-reveal', roundId: r.roundId, revision: r.revision, index: 20}), opts);
    a.close(); b.close(); a = new SQLiteStore(filename); b = new SQLiteStore(filename);
    const restored = await transact(a, 'player', {op: 'connect'}, opts);
    assert.equal(restored.points, 950); assert.equal(restored.games.minesweeper.opened, 1);
    r = restored.games.minesweeper;
    const collect = act('minesweeper', {type: 'mines-collect', roundId: r.roundId, revision: r.revision});
    const paid = await Promise.all(Array.from({length: 100}, (_, i) => transact(i % 2 ? a : b, 'player', collect, opts)));
    assert.ok(paid.every(x => x.points === 1009.52 && x.rounds.length === 1));
    assert.equal((await a.read('player')).wallet.entries.length, 3);
    const poor = initialState(); poor.wallet.cents = 5000; await a.create('poor', poor);
    const spends = await Promise.all([transact(a, 'poor', act('horse'), opts), transact(b, 'poor', act('dice'), opts)]);
    assert.equal(spends.filter(r => r.action.ok).length, 1); assert.equal((await a.read('poor')).wallet.cents, 0);
    await assert.rejects(transact(a, 'missing', {op: 'sync'}), e => e.status === 401);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  } finally { a.close(); b.close(); fs.rmSync(dir, {recursive: true, force: true}); }
});
test('uncommitted results never escape when storage refuses a commit', async () => {
  const store = {read: async () => initialState(), compareAndSwap: async () => false};
  await assert.rejects(transact(store, 'player', act('minesweeper')), e => e.status === 409);
});
test('cloud requires durable configuration; Redis adapter uses atomic version compare-and-swap', async () => {
  assert.throws(() => configuredStore({VERCEL: '1'}), /Persistent/);
  assert.throws(() => configuredStore({NODE_ENV: 'production'}), /Persistent/);
  assert.throws(() => new RedisStore('http://redis.test', 'secret'), /Invalid/);
  const calls = [], value = initialState();
  const store = new RedisStore('https://redis.test', 'server-only', async (url, options) => {
    const command = JSON.parse(options.body); calls.push(command);
    assert.equal(options.headers.Authorization, 'Bearer server-only');
    return {ok: true, json: async () => ({result: command[0] === 'GET' ? JSON.stringify(value) : command[0] === 'EVAL' ? 1 : 'OK'})};
  });
  assert.equal(await store.create('a', value), true); assert.deepEqual(await store.read('a'), value);
  assert.equal(await store.compareAndSwap('a', 0, {...value, version: 1}), true);
  assert.deepEqual(calls[0].slice(3), ['NX', 'EX', TTL_SECONDS]);
  assert.deepEqual(calls[2].slice(0, 5), ['EVAL', CAS, 1, 'a', 0]);
  assert.match(CAS, /parsed.version~=tonumber\(ARGV\[1\]\)/);
});

'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {PointsWallet} = require('../server/wallet.cjs');
const {GameBridge} = require('../src/platform-bridge.js');
const {PlatformAPI} = require('../src/platform-api.js');
const {initialState, evolve} = require('../server/service.cjs');
const {randomUUID} = require('node:crypto');

test('server wallet validates amounts, ledger copies and transaction identity across restore', () => {
  let wallet = new PointsWallet(1000, () => 'test');
  for (const amount of [NaN, Infinity, -1, '50', null, Number.MAX_SAFE_INTEGER]) {
    assert.equal(wallet.charge(amount, 'bad'), false); assert.equal(wallet.credit(amount, 'bad'), false);
  }
  assert.equal(wallet.charge(1001, 'too much', 'retry'), false);
  assert.equal(wallet.charge(50, 'round', 'retry'), true);
  wallet = PointsWallet.restore(JSON.parse(JSON.stringify(wallet.export())), () => 'test');
  assert.equal(wallet.charge(50, 'round', 'retry'), false);
  assert.equal(wallet.credit(59.52, 'reward', 'reward-1'), true);
  assert.equal(wallet.credit(59.52, 'reward', 'reward-1'), false);
  assert.equal(wallet.points, 1009.52);
  const ledger = wallet.ledger; ledger[0].amount = 999999; ledger.pop();
  assert.equal(wallet.ledger.length, 3);
  assert.equal(wallet.ledger.reduce((sum, e) => sum + Math.round(e.amount * 100), 0), Math.round(wallet.points * 100));
});
test('bridge only forwards allowed intents from a loaded same-origin game frame', async () => {
  const source = {messages: [], postMessage(d) {this.messages.push(d);}}, calls = [];
  const api = {online: true, games: {minesweeper: {type: 'mines-state', balance: 1000}}, async act(...args) {calls.push(args); return {action: {ok: true}};}};
  const loadedGames = new Set(), frames = {minesweeper: {contentWindow: source}};
  const bridge = new GameBridge({api, loadedGames, frames, origin: 'https://test.local'});
  const event = {source, origin: 'https://test.local', data: {type: 'mines-start', roundId: '', revision: 0}};
  await bridge.handle(event); loadedGames.add('minesweeper');
  await bridge.handle({...event, origin: 'https://other.local'}); await bridge.handle({...event, source: {}});
  for (const type of ['game-reward', 'wallet-credit', 'horse-start', '__proto__', {}]) await bridge.handle({...event, data: {...event.data, type}});
  assert.equal(calls.length, 0);
  await bridge.handle({...event, data: {type: 'mines-ready'}}); assert.equal(source.messages.at(-1).balance, 1000);
  await bridge.handle({...event, data: {...event.data, amount: 99999, board: []}});
  assert.deepEqual(calls, [['minesweeper', event.data]]);
  assert.equal('rounds' in bridge, false); assert.equal('wallet' in bridge, false);
  api.online = false; await bridge.handle(event); assert.equal(calls.length, 1); assert.equal(source.messages.at(-1).type, 'platform-offline');
});
test('client retries an uncertain response with the same request ID, never double-debits or invents credits', async () => {
  let state = initialState(), loseNext = false;
  const sent = [], observed = [], status = [];
  const api = new PlatformAPI({uuid: randomUUID, onState: r => observed.push(r), onStatus: online => status.push(online), fetcher: async (_, options) => {
    const body = JSON.parse(options.body); sent.push(body);
    const r = evolve(state, body, {now: 1000, random: () => 0}); state = r.data;
    if (loseNext) {loseNext = false; throw new Error('Response lost after commit');}
    return {ok: true, json: async () => r.response};
  }});
  await api.connect(); loseNext = true;
  await api.act('minesweeper', {type: 'mines-start', roundId: '', revision: 0});
  assert.equal(sent.length, 3); assert.equal(sent[1].requestId, sent[2].requestId);
  assert.equal(observed.at(-1).points, 950); assert.equal(state.wallet.entries.length, 2);
  assert.equal('board' in api.games.minesweeper, false); assert.equal(typeof api.credit, 'undefined');
  const version = api.version;
  api.fetcher = async () => ({ok: true, json: async () => ({version: 0, games: {}, points: 999999})});
  await api.refresh(); assert.equal(api.version, version); assert.equal(observed.at(-1).points, 950);
  api.fetcher = async () => {throw new Error('offline');};
  await assert.rejects(api.act('minesweeper', {type: 'mines-collect', roundId: 'mines-1', revision: 1}), /offline/);
  assert.equal(api.online, false); assert.equal(status.at(-1), false); assert.equal(observed.at(-1).points, 950);
});

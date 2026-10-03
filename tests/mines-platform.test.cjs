'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const {test} = require('node:test');
const {webcrypto} = require('node:crypto');
const {initialState, evolve} = require('../server/service.cjs');

test('lobby renders server snapshots, restores mines on refresh, and shares the ledger across five games', async () => {
  let stored = initialState(), now = 1000;
  function mount() {
    const elements = new Map(), listeners = {};
    const el = id => {if (!elements.has(id)) elements.set(id, {hidden: false, innerHTML: '', textContent: '', contentWindow: {messages: [], postMessage(d) {this.messages.push(d);}}, setAttribute() {}, removeAttribute() {}, close() {}, showModal() {}}); return elements.get(id);};
    const ctx = vm.createContext({document: {getElementById: el, querySelectorAll: () => [], addEventListener() {}}, window: {scrollTo() {}, addEventListener: (n, f) => listeners[n] = f}, location: {origin: 'https://test.local', hash: ''}, setInterval() {}, Date, console, crypto: webcrypto, AbortSignal,
      fetch: async (_, options) => {const result = evolve(stored, JSON.parse(options.body), {now, random: () => 0}); stored = result.data; return {ok: true, json: async () => result.response};}
    });
    vm.runInContext(['platform-catalog', 'platform-api', 'platform-view', 'platform-bridge', 'platform'].map(name => fs.readFileSync('src/' + name + '.js', 'utf8')).join('\n'), ctx);
    const run = code => vm.runInContext(code, ctx);
    const send = async (game, type, extra = {}) => {
      const snapshot = run(`api.games[${JSON.stringify(game)}]`);
      await listeners.message({origin: 'https://test.local', source: el(game === 'minesweeper' ? 'game-frame' : game + '-frame').contentWindow, data: {type, roundId: snapshot.roundId, revision: snapshot.revision, ...extra}});
      await run('api.queue');
    };
    return {run, send, el, ready: run('api.queue'), read: () => JSON.parse(run('JSON.stringify({points:session.points,ledger:session.ledger,rounds:session.rounds})'))};
  }
  let h = mount(); await h.ready;
  assert.equal(h.el('header-points').textContent, '1,000');
  assert.equal(h.run('typeof wallet'), 'undefined'); assert.equal(h.run('typeof MinesRound'), 'undefined');
  h.run("play('minesweeper')"); await h.send('minesweeper', 'mines-start');
  await h.send('minesweeper', 'mines-reveal', {index: 20});
  assert.equal(h.read().points, 950); assert.equal(h.run('api.games.minesweeper.payout'), 59.52);
  h = mount(); await h.ready;
  h.run("play('minesweeper')"); await h.send('minesweeper', 'mines-ready');
  assert.equal(h.el('game-frame').contentWindow.messages.at(-1).opened, 1);
  await h.send('minesweeper', 'mines-collect');
  assert.equal(h.read().points, 1009.52); assert.equal(h.read().rounds.length, 1);
  h.run("showPage('rewards')"); assert.match(h.el('content').innerHTML, /1,009\.52/); assert.match(h.el('content').innerHTML, /59\.52/);
  h.run("play('horse')"); await h.send('horse', 'horse-start', {selected: 0});
  h.run("showPage('games')"); now = 18000; await h.run('api.refresh()');
  assert.equal(h.read().rounds.length, 2); assert.equal(h.run('api.games.horse.state'), 'finished');
  h.run("showPage('me')"); assert.match(h.el('content').innerHTML, /星际赛马/);
});

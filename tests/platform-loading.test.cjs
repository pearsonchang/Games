const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

test('re-entering an unready game reloads its frame without a debit; ready games are reused', () => {
  const elements = new Map(), listeners = {}, documentListeners = {}, intervals = [];
  function el(id) {
    if (!elements.has(id)) elements.set(id, {hidden: false, innerHTML: '', textContent: '', attrs: {}, contentWindow: {messages: [], postMessage(data) { this.messages.push(data); }}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, close() {}, showModal() {}});
    return elements.get(id);
  }
  const document = {hidden: false, getElementById: el, querySelectorAll: () => [], addEventListener: (name, fn) => { documentListeners[name] = fn; }};
  const engines = Object.assign({}, ...['mines', 'rocket', 'dice', 'plinko', 'horse', 'slots', 'matrix', 'blocks', '2048'].map(id => require('../src/' + id + '-engine.js')));
  const context = vm.createContext({...engines, document, window: {scrollTo() {}, addEventListener: (name, fn) => { listeners[name] = fn; }}, location: {origin: 'https://test.local', hash: ''}, setInterval: fn => intervals.push(fn), setTimeout() { return 1; }, clearTimeout() {}, Date, console});
  vm.runInContext(['platform-catalog', 'lobby-preferences', 'game-load-guard', 'platform-wallet', 'platform-view', 'platform-bridge', 'platform'].map(name => fs.readFileSync('src/' + name + '.js', 'utf8')).join('\n'), context);
  const run = code => vm.runInContext(code, context);
  run("play('dice')"); const first = el('dice-frame').src;
  run("showPage('games'); play('dice')"); const retry = el('dice-frame').src;
  assert.notEqual(retry, first); assert.match(retry, /retry=/);
  assert.equal(run('wallet.points'), 1000);
  assert.equal(run('session.rounds.length'), 0);
  listeners.message({origin: 'https://test.local', source: el('dice-frame').contentWindow, data: {type: 'dice-ready'}});
  assert.equal(el('game-loading').hidden, true);
  run("showPage('games'); play('dice')"); assert.equal(el('dice-frame').src, retry);
  document.hidden = true; documentListeners.visibilitychange();
  assert.equal(el('dice-frame').contentWindow.messages.at(-1).paused, true);
  const count = el('dice-frame').contentWindow.messages.length;
  intervals.forEach(fn => fn()); assert.equal(el('dice-frame').contentWindow.messages.length, count);
  document.hidden = false; documentListeners.visibilitychange();
  assert.equal(el('dice-frame').contentWindow.messages.at(-1).type, 'dice-state');
  assert.equal(run('wallet.points'), 1000);
});

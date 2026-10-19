'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment({native = false, hash = '#games'} = {}) {
  const elements = new Map(), windowListeners = {}, documentListeners = {}, events = [];
  let renders = 0, scrolls = 0, nativeCallbacks, flushes = 0;
  class Element {
    constructor(id = '', attrs = {}) {
      this.id = id; this.hidden = false; this.attrs = {}; this.dataset = {}; this.textContent = '';
      this.contentWindow = {messages: [], postMessage(data) { this.messages.push(data); }};
      for (const [key, value] of Object.entries(attrs)) this.setAttribute(key, value);
    }
    set innerHTML(value) { this.html = value; if (this.id === 'content') renders++; }
    get innerHTML() { return this.html; }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
    removeAttribute(key) { delete this.attrs[key]; }
    closest(selector) { return selector === 'button' ? this : null; }
    focus() {}
    close() {}
    showModal() {}
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  const navigation = ['games', 'rewards', 'me'].map(page => new Element('', {'data-page': page}));
  const entries = [`https://test.local/index.html${hash}`]; let cursor = 0;
  function changed(oldURL) {
    const newURL = entries[cursor];
    if (new URL(oldURL).hash !== new URL(newURL).hash) events.push(() => windowListeners.hashchange?.({oldURL, newURL}));
  }
  const location = {
    origin: 'https://test.local',
    get href() { return entries[cursor]; },
    get hash() { return new URL(this.href).hash; },
    set hash(value) {
      const oldURL = this.href, url = new URL(oldURL); url.hash = value;
      if (url.href === oldURL) return;
      entries.splice(++cursor); entries.push(url.href); changed(oldURL);
    }
  };
  const history = {
    get length() { return entries.length; },
    pushState(_state, _title, url) { const next = new URL(url, location.href).href; entries.splice(++cursor); entries.push(next); },
    back() { if (cursor) { const oldURL = location.href; cursor--; changed(oldURL); } },
    forward() { if (cursor < entries.length - 1) { const oldURL = location.href; cursor++; changed(oldURL); } }
  };
  const document = {
    hidden: false, getElementById: element,
    querySelectorAll: selector => selector === '.navigation button' ? navigation : [],
    querySelector: () => null,
    addEventListener: (name, fn) => { documentListeners[name] = fn; }
  };
  const engines = Object.assign({}, ...['mines', 'rocket', 'dice', 'plinko', 'horse', 'slots', 'matrix', 'blocks', '2048'].map(id => require('../src/' + id + '-engine.js')));
  const sandbox = {...engines, document, location, history, Date, console,
    addEventListener: (name, fn) => { windowListeners[name] = fn; },
    scrollTo() { scrolls++; }, setInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    PlayroomDevice: {isNative: native},
    PlayroomMobile: {create(callbacks) {
      nativeCallbacks = callbacks;
      return {async init() {}, saveSoon() {}, decorate() {}, haptic() {}, async flush() { flushes++; }};
    }}
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox), run = code => vm.runInContext(code, context);
  for (const name of ['platform-catalog', 'lobby-preferences', 'game-load-guard', 'platform-wallet', 'platform-view', 'platform-bridge', 'platform']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', name + '.js'), 'utf8'), context, {filename: name + '.js'});
  }
  return {
    run, element, navigation, history, location,
    get renders() { return renders; }, get scrolls() { return scrolls; }, get flushes() { return flushes; },
    ready: () => context.playroomMobileReady,
    click(attrs) { documentListeners.click({target: new Element('', attrs)}); },
    flushEvents() { while (events.length) events.shift()(); },
    message(data) { windowListeners.message({origin: location.origin, source: element('game-frame').contentWindow, data}); },
    nativeBack: () => nativeCallbacks.onBack()
  };
}

test('page buttons replace content once, preserve same-page actions and keep browser back/forward working', () => {
  const env = environment();
  assert.equal(env.renders, 1);
  for (const page of ['rewards', 'me', 'me']) {
    const before = env.renders, scrolls = env.scrolls;
    env.click({'data-page': page}); env.flushEvents();
    assert.equal(env.renders, before + 1, 'one DOM replacement per button click, including the queued hash event');
    assert.equal(env.scrolls, scrolls + 1);
    assert.equal(env.element('content').getAttribute('data-page'), page);
    assert.equal(env.navigation.find(button => button.dataset.page === page).getAttribute('aria-current'), 'page');
  }
  assert.equal(env.history.length, 3, 'clicking the current page does not add a duplicate history entry');
  for (const [direction, page] of [['back', 'rewards'], ['back', 'games'], ['forward', 'rewards'], ['forward', 'me']]) {
    const before = env.renders;
    env.history[direction](); env.flushEvents();
    assert.equal(env.element('content').getAttribute('data-page'), page);
    assert.equal(env.renders, before + 1);
  }
});

test('collection navigation applies its filter on both a different page and the already open lobby', () => {
  const env = environment({hash: '#me'});
  env.run("preferences.toggle('dice')");
  for (let i = 0; i < 2; i++) {
    env.run("filter = '全部'");
    const before = env.renders;
    env.click({'data-collection': ''}); env.flushEvents();
    assert.equal(env.renders, before + 1);
    assert.equal(env.element('content').getAttribute('data-page'), 'games');
    const cards = [...env.element('content').innerHTML.matchAll(/<article class="game-card" data-play="([^"]+)">/g)].map(match => match[1]);
    assert.deepEqual(cards, ['dice'], 'the same-page shortcut must still rebuild the filtered collection');
  }
});

test('game return renders the lobby once whether its hash changes or already names games', () => {
  for (const hash of ['#rewards', '#games']) {
    const env = environment({hash});
    env.run("play('minesweeper')"); env.message({type: 'mines-ready'});
    env.message({type: 'mines-start', roundId: ''});
    assert.equal(env.run('wallet.points'), 950);
    const before = env.renders;
    env.message({type: 'game-return'}); env.flushEvents();
    assert.equal(env.renders, before + 1);
    assert.equal(env.location.hash, '#games');
    assert.equal(env.element('play-surface').hidden, true);
    assert.equal(env.element('platform').hidden, false);
    assert.equal(env.run('bridge.rounds.minesweeper.state'), 'playing');
    assert.equal(env.run('wallet.points'), 950, 'navigation keeps the charged round intact');
  }
});

test('native back uses the same single-render navigation and still flushes before leaving a game', async () => {
  const env = environment({native: true, hash: '#rewards'}); await env.ready();
  let before = env.renders;
  assert.equal(await env.nativeBack(), true); env.flushEvents();
  assert.equal(env.renders, before + 1);
  assert.equal(env.element('content').getAttribute('data-page'), 'games');
  env.run("play('minesweeper')"); before = env.renders;
  assert.equal(await env.nativeBack(), true); env.flushEvents();
  assert.equal(env.renders, before + 1);
  assert.equal(env.flushes, 1);
  assert.equal(await env.nativeBack(), false, 'back at the lobby can minimize the native app');
  assert.equal(env.flushes, 2);
});

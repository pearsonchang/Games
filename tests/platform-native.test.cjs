'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const KEY = 'playroom.mobile-session.v1';
const files = ['i18n', 'dice-rules', 'fairness-core', 'mines-engine', 'rocket-engine', 'dice-engine', 'plinko-engine', 'horse-engine', 'slots-engine', 'matrix-engine', 'blocks-engine', '2048-engine', 'platform-catalog', 'lobby-preferences', 'game-load-guard', 'platform-wallet', 'platform-view', 'platform-bridge', 'platform-session', 'data-client', 'native-runtime', 'native-session-store', 'platform-native', 'platform'];
const sources = files.map(name => [name, fs.readFileSync(path.join(__dirname, '../src', `${name}.js`), 'utf8')]);
const plain = value => JSON.parse(JSON.stringify(value));

// The production coordinator, store, runtime, wallet and all engines run in one
// browser-like realm. Only DOM layout and the Capacitor plugin boundary are faked.
function environment({saved = null, deferredRead = false, readFailure = false, writeFailure = false, browserStorageFailure = false, now = 100000} = {}) {
  const elements = new Map(), windowListeners = new Map(), documentListeners = new Map(), nativeListeners = new Map();
  const intervals = [], timers = new Map(), writes = [], reads = [], native = new Map(), local = new Map();
  const fault = {read: readFailure, write: writeFailure, browser: browserStorageFailure}, clock = {value: now};
  let timerId = 0, releaseRead;
  const readBarrier = deferredRead ? new Promise(resolve => { releaseRead = resolve; }) : Promise.resolve();
  if (saved !== null) native.set(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  const add = (map, name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); };
  const emit = (map, name, value) => Promise.all([...(map.get(name) || [])].map(fn => fn(value)));
  class Element {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.hidden = false; this.children = []; this.attrs = {}; this.dataset = {}; this.textContent = ''; this._html = ''; this.parentNode = null;
      this.classList = {add() {}, remove() {}, contains() { return false; }};
      this.contentWindow = {messages: [], postMessage(data, origin) { this.messages.push({data: plain(data), origin}); }};
      this.contentDocument = {querySelectorAll: () => []};
    }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html; }
    append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
    prepend(...children) { for (const child of children) child.parentNode = this; this.children.unshift(...children); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
    removeAttribute(key) { delete this.attrs[key]; }
    closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : null; }
    focus() {}
    close() { this.open = false; }
    showModal() { this.open = true; }
    addEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
  }
  function element(id) {
    if (!elements.has(id)) elements.set(id, new Element(id.includes('frame') ? 'iframe' : 'div', id));
    return elements.get(id);
  }
  const document = {
    hidden: false, readyState: 'loading', body: new Element('body'), documentElement: new Element('html'),
    getElementById: element, createElement: tag => new Element(tag),
    querySelectorAll(selector) {
      if (selector === 'iframe') return [...elements.values()].filter(el => el.tagName === 'IFRAME');
      if (selector.startsWith('iframe:')) return [...elements.values()].filter(el => el.tagName === 'IFRAME' && !el.hidden);
      if (selector === 'dialog[open]') return [...elements.values()].filter(el => el.open);
      return [];
    },
    querySelector: () => null,
    addEventListener: (name, fn) => add(documentListeners, name, fn),
    removeEventListener: (name, fn) => documentListeners.get(name)?.delete(fn),
    dispatchEvent: event => { void emit(documentListeners, event.type, event); }
  };
  const Preferences = {
    async get({key}) { reads.push(key); await readBarrier; if (fault.read) throw Error('read failed'); return {value: native.get(key) ?? null}; },
    async set({key, value}) { writes.push({key, value}); if (fault.write) throw Error('write failed'); native.set(key, value); },
    async remove({key}) { native.delete(key); }
  };
  const device = {
    isNative: true, platform: 'android', Preferences,
    App: {async addListener(name, fn) { add(nativeListeners, name, fn); return {async remove() { nativeListeners.get(name)?.delete(fn); }}; }, async minimizeApp() {}},
    Haptics: {async selectionChanged() {}, async notification() {}, async impact() {}}, Browser: {async open() {}}
  };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.value])); } static now() { return clock.value; } }
  const sandbox = {
    document, location: {origin: 'https://localhost', href: 'https://localhost/index.html', hash: ''}, PlayroomDevice: device,
    crypto: webcrypto, TextEncoder, URL, CustomEvent: class { constructor(type, detail) { this.type = type; Object.assign(this, detail); } },
    localStorage: {getItem(key) { if (fault.browser) throw Error('web storage denied'); return local.get(key) ?? null; }, setItem(key, value) { if (fault.browser) throw Error('web storage denied'); local.set(key, String(value)); }, removeItem(key) { local.delete(key); }},
    addEventListener: (name, fn) => add(windowListeners, name, fn), removeEventListener: (name, fn) => windowListeners.get(name)?.delete(fn),
    setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {},
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, delay}); return id; }, clearTimeout(id) { timers.delete(id); },
    queueMicrotask, Date: ClockDate, console, scrollTo() {}
  };
  sandbox.window = sandbox; sandbox.parent = sandbox;
  const context = vm.createContext(sandbox), run = code => vm.runInContext(code, context);
  for (const [name, source] of sources) vm.runInContext(source, context, {filename: `src/${name}.js`});
  const frame = id => element(id === 'minesweeper' ? 'game-frame' : `${id}-frame`);
  return {
    context, run, element, document, frame, reads, writes, native, local, fault, clock, intervals,
    releaseRead: () => releaseRead?.(),
    ready: () => context.playroomMobileReady,
    flush: () => run('mobileSession.flush()'),
    saved: () => JSON.parse(native.get(KEY)),
    async message(id, data) { await emit(windowListeners, 'message', {origin: sandbox.location.origin, source: frame(id).contentWindow, data}); },
    async play(id) { run(`play(${JSON.stringify(id)})`); await this.message(id, {type: `${id === 'minesweeper' ? 'mines' : id}-ready`}); },
    async action(id, data) { await this.message(id, {roundId: run(`bridge.rounds[${JSON.stringify(id)}].id`), ...data}); },
    async nativeEvent(name, value) { await emit(nativeListeners, name, value); },
    async windowEvent(name, value) { await emit(windowListeners, name, value); },
    async favorite(id) { const button = new Element('button'); button.setAttribute('data-favorite', id); await emit(documentListeners, 'click', {target: button}); }
  };
}

async function populatedSave() {
  const env = environment(); await env.ready();
  assert.equal(await env.flush(), true, 'fresh native boot must persist a valid session');
  await env.play('minesweeper'); await env.action('minesweeper', {type: 'mines-start'});
  await env.play('slots'); env.run('bridge.rounds.slots.random = () => .5'); await env.action('slots', {type: 'slots-spin'});
  await env.favorite('minesweeper'); await env.favorite('2048');
  env.context.localStorage.setItem('playroom.blocks.sound.v1', 'off');
  env.context.localStorage.setItem('playroom.2048.controls', 'swipe');
  env.context.PlayroomI18n.setLanguage('en');
  env.run("showPage('me')");
  const panel = env.element('content').children.find(child => child.className === 'native-settings');
  panel.children[1].onclick();
  assert.equal(await env.flush(), true);
  return env;
}

test('native boot blocks game actions until full restore, then resumes the saved board and settles an overdue hidden game', async () => {
  const first = await populatedSave(), saved = first.saved();
  assert.equal(saved.session.wallet.cents, 90000);
  assert.equal(Object.keys(saved.session.bridge.rounds).length, 9);
  const second = environment({saved, deferredRead: true, now: 105000});
  second.run("play('minesweeper')");
  await second.action('minesweeper', {type: 'mines-start'});
  assert.equal(second.run('session.loadedGames.size'), 0);
  assert.equal(second.run('wallet.points'), 1000);
  assert.ok(second.document.body.children.some(child => child.className === 'native-boot'));
  assert.equal(second.writes.length, 0);
  second.releaseRead(); await second.ready();
  assert.equal(second.run('mobileBooting'), false);
  assert.equal(second.run('session.loadedGames.size'), 0);
  assert.equal(second.run('bridge.rounds.minesweeper.state'), 'playing');
  assert.deepEqual(plain(second.run('bridge.rounds.minesweeper.board')), saved.session.bridge.rounds.minesweeper.board);
  assert.equal(second.run('bridge.rounds.slots.state'), 'finished');
  assert.equal(second.run('session.rounds.length'), 1);
  assert.equal(second.run('wallet.points'), 1250);
  assert.equal(second.document.body.children.some(child => child.className === 'native-boot'), false);
  await second.play('minesweeper');
  const safe = second.run('bridge.rounds.minesweeper.board.findIndex(cell => !cell.mine)');
  await second.action('minesweeper', {type: 'mines-reveal', index: safe});
  assert.equal(second.run('bridge.rounds.minesweeper.opened'), 1);
  assert.equal(second.run('wallet.points'), 1250, 'reopening and playing the saved round has no second charge');
  await second.action('minesweeper', {type: 'mines-collect'});
  assert.equal(second.run('session.rounds.length'), 2);
  assert.equal(await second.flush(), true);
  assert.equal(second.saved().session.wallet.cents, 130952);
});

test('native JSON checkpoint includes language, haptics, favorites, recent games and same-origin game settings', async () => {
  const first = await populatedSave(), saved = first.saved();
  assert.deepEqual(saved.ui, {language: 'en', haptics: false, settings: {'playroom.blocks.sound.v1': 'off', 'playroom.2048.controls': 'swipe'}, favorites: ['minesweeper', '2048'], recent: ['slots', 'minesweeper'], explored: ['minesweeper', 'slots']});
  assert.deepEqual(first.reads, [KEY]);
  assert.ok(first.writes.every(write => write.key === KEY));
  const second = environment({saved}); await second.ready(); await second.flush();
  assert.equal(second.context.PlayroomI18n.language, 'en');
  assert.deepEqual(plain(second.run('preferences.favorites')), ['minesweeper', '2048']);
  assert.deepEqual(plain(second.run('preferences.recent')), ['slots', 'minesweeper']);
  assert.equal(second.context.localStorage.getItem('playroom.blocks.sound.v1'), 'off');
  assert.deepEqual(second.saved().ui, saved.ui);
  second.context.localStorage.setItem('playroom.2048.sound', 'off');
  await second.windowEvent('storage', {key: 'playroom.2048.sound'}); await second.flush();
  assert.equal(second.saved().ui.settings['playroom.2048.sound'], 'off');
  second.context.PlayroomI18n.setLanguage('zh-CN'); await second.flush();
  assert.equal(second.saved().ui.language, 'zh-CN');
});

test('real native inactive/active listener pauses frames and resumes overdue settlement once without animation-tick storage writes', async () => {
  const env = environment(); await env.ready(); await env.flush();
  await env.play('rocket'); env.run('bridge.rounds.rocket.random = () => .01');
  await env.action('rocket', {type: 'rocket-launch'}); await env.flush();
  assert.equal(env.run('wallet.points'), 950);
  const beforeAnimation = env.writes.length;
  for (let i = 0; i < 10; i++) { env.clock.value += 100; env.intervals.forEach(fn => fn()); }
  await Promise.resolve(); await Promise.resolve();
  assert.equal(env.writes.length, beforeAnimation);
  await env.nativeEvent('appStateChange', {isActive: false}); await env.flush();
  assert.equal(env.document.hidden, false, 'native app events work even when DOM visibility has not changed');
  assert.equal(env.frame('rocket').contentWindow.messages.filter(m => m.data.type === 'platform-pause').at(-1).data.paused, true);
  env.clock.value += 120000; env.intervals.forEach(fn => fn());
  assert.equal(env.run('bridge.rounds.rocket.state'), 'flying');
  await env.nativeEvent('appStateChange', {isActive: true}); await env.flush();
  assert.equal(env.run('bridge.rounds.rocket.state'), 'collected');
  assert.equal(env.run('bridge.rounds.rocket.autoCollected'), true);
  assert.equal(env.run('wallet.points'), 1450);
  assert.equal(env.run('session.rounds.length'), 1);
  const after = env.writes.length;
  await env.nativeEvent('appStateChange', {isActive: true}); env.intervals.forEach(fn => fn());
  await env.flush();
  assert.equal(env.run('wallet.points'), 1450);
  assert.equal(env.writes.length, after);
  assert.equal(env.saved().session.bridge.rounds.rocket.state, 'collected');
});

for (const failure of ['unavailable', 'invalid']) test(`native ${failure} save leaves the original bytes untouched while allowing temporary play`, async () => {
  const original = JSON.stringify({version: 99, original: 'preserve me'});
  const env = environment({saved: original, readFailure: failure === 'unavailable'}); await env.ready();
  assert.equal(env.run('mobileSession.status'), failure);
  assert.equal(env.run('mobileBooting'), false);
  const notice = env.element('content').children.find(child => child.className === 'native-notice');
  assert.match(notice.textContent, /临时试玩/);
  await env.play('2048'); await env.action('2048', {type: '2048-start'});
  assert.equal(env.run("bridge.rounds['2048'].state"), 'playing');
  assert.equal(env.run('wallet.points'), 950);
  assert.equal(await env.flush(), false);
  assert.equal(env.writes.length, 0);
  assert.equal(env.native.get(KEY), original);
});

test('native write failure keeps the current game playable and an explicit retry saves its latest state', async () => {
  const env = environment({writeFailure: true}); await env.ready(); await env.flush();
  assert.equal(env.run('mobileSession.status'), 'error');
  await env.play('blocks'); await env.action('blocks', {type: 'blocks-start'});
  await env.action('blocks', {type: 'blocks-place', slot: 0, row: 0, col: 0, revision: 0});
  assert.equal(env.run('wallet.points'), 950);
  assert.equal(env.run('bridge.rounds.blocks.moves'), 1);
  assert.equal(await env.flush(), false);
  assert.equal(env.native.has(KEY), false);
  env.fault.write = false;
  assert.equal(await env.flush(), true);
  assert.equal(env.saved().session.bridge.rounds.blocks.moves, 1);
  assert.equal(env.saved().session.wallet.cents, 95000);
});

test('restored native settings survive denied Web Storage without being overwritten by an empty next checkpoint', async () => {
  const first = await populatedSave(), saved = first.saved();
  const env = environment({saved, browserStorageFailure: true}); await env.ready();
  assert.equal(await env.flush(), true);
  assert.equal(env.context.PlayroomI18n.language, 'en');
  assert.deepEqual(env.saved().ui.settings, saved.ui.settings);
  assert.deepEqual(env.saved().ui.favorites, saved.ui.favorites);
});

test('native restore repopulates the independent verifier receipt store after Web Storage was cleared', async () => {
  const first = environment(); await first.ready();
  await first.play('dice'); await first.action('dice', {type: 'dice-roll', mode: 'size', target: 'small'});
  await first.run('bridge.rounds.dice.preparation');
  first.clock.value += 2000; first.intervals.forEach(fn => fn()); await first.flush();
  const saved = first.saved(), receipts = saved.session.bridge.diceProvider.history;
  assert.equal(receipts.length, 1);
  const second = environment({saved, now: first.clock.value});
  assert.equal(second.local.has('playroom.fairness.dice.v1'), false);
  await second.ready(); await second.flush();
  assert.deepEqual(JSON.parse(second.context.localStorage.getItem('playroom.fairness.dice.v1')), receipts);
  assert.equal((await second.run('Fairness.verify(diceFairness.history[0])')).ok, true);
  assert.equal(second.run('session.rounds.length'), 1, 'mirroring an existing receipt never settles it again');
  const denied = environment({saved, browserStorageFailure: true}); await denied.ready();
  assert.equal(await denied.flush(), true, 'an optional verifier mirror failure must not reject native restoration');
  assert.deepEqual(denied.saved().session.bridge.diceProvider.history, receipts);
  assert.equal(denied.run('wallet.points'), second.run('wallet.points'));
});

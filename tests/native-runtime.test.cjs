'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/native-runtime.js'), 'utf8');

function environment({native = true, platform = 'android', deferred = false} = {}) {
  const listeners = new Map(), nativeListeners = new Map(), pending = [], calls = [], errors = [], classes = new Set();
  const document = {
    dialogs:[], frames:[], documentElement:{classList:{add:name => classes.add(name)}},
    querySelectorAll(selector) { return selector === 'dialog[open]' ? this.dialogs.filter(dialog => dialog.open) : selector.startsWith('iframe') ? this.frames.filter(frame => !frame.hidden) : []; },
    addEventListener(type, callback) { listeners.set(type, new Set([...(listeners.get(type) || []), callback])); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); }
  };
  const device = {
    isNative:native, platform,
    App:{
      addListener(name, callback) {
        const register = () => {
          nativeListeners.set(name, new Set([...(nativeListeners.get(name) || []), callback]));
          return {remove:async () => { nativeListeners.get(name)?.delete(callback); calls.push(['remove', name]); }};
        };
        return deferred ? new Promise(resolve => pending.push(() => resolve(register()))) : Promise.resolve(register());
      },
      minimizeApp:async () => { calls.push(['minimize']); }
    },
    Haptics:{selectionChanged:async () => calls.push(['selection']), notification:async value => calls.push(['notification', value]), impact:async value => calls.push(['impact', value])},
    Browser:{open:async value => calls.push(['browser', value])}
  };
  const window = {location:{origin:'https://app.example.test', href:'https://app.example.test/index.html'}};
  vm.runInNewContext(source, {window, URL});
  let now = 1000;
  const runtime = window.PlayroomNative.createRuntime({device, document, now:() => now, onError:error => errors.push(error)});
  return {
    runtime, window, document, device, calls, errors, classes, listeners, nativeListeners, pending,
    advance(ms) { now += ms; },
    async emit(name, value) { await Promise.all([...(nativeListeners.get(name) || [])].map(callback => callback(value))); },
    async click(href, target = '') {
      const anchor = {href, target}; let prevented = false;
      const event = {target:{closest:() => anchor}, defaultPrevented:false, preventDefault() { prevented = true; }};
      for (const callback of listeners.get('click') || []) callback(event);
      await Promise.resolve(); await Promise.resolve(); return prevented;
    }
  };
}
function dialog() { return {open:true, closed:0, close() { this.open = false; this.closed++; }}; }
function frame(panel, hiddenAncestor = false) {
  return {hidden:false, contentDocument:{querySelectorAll:() => panel.open ? [panel] : []}, closest:selector => selector === '[hidden]' && hiddenAncestor ? {} : null, getClientRects:() => hiddenAncestor ? [] : [{}]};
}

test('web mode does not register native listeners or call native effects', async () => {
  const env = environment({native:false}); await env.runtime.start();
  assert.equal(env.runtime.native, false); assert.equal(env.nativeListeners.size, 0); assert.equal(env.listeners.size, 0);
  assert.equal(await env.runtime.haptic(), false); assert.deepEqual(env.calls, []);
});

test('native active-state changes deduplicate and haptics respect throttling, backgrounding and preference', async () => {
  const env = environment(), states = []; await env.runtime.start({onActiveChange:active => states.push(active)});
  assert.equal(env.classes.has('native-app'), true);
  assert.equal(await env.runtime.haptic('selection'), true); assert.equal(await env.runtime.haptic('success'), false);
  env.advance(90); assert.equal(await env.runtime.haptic('success'), true);
  await env.emit('appStateChange', {isActive:false}); await env.emit('appStateChange', {isActive:false});
  env.advance(100); assert.equal(await env.runtime.haptic('impact'), false); assert.equal(env.runtime.active, false);
  await env.emit('appStateChange', {isActive:true}); env.runtime.setHaptics(false); assert.equal(await env.runtime.haptic(), false);
  env.runtime.setHaptics(true); assert.equal(await env.runtime.haptic('impact'), true); assert.equal(await env.runtime.haptic('unrecognized'), false);
  assert.deepEqual(states, [false, true]); assert.equal(env.calls.filter(([name]) => ['selection', 'notification', 'impact'].includes(name)).length, 3);
  await env.runtime.dispose();
});

test('Android back closes the top dialog, then delegates navigation, then minimizes', async () => {
  const env = environment(), first = dialog(), last = dialog(); let handled = true, backs = 0;
  env.document.dialogs = [first, last]; await env.runtime.start({onBack:() => { backs++; return handled; }});
  await env.emit('backButton'); assert.equal(last.closed, 1); assert.equal(first.closed, 0); assert.equal(backs, 0);
  await env.emit('backButton'); assert.equal(first.closed, 1); assert.equal(backs, 0);
  await env.emit('backButton'); assert.equal(backs, 1); assert.equal(env.calls.some(([name]) => name === 'minimize'), false);
  handled = false; await env.emit('backButton'); assert.equal(env.calls.filter(([name]) => name === 'minimize').length, 1);
  await env.runtime.dispose();
});

test('back handling closes visible same-origin frame dialogs and skips foreign documents', async () => {
  const env = environment(), panel = dialog();
  const foreign = {hidden:false, closest:() => null, getClientRects:() => [{}]}; Object.defineProperty(foreign, 'contentDocument', {get() { throw Error('cross-origin'); }});
  env.document.frames = [foreign, frame(panel)]; await env.runtime.start(); await env.emit('backButton');
  assert.equal(panel.closed, 1); assert.equal(env.calls.some(([name]) => name === 'minimize'), false); await env.runtime.dispose();
});

test('hidden game-container dialogs do not swallow back from the lobby', async () => {
  const env = environment(), hiddenPanel = dialog(); let backs = 0;
  env.document.frames = [frame(hiddenPanel, true)]; await env.runtime.start({onBack:() => { backs++; return true; }});
  await env.emit('backButton'); assert.equal(hiddenPanel.closed, 0); assert.equal(backs, 1); await env.runtime.dispose();
});

test('repeated Android back while navigation is pending only performs one transition', async () => {
  const env = environment(); let resolveBack, backs = 0;
  await env.runtime.start({onBack:() => { backs++; return new Promise(resolve => { resolveBack = resolve; }); }});
  const first = env.emit('backButton'); await env.emit('backButton'); assert.equal(backs, 1);
  resolveBack(true); await first; assert.equal(env.calls.some(([name]) => name === 'minimize'), false); await env.runtime.dispose();
});

test('native navigation opens external HTTPS in Browser and flushes before same-origin new-window navigation', async () => {
  const env = environment(), sequence = []; await env.runtime.start({onNavigate:async () => { sequence.push('flush'); }});
  assert.equal(await env.click('https://docs.example.test/guide'), true);
  assert.equal(env.calls.at(-1)[0], 'browser'); assert.equal(env.calls.at(-1)[1].url, 'https://docs.example.test/guide');
  assert.equal(await env.click('https://app.example.test/fairness', '_blank'), true);
  assert.deepEqual(sequence, ['flush']); assert.equal(env.window.location.href, 'https://app.example.test/fairness');
  assert.equal(await env.click('https://app.example.test/#games'), false); await env.runtime.dispose();
});

test('iOS custom-scheme navigation flushes local links without trusting other opaque origins', async () => {
  const env = environment({platform:'ios'}); let saves = 0;
  env.window.location = {origin:'capacitor://localhost', href:'capacitor://localhost/index.html'};
  await env.runtime.start({onNavigate:async () => { saves++; }});
  assert.equal(await env.click('capacitor://localhost/fairness.html', '_blank'), true);
  assert.equal(saves, 1); assert.equal(env.window.location.href, 'capacitor://localhost/fairness.html');
  assert.equal(await env.click('capacitor://other/fairness.html', '_blank'), false);
  assert.equal(saves, 1);
  assert.equal(await env.click('https://docs.example.test/guide'), true);
  assert.equal(env.calls.at(-1)[0], 'browser');
  await env.runtime.dispose();
});

test('dispose removes regular listeners and pending startup cannot reinstall listeners afterward', async () => {
  const normal = environment(); await normal.runtime.start(); await normal.runtime.dispose();
  assert.equal(normal.listeners.get('click').size, 0); assert.equal(normal.nativeListeners.get('backButton').size, 0);
  const pending = environment({deferred:true}); const started = pending.runtime.start(); await pending.runtime.dispose();
  pending.pending.splice(0).forEach(resolve => resolve()); await started;
  assert.equal(pending.nativeListeners.get('backButton').size, 0);
  assert.equal(pending.listeners.get('click')?.size || 0, 0, 'disposed startup must not add a late click listener');
});

test('restart during delayed startup keeps only the newest listener generation', async () => {
  const env = environment({deferred:true}); const oldStart = env.runtime.start(); await env.runtime.dispose(); const newStart = env.runtime.start();
  env.pending.splice(0).forEach(resolve => resolve()); await Promise.all([oldStart, newStart]);
  assert.equal(env.nativeListeners.get('backButton').size, 1); assert.equal(env.nativeListeners.get('appStateChange').size, 1);
  assert.equal(env.listeners.get('click').size, 1); await env.runtime.dispose();
});

test('disposing while back navigation is pending prevents a stale minimize call', async () => {
  const env = environment(); let resolveBack;
  await env.runtime.start({onBack:() => new Promise(resolve => { resolveBack = resolve; })});
  const pendingBack = env.emit('backButton'); await env.runtime.dispose(); resolveBack(false); await pendingBack;
  assert.equal(env.calls.some(([name]) => name === 'minimize'), false);
});

test('a failed checkpoint cancels local new-window navigation and preserves the live session', async () => {
  const env = environment();
  await env.runtime.start({onNavigate:async () => false});
  assert.equal(await env.click('https://app.example.test/fairness', '_blank'), true);
  assert.equal(env.window.location.href, 'https://app.example.test/index.html');
  await env.runtime.dispose();
});

test('disposing while a navigation checkpoint is pending prevents a stale page navigation', async () => {
  const env = environment(); let resolveNavigation;
  await env.runtime.start({onNavigate:() => new Promise(resolve => { resolveNavigation = resolve; })});
  await env.click('https://app.example.test/fairness', '_blank'); await env.runtime.dispose(); resolveNavigation();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(env.window.location.href, 'https://app.example.test/index.html');
});

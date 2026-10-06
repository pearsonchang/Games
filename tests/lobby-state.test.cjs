const {test} = require('node:test');
const assert = require('node:assert/strict');
const {LobbyPreferences} = require('../src/lobby-preferences.js');
const {GameLoadGuard} = require('../src/game-load-guard.js');

test('lobby preferences persist only allowed IDs, deduplicate recents and survive invalid storage', () => {
  let saved = JSON.stringify({favorites:['dice','dice','<script>','unknown'],recent:['rocket','dice','horse','matrix'],explored:['dice'],points:99999});
  const storage = {getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
  const ids = ['dice','rocket','horse','matrix'];
  const prefs = new LobbyPreferences(ids, storage);
  assert.deepEqual(prefs.favorites, ['dice']);
  assert.deepEqual(prefs.recent, ['rocket','dice','horse']);
  prefs.visit('matrix'); prefs.visit('dice'); prefs.visit('unknown');
  assert.deepEqual(prefs.recent, ['dice','matrix','rocket']);
  assert.deepEqual(prefs.explored, ['dice','matrix']);
  prefs.toggle('horse'); prefs.toggle('dice');
  const restored = new LobbyPreferences(ids, storage);
  assert.deepEqual(restored.favorites, ['horse']);
  assert.deepEqual(restored.recent, prefs.recent);
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), ['explored','favorites','recent']);
  saved = '{broken'; assert.deepEqual(new LobbyPreferences(ids, storage).recent, []);
  saved = 'null'; assert.deepEqual(new LobbyPreferences(ids, storage).favorites, []);
  const denied = new LobbyPreferences(ids, {getItem(){throw Error('denied');},setItem(){throw Error('quota');}});
  denied.visit('dice'); assert.equal(denied.toggle('dice'), true);
  assert.deepEqual(denied.recent, ['dice']); assert.equal(denied.persistent, false);
});

test('game readiness cancels loading timeouts, late frames cannot dismiss another game, and retries await a fresh ready signal', () => {
  const timers = new Map(), events = []; let counter = 0;
  const guard = new GameLoadGuard({change:(...args)=>events.push(args),schedule:fn=>{timers.set(++counter,fn);return counter;},cancel:id=>timers.delete(id)});
  const expire = () => { const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn()); };
  guard.open('matrix'); assert.deepEqual(events.at(-1), ['loading','matrix']);
  expire(); assert.deepEqual(events.at(-1), ['failed','matrix']);
  guard.ready('matrix'); assert.deepEqual(events.at(-1), ['ready','matrix']);
  guard.open('matrix'); assert.equal(timers.size, 0);
  guard.open('matrix',true); assert.deepEqual(events.at(-1), ['loading','matrix']);
  assert.equal(timers.size, 1);
  guard.open('dice'); guard.ready('matrix');
  assert.deepEqual(events.at(-1), ['loading','dice']);
  guard.ready('dice'); assert.equal(timers.size, 0);
  guard.open('horse');guard.leave();expire();
  assert.equal(timers.size, 0);assert.deepEqual(events.at(-1), ['loading','horse']);
});

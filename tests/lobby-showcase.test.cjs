const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {ShowcaseRotation} = require('../src/lobby-showcase.js');

test('default browser timers retain their native receiver rather than the rotation instance', () => {
  let scheduled = 0, cancelled = 0;
  const context = vm.createContext({
    setTimeout: function() { assert.notEqual(this?.constructor?.name,'ShowcaseRotation'); scheduled++; return 1; },
    clearTimeout: function() { assert.notEqual(this?.constructor?.name,'ShowcaseRotation'); cancelled++; }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/lobby-showcase.js'),'utf8'),context);
  vm.runInContext('const rotation = new ShowcaseRotation({advance:()=>{},canRun:()=>true}); rotation.start(); rotation.destroy();',context);
  assert.equal(scheduled,1); assert.equal(cancelled,1);
});

test('showcase owns one timer and cannot advance while hidden or after leaving the lobby', () => {
  const timers = new Map();
  let serial = 0, allowed = true, advances = 0;
  const rotation = new ShowcaseRotation({
    advance: () => advances++, canRun: () => allowed,
    schedule: (fn,delay) => { assert.equal(delay,6500); timers.set(++serial,fn); return serial; },
    cancel: id => timers.delete(id)
  });
  const fire = () => { const [id,fn] = timers.entries().next().value; timers.delete(id); fn(); };
  rotation.start(); rotation.start();
  assert.equal(timers.size,1);
  fire(); assert.equal(advances,1); assert.equal(timers.size,1);
  allowed = false; fire();
  assert.equal(advances,1); assert.equal(timers.size,0);
  rotation.start(); assert.equal(timers.size,0);
  allowed = true; rotation.start();
  const stale = [...timers.values()][0];
  rotation.destroy(); rotation.start(); stale();
  assert.equal(timers.size,0); assert.equal(advances,1);
});

test('showcase includes every playable game with its own entry and keeps the current slide on rerender', () => {
  const context = vm.createContext({
    window: {LobbyShowcase: {currentId:'horse'}}, conceptKey:'test',
    matchMedia: () => ({matches:false}),
    lobbyGlyph: () => '', favoriteButton: () => '',
    lobbyFilters:['全部','收藏'], renderRecent: () => ''
  });
  for (const file of ['platform-catalog.js','lobby-festival.js']) vm.runInContext(fs.readFileSync(require.resolve(`../src/${file}`),'utf8'),context);
  const html = vm.runInContext("renderFestivalLobby({filter:'全部',preferences:{favorites:[],persistent:true}})",context);
  const games = vm.runInContext('catalog.filter(game => game.available)',context);
  assert.equal((html.match(/data-featured=/g) || []).length,games.length);
  for (const game of games) {
    assert.ok(html.includes(`data-featured="${game.id}"`),game.id);
    assert.ok(html.includes(`data-play="${game.id}" aria-label="进入${game.name}"`),game.id);
    assert.ok(html.includes(`aria-label="查看${game.name}"`),game.id);
  }
  assert.ok(!html.includes('data-featured="memory"'));
  const slides = html.match(/<article class="energy-hero[^>]+>/g);
  assert.equal(slides.filter(slide => !slide.includes(' inert')).length,1);
  assert.ok(slides.find(slide => slide.includes('data-featured="horse"')).includes('aria-hidden="false"'));
  const favorites = vm.runInContext("renderFestivalLobby({filter:'收藏',preferences:{favorites:[],persistent:true}})",context);
  assert.ok(!favorites.includes('data-lobby-showcase'));
});

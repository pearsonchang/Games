'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {DataClientError, createLocalStore, createIdempotencyKey, createMemoryTokenProvider, HttpGameRepository, createGameRepository, REPOSITORY_METHODS} = require('../src/data-client.js');
const KEY = 'cf025f08-b96c-419d-b896-a398bd1914b2';
const ROUND = 'f1172e80-ebcf-4ce4-9ac0-c7f343453e93';
const wallet = {revision:2, balanceMinor:95000, currency:'DEMO_POINTS'};
const round = (gameId = '2048') => ({id:ROUND, gameId, revision:1, state:'playing', snapshot:{moves:0}});
const reply = (data, status = 200) => new Response(JSON.stringify({data}), {status, headers:{'Content-Type':'application/json', 'X-Request-Id':'request-1'}});
const command = {idempotencyKey:KEY, expectedRevision:1};
const code = expected => error => error instanceof DataClientError && error.code === expected;
function storage() {
  const entries = new Map();
  return {entries, getItem:key => entries.get(key) ?? null, setItem:(key, value) => entries.set(key, value), removeItem:key => entries.delete(key)};
}
function repository(fetch, options = {}) { return new HttpGameRepository({baseURL:'https://api.example.test/v1', tokenProvider:async () => 'test-token', fetch, ...options}); }

test('browser JSON store namespaces data, returns copies, and removes only its own key', async () => {
  const backing = storage(), store = createLocalStore({storage:backing, namespace:'test.'});
  assert.equal(store.mode, 'local'); assert.equal(store.backend, 'browser-storage'); assert.equal(await store.get('session.v1'), null);
  const snapshot = {score:0, active:true, rounds:[]}; await store.set('session.v1', snapshot); snapshot.score = 999;
  assert.equal((await store.get('session.v1')).score, 0); assert.ok(backing.entries.has('test.session.v1'));
  backing.setItem('unrelated', 'keep'); await store.remove('session.v1'); assert.equal(await store.get('session.v1'), null);
  assert.equal(backing.getItem('unrelated'), 'keep');
  await assert.rejects(store.set('../escape', {}), code('INVALID_INPUT'));
  for (const value of [undefined, NaN, Infinity, {bad:undefined}, {bad:()=>1}, new Date()]) await assert.rejects(store.set('bad', value), code('INVALID_INPUT'));
  const cyclic = {}; cyclic.self = cyclic; await assert.rejects(store.set('bad', cyclic), code('INVALID_INPUT'));
});

test('storage corruption, quota and permission failures are observable and never silently succeed', async () => {
  const backing = storage(), store = createLocalStore({storage:backing}); backing.setItem('playroom.session', '{broken');
  await assert.rejects(store.get('session'), code('STORAGE_CORRUPT'));
  backing.setItem('playroom.session', '1e400'); await assert.rejects(store.get('session'), code('STORAGE_CORRUPT'));
  backing.setItem = () => { throw Error('quota'); }; backing.removeItem = () => { throw Error('denied'); };
  await assert.rejects(store.set('session', {}), code('STORAGE_WRITE_FAILED'));
  await assert.rejects(store.remove('session'), code('STORAGE_REMOVE_FAILED'));
  backing.getItem = () => { throw Error('denied'); }; await assert.rejects(store.get('session'), code('STORAGE_READ_FAILED'));
  const unavailable = createLocalStore({storage:null}); assert.equal(unavailable.backend, 'unavailable');
  await assert.rejects(unavailable.set('session', {}), code('STORAGE_UNAVAILABLE'));
  const window = {}; Object.defineProperty(window, 'localStorage', {get() { throw Error('denied'); }});
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/data-client.js'), 'utf8'), {window});
  const denied = window.PlayroomData.createLocalStore(); await assert.rejects(denied.get('session'), error => error.code === 'STORAGE_UNAVAILABLE');
});

test('native Preferences awaits persistence and never falls back to browser storage after failure', async () => {
  const values = new Map(), calls = [], backing = storage(); let failWrite = false;
  const preferences = {
    async get({key}) { calls.push(['get', key]); return {value:values.get(key) ?? null}; },
    async set({key, value}) { if (failWrite) throw Error('native write failed'); await Promise.resolve(); values.set(key, value); },
    async remove({key}) { values.delete(key); }
  };
  const store = createLocalStore({preferences, storage:backing}); assert.equal(store.backend, 'native-preferences');
  await store.set('prefs', {language:'en'}); assert.deepEqual(await store.get('prefs'), {language:'en'});
  failWrite = true; await assert.rejects(store.set('prefs', {language:'zh-CN'}), code('STORAGE_WRITE_FAILED'));
  assert.equal(backing.entries.size, 0); assert.deepEqual(await store.get('prefs'), {language:'en'});
  await store.remove('prefs'); assert.equal(await store.get('prefs'), null); assert.equal(calls[0][1], 'playroom.prefs');
});

test('local repository injection is explicit, async and makes no remote connection', async () => {
  let calls = 0;
  const localRepository = Object.fromEntries(REPOSITORY_METHODS.map(method => [method, (...args) => { calls++; return {method, args}; }]));
  const repo = createGameRepository({localRepository, remote:{fetch() { throw Error('must not fetch'); }}});
  assert.equal(repo.mode, 'local'); assert.equal(calls, 0); assert.deepEqual(await repo.getWallet(), {method:'getWallet', args:[]});
  assert.equal(calls, 1); assert.throws(() => createGameRepository(), code('INVALID_CONFIG'));
  assert.throws(() => createGameRepository({mode:'automatic', localRepository}), code('INVALID_CONFIG'));
});

test('HTTPS configuration rejects credentials, traversal and dynamic destination injection', async () => {
  for (const baseURL of ['http://api.example/v1', '/api', 'https://user:pass@api.example/v1', 'https://api.example/v1?key=x', 'https://api.example/v1#fragment', 'https://api.example/a/../v1', 'https://api.example/a/%2e%2e/v1', 'https://api.example/a%2fb', 'https://api.example/\\other']) assert.throws(() => repository(()=>{}, {baseURL}), code('INVALID_CONFIG'));
  let calls = 0; const repo = repository(async () => { calls++; return reply(wallet); });
  await assert.rejects(repo.getRound('https://other.example/steal'), code('INVALID_INPUT'));
  await assert.rejects(repo.getActiveRound('../wallet'), code('INVALID_INPUT'));
  assert.equal(calls, 0); assert.equal(repo.request, undefined); assert.equal(repo.mode, 'remote');
});

test('token provider remains in memory, is refreshed per call, and requests cannot follow redirects', async () => {
  const tokens = createMemoryTokenProvider('token-one'), calls = [];
  const repo = repository(async (url, options) => { calls.push({url, options}); return reply(wallet); }, {tokenProvider:tokens});
  assert.deepEqual(await repo.getWallet(), wallet); tokens.setToken('token-two'); await repo.getWallet();
  assert.equal(calls[0].url, 'https://api.example.test/v1/me/wallet');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-one'); assert.equal(calls[1].options.headers.Authorization, 'Bearer token-two');
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.body, undefined); assert.equal(calls[0].options.signal.aborted, false);
  tokens.clear(); await assert.rejects(repo.getWallet(), code('AUTH_REQUIRED')); assert.equal(calls.length, 2);
  assert.throws(() => tokens.setToken('bad\nheader'), code('INVALID_INPUT'));
});

test('profile/preferences commands carry UUID idempotency and resource revisions, not account authority', async () => {
  const calls = [];
  const repo = repository(async (url, options) => {
    calls.push({url, options});
    return reply(url.endsWith('profile') ? {userId:'user-1', revision:2, displayName:'Pilot'} : {revision:2, values:{language:'en'}});
  });
  await repo.updateProfile({displayName:'Pilot'}, command); await repo.updatePreferences({language:'en', favoriteGameIds:['blocks']}, command);
  assert.equal(calls[0].options.method, 'PATCH'); assert.equal(calls[0].options.headers['Idempotency-Key'], KEY);
  assert.deepEqual(JSON.parse(calls[0].options.body), {...command, patch:{displayName:'Pilot'}});
  await assert.rejects(repo.updateProfile({balanceMinor:999}, command), code('INVALID_INPUT'));
  await assert.rejects(repo.updatePreferences({authToken:'secret'}, command), code('INVALID_INPUT'));
  await assert.rejects(repo.updatePreferences({language:'invalid'}, command), code('INVALID_INPUT'));
  await assert.rejects(repo.updateProfile({displayName:'Pilot'}, {expectedRevision:0, idempotencyKey:'retry'}), code('INVALID_INPUT'));
  await assert.rejects(repo.updateProfile({displayName:'Pilot'}, {...command, expectedRevision:-1}), code('INVALID_INPUT'));
  assert.equal(calls.length, 2);
});

test('round commands contain only supported player choices and reject supplied rewards or random outcomes', async () => {
  const calls = [];
  const repo = repository(async (url, options) => { calls.push({url, options}); const body = JSON.parse(options.body); return reply({round:round(body.gameId || 'dice'), wallet}); });
  await repo.startRound('dice', {...command, selection:{mode:'sum', target:12}});
  assert.deepEqual(JSON.parse(calls[0].options.body), {...command, selection:{mode:'sum', target:12}});
  await repo.submitAction('2048', ROUND, {...command, type:'move', payload:{direction:'left'}});
  assert.equal(calls[1].url, `https://api.example.test/v1/rounds/${ROUND}/actions`);
  assert.deepEqual(JSON.parse(calls[1].options.body), {...command, gameId:'2048', type:'move', payload:{direction:'left'}});
  for (const key of ['balance', 'amount', 'reward', 'payout', 'result', 'seed', 'random', 'cost']) {
    await assert.rejects(repo.startRound('dice', {...command, selection:{mode:'sum', target:12, [key]:1000}}), code('INVALID_INPUT'));
    await assert.rejects(repo.startRound('dice', {...command, selection:{mode:'sum', target:12}, [key]:1000}), code('INVALID_INPUT'));
  }
  await assert.rejects(repo.submitAction('2048', ROUND, {...command, type:'move', payload:{direction:'left', score:2048}}), code('INVALID_INPUT'));
  await assert.rejects(repo.submitAction('slots', ROUND, {...command, type:'settle', payload:{}}), code('INVALID_INPUT'));
  await assert.rejects(repo.submitAction('minesweeper', ROUND, {...command, type:'reveal', payload:{index:54}}), code('INVALID_INPUT'));
  await assert.rejects(repo.startRound('plinko', {...command, selection:{lane:5}}), code('INVALID_INPUT'));
  assert.equal(calls.length, 2);
});

test('reads validate response identity and state, including no active round', async () => {
  assert.equal(await repository(async () => reply(null)).getActiveRound('slots'), null);
  assert.deepEqual(await repository(async () => reply(round())).getRound(ROUND), round());
  await assert.rejects(repository(async () => reply(round('dice'))).getActiveRound('slots'), code('INVALID_RESPONSE'));
  await assert.rejects(repository(async () => reply({...wallet, balanceMinor:-1})).getWallet(), code('INVALID_RESPONSE'));
  await assert.rejects(repository(async () => reply({...wallet, balanceMinor:Number.MAX_SAFE_INTEGER + 1})).getWallet(), code('INVALID_RESPONSE'));
  await assert.rejects(repository(async () => new Response('not-json', {headers:{'Content-Type':'application/json'}})).getWallet(), code('INVALID_RESPONSE'));
  await assert.rejects(repository(async () => new Response(JSON.stringify({data:wallet}), {headers:{'Content-Type':'text/html'}})).getWallet(), code('INVALID_RESPONSE'));
  await assert.rejects(repository(async () => null).getWallet(), code('INVALID_RESPONSE'));
});

test('server conflicts preserve revision metadata and do not retry or award locally', async () => {
  let calls = 0;
  const repo = repository(async () => { calls++; return new Response(JSON.stringify({error:{code:'REVISION_CONFLICT', currentRevision:8}}), {status:409, headers:{'Content-Type':'application/json', 'X-Request-Id':'conflict-1'}}); });
  await assert.rejects(repo.startRound('slots', command), error => error.code === 'REVISION_CONFLICT' && error.status === 409 && error.currentRevision === 8 && error.requestId === 'conflict-1' && !error.retryable && !error.commitUnknown);
  assert.equal(calls, 1);
  await assert.rejects(repository(async () => new Response('', {status:401})).getWallet(), code('AUTH_REQUIRED'));
  await assert.rejects(repository(async () => new Response('', {status:503})).startRound('slots', command), error => error.code === 'HTTP_ERROR' && error.retryable && error.commitUnknown);
});

test('network failures and timeouts remain explicit uncertain mutations, with no automatic fallback', async () => {
  let calls = 0;
  const broken = repository(async () => { calls++; throw Error('offline'); });
  await assert.rejects(broken.startRound('slots', command), error => error.code === 'NETWORK_ERROR' && error.commitUnknown);
  assert.equal(calls, 1);
  let aborted = false;
  const hanging = repository((_url, {signal}) => new Promise((_, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); }); }), {timeoutMs:10});
  await assert.rejects(hanging.startRound('slots', command), error => error.code === 'TIMEOUT' && error.commitUnknown);
  assert.equal(aborted, true);
  let resolveToken, authFetches = 0;
  const auth = repository(async () => { authFetches++; return reply(wallet); }, {timeoutMs:10, tokenProvider:() => new Promise(resolve => { resolveToken = resolve; })});
  await assert.rejects(auth.getWallet(), error => error.code === 'TIMEOUT' && !error.commitUnknown);
  resolveToken('late-token'); await new Promise(resolve => setImmediate(resolve)); assert.equal(authFetches, 0);
  await assert.rejects(repository(async () => { throw Error('must not fetch'); }, {tokenProvider:async () => { throw Error('auth outage'); }}).getWallet(), code('AUTH_UNAVAILABLE'));
});

test('idempotency keys use secure UUID generation and can be reused unchanged after an uncertain result', async () => {
  assert.match(createIdempotencyKey(webcrypto), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
  const fallback = createIdempotencyKey({getRandomValues:bytes => { bytes.fill(0); return bytes; }}); assert.equal(fallback, '00000000-0000-4000-8000-000000000000');
  assert.throws(() => createIdempotencyKey({}), code('CRYPTO_UNAVAILABLE'));
  const keys = [];
  const repo = repository(async (_url, options) => { keys.push(options.headers['Idempotency-Key']); if (keys.length === 1) throw Error('connection lost'); return reply({round:round('slots'), wallet}); });
  await assert.rejects(repo.startRound('slots', command), code('NETWORK_ERROR'));
  await repo.startRound('slots', command); assert.deepEqual(keys, [KEY, KEY]);
});

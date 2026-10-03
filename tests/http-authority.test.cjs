'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const http = require('node:http');
const {randomUUID} = require('node:crypto');
const {createHandler, COOKIE} = require('../server/http.cjs');
const {SQLiteStore} = require('../server/store.cjs');
async function fixture(t, getStore, options = {}) {
  const store = new SQLiteStore(':memory:');
  const server = http.createServer(createHandler(getStore || (() => store), {clock: () => 1000, random: () => 0, ...options}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close();});
  const url = `http://127.0.0.1:${server.address().port}`;
  return {url, async send(body, cookie = '', extra = {}) {
    const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: options.secure ? url.replace('http:', 'https:') : url, Cookie: cookie, ...extra.headers}, body: JSON.stringify(body), ...extra});
    return {status: r.status, headers: r.headers, data: await r.json()};
  }};
}
test('HTTP sessions are opaque, refresh-persistent, isolated and bound to same-origin JSON requests', async t => {
  const f = await fixture(t);
  assert.equal((await f.send({op: 'sync'})).status, 401);
  const first = await f.send({op: 'connect'}), raw = first.headers.get('set-cookie'), cookie = raw.split(';')[0];
  assert.equal(first.data.points, 1000); assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Strict/);
  assert.match(cookie, new RegExp(`^${COOKIE}=[a-f0-9]{64}$`)); assert.match(first.headers.get('cache-control'), /no-store/);
  const start = {op: 'act', gameId: 'minesweeper', type: 'mines-start', revision: 0, roundId: '', requestId: randomUUID()};
  assert.equal((await f.send(start, cookie)).data.points, 950);
  assert.equal((await f.send(start, cookie)).data.points, 950);
  assert.equal((await f.send({op: 'connect'}, cookie)).data.points, 950);
  assert.equal((await f.send({op: 'connect'})).data.points, 1000);
  assert.equal((await f.send(start, COOKIE + '=' + 'a'.repeat(64))).status, 401);
  for (const headers of [{Origin: 'https://evil.test'}, {Origin: 'null'}, {Origin: f.url, 'Sec-Fetch-Site': 'cross-site'}]) {
    const r = await f.send(start, cookie, {headers: {'Content-Type': 'application/json', Cookie: cookie, ...headers}});
    assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  const forged = await f.send({...start, amount: 999999}, cookie); assert.equal(forged.status, 400);
  assert.equal((await f.send({op: 'sync'}, cookie)).data.points, 950);
  const huge = await f.send({op: 'connect', text: 'x'.repeat(5000)}); assert.equal(huge.status, 413); assert.equal(huge.headers.get('set-cookie'), null);
  const get = await fetch(f.url); assert.equal(get.status, 405);
});
test('secure cloud cookie and fail-closed database errors', async t => {
  const good = await fixture(t, null, {secure: true});
  assert.match((await good.send({op: 'connect'})).headers.get('set-cookie'), /; Secure/);
  const failed = await fixture(t, () => {throw new Error('private credential value');});
  const r = await failed.send({op: 'connect'});
  assert.equal(r.status, 503); assert.equal(r.headers.get('set-cookie'), null);
  assert.equal(JSON.stringify(r.data).includes('private credential'), false);
  assert.equal('points' in r.data, false);
});

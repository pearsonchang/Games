const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createPreviewHandler} = require('../scripts/preview.cjs');

const handler = createPreviewHandler(path.resolve('src'));
async function request(url, method = 'GET', headers = {}) {
  const response = {headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, writeHead(status, values = {}) { this.status = status; for (const [k, v] of Object.entries(values)) this.setHeader(k, v); }, end(body) { this.body = body; }};
  await handler({url, method, headers}, response);
  return response;
}
test('preview returns complete no-store engine scripts even with conditional cache headers', async () => {
  const first = await request('/plinko-engine.js?v=test');
  const repeated = await request('/plinko-engine.js?v=test', 'GET', {'if-modified-since': new Date().toUTCString(), 'if-none-match': '*'});
  for (const response of [first, repeated]) {
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.match(response.body.toString(), /const PLINKO_PEGS=/);
    assert.equal(response.headers['content-length'], response.body.length);
  }
  assert.deepEqual(first.body, repeated.body);
});
test('preview serves entrypoints and HEAD, rejects missing assets, traversal and mutations', async () => {
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/plinko')).status, 200);
  const head = await request('/plinko.html', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, undefined);
  for (const url of ['/missing.js', '/%2e%2e%2fpackage.json', '/%E0%A4%A']) assert.equal((await request(url)).status, 404);
  assert.equal((await request('/plinko.html', 'POST')).status, 405);
});

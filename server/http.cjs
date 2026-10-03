'use strict';
const {randomBytes, createHash} = require('node:crypto');
const {initialState, transact, ServiceError} = require('./service.cjs');
const {TTL_SECONDS} = require('./store.cjs');
const COOKIE = 'playroom_session';
function sessionKey(token) { return 'playroom:v1:' + createHash('sha256').update(token).digest('hex'); }
async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new ServiceError(415, '需要 JSON 请求。');
  if (Number(req.headers['content-length']) > 4096) throw new ServiceError(413, '请求过大。');
  let text;
  if (req.body !== undefined) text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new ServiceError(413, '请求过大。'); chunks.push(chunk); } text = Buffer.concat(chunks).toString('utf8'); }
  if (Buffer.byteLength(text) > 4096) throw new ServiceError(413, '请求过大。');
  try { return JSON.parse(text); } catch { throw new ServiceError(400, '请求格式不正确。'); }
}
function createHandler(getStore, options = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new ServiceError(405, '不支持的请求方式。'); }
      const secure = !!options.secure || !!req.socket?.encrypted;
      const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`;
      if (req.headers.origin !== origin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) throw new ServiceError(403, '请求来源不正确。');
      const body = await readBody(req);
      // Validate before creating any account or granting initial points.
      require('./service.cjs').validate(body);
      const store = await getStore();
      const token = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
      let key = token && /^[a-f0-9]{64}$/.test(token) ? sessionKey(token) : null;
      if (body.op === 'connect' && (!key || !await store.read(key))) {
        const freshToken = randomBytes(32).toString('hex'); key = sessionKey(freshToken);
        if (!await store.create(key, initialState())) throw new Error('Session creation failed');
        res.setHeader('Set-Cookie', `${COOKIE}=${freshToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_SECONDS}${secure ? '; Secure' : ''}`);
      }
      if (!key) throw new ServiceError(401, '请先连接游戏大厅。');
      const data = await transact(store, key, body, options);
      res.statusCode = 200; res.end(JSON.stringify(data));
    } catch (error) {
      const status = error instanceof ServiceError ? error.status : 503;
      res.statusCode = status;
      res.end(JSON.stringify({error: status === 503 ? '游戏服务暂时不可用，请稍后重试。' : error.message}));
    }
  };
}
module.exports = {createHandler, sessionKey, COOKIE};

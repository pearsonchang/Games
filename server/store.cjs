'use strict';
const TTL_SECONDS = 7 * 24 * 60 * 60;
class SQLiteStore {
  constructor(filename, clock = Date.now) {
    const {DatabaseSync} = require('node:sqlite');
    const fs = require('node:fs'), path = require('node:path');
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), {recursive: true, mode: 0o700});
    this.db = new DatabaseSync(filename); this.clock = clock;
    if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL);');
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(clock());
  }
  async create(key, data) {
    return this.db.prepare('INSERT OR IGNORE INTO sessions (id,version,value,expires) VALUES (?,?,?,?)').run(key, data.version, JSON.stringify(data), this.clock() + TTL_SECONDS * 1000).changes === 1;
  }
  async read(key) {
    const row = this.db.prepare('SELECT value FROM sessions WHERE id=? AND expires>?').get(key, this.clock());
    return row ? JSON.parse(row.value) : null;
  }
  async compareAndSwap(key, version, data) {
    return this.db.prepare('UPDATE sessions SET version=?,value=?,expires=? WHERE id=? AND version=? AND expires>?').run(data.version, JSON.stringify(data), this.clock() + TTL_SECONDS * 1000, key, version, this.clock()).changes === 1;
  }
  close() { this.db.close(); }
}
const CAS = `local old=redis.call('GET',KEYS[1])
if not old then return 0 end
local parsed=cjson.decode(old)
if parsed.version~=tonumber(ARGV[1]) then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3])
return 1`;
class RedisStore {
  constructor(url, token, fetcher = fetch) {
    if (new URL(url).protocol !== 'https:' || !token) throw new Error('Invalid Redis configuration');
    Object.assign(this, {url, token, fetcher});
  }
  async command(parts) {
    const response = await this.fetcher(this.url, {method: 'POST', headers: {Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json'}, body: JSON.stringify(parts), signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Storage unavailable');
    const body = await response.json();
    if (body.error) throw new Error('Storage command failed');
    return body.result;
  }
  async create(key, data) { return await this.command(['SET', key, JSON.stringify(data), 'NX', 'EX', TTL_SECONDS]) === 'OK'; }
  async read(key) { const value = await this.command(['GET', key]); return value ? JSON.parse(value) : null; }
  async compareAndSwap(key, version, data) { return await this.command(['EVAL', CAS, 1, key, version, JSON.stringify(data), TTL_SECONDS]) === 1; }
}
function configuredStore(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new RedisStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  // Ephemeral files or memory are never used as a Vercel/cloud ledger.
  if (env.VERCEL || env.NODE_ENV === 'production') throw new Error('Persistent cloud storage is required');
  return new SQLiteStore(env.PLAYROOM_DB_PATH || require('node:path').join(__dirname, '../.local/playroom.sqlite'));
}
module.exports = {SQLiteStore, RedisStore, configuredStore, TTL_SECONDS, CAS};

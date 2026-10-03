'use strict';
// Client cache contains public snapshots only. It has no credit/debit or engine API.
class PlatformAPI {
  constructor({fetcher = (...args) => fetch(...args), onState = () => {}, onStatus = () => {}, uuid = () => crypto.randomUUID()} = {}) {
    Object.assign(this, {fetcher, onState, onStatus, uuid});
    this.games = {}; this.version = -1; this.online = false; this.pending = 0; this.queue = Promise.resolve();
  }
  enqueue(body) {
    this.pending++;
    const work = this.queue.then(() => this.request(body));
    this.queue = work.catch(() => {}).finally(() => this.pending--);
    return work;
  }
  async request(body) {
    const request = {...body, knownRounds: Object.fromEntries(Object.entries(this.games).map(([id, game]) => [id, game.roundId]))};
    let lastError;
    // Reuse the same requestId on retry. Never infer whether a timed-out action committed.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher('/api/playroom', {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(request), signal: AbortSignal.timeout(12000)});
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || '游戏服务暂时不可用。'); error.status = response.status; throw error;
        }
        if (!data.games || !Number.isSafeInteger(data.version) || !Number.isFinite(data.points)) throw new Error('服务响应异常，请重试。');
        this.online = true; this.onStatus(true);
        if (data.version >= this.version) {
          this.version = data.version;
          for (const [id, game] of Object.entries(data.games)) {
            const previous = this.games[id];
            this.games[id] = id === 'plinko' && !Object.hasOwn(game, 'path') && previous?.roundId === game.roundId ? {...game, path: previous.path} : game;
          }
          this.onState({...data, games: this.games});
        }
        return data;
      } catch (error) { lastError = error; if (error.status && error.status < 500) break; }
    }
    this.online = false; this.onStatus(false, lastError.message || '连接中断，正在核对游戏状态。');
    throw lastError;
  }
  connect() { return this.enqueue({op: 'connect'}); }
  refresh() { return this.pending ? this.queue : this.enqueue({op: 'sync'}); }
  act(gameId, data) { return this.enqueue({op: 'act', gameId, ...data, requestId: this.uuid()}); }
}
if (typeof module !== 'undefined') module.exports = {PlatformAPI};

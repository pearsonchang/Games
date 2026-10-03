'use strict';
class GameBridge {
  constructor({api, frames, loadedGames, origin, onReturn}) {
    Object.assign(this, {api, frames, loadedGames, origin, onReturn});
    this.prefixes = {minesweeper: 'mines', rocket: 'rocket', dice: 'dice', plinko: 'plinko', horse: 'horse'};
    this.actions = {
      'mines-start': ['revision'], 'mines-reveal': ['revision', 'index'], 'mines-flag': ['revision', 'index'], 'mines-collect': ['revision'], 'mines-forfeit': ['revision'],
      'rocket-launch': [], 'rocket-collect': [], 'dice-roll': ['mode', 'target'], 'plinko-drop': ['lane'], 'horse-start': ['selected']
    };
  }
  post(id, data) { this.frames[id]?.contentWindow?.postMessage(data, this.origin); }
  sync(id) { if (this.loadedGames.has(id) && this.api.games[id]) this.post(id, this.api.games[id]); }
  syncAll() { for (const id of this.loadedGames) this.sync(id); }
  offline(message) { for (const id of this.loadedGames) this.post(id, {type: 'platform-offline', message}); }
  async handle(event) {
    const data = event.data;
    if (event.origin !== this.origin || !data || typeof data !== 'object' || Array.isArray(data) || typeof data.type !== 'string') return;
    const id = Object.keys(this.frames).find(key => this.frames[key]?.contentWindow === event.source);
    if (!id || !this.loadedGames.has(id)) return;
    if (data.type === 'game-return') { this.onReturn?.(); return; }
    const prefix = this.prefixes[id];
    if (data.type === `${prefix}-ready`) { this.sync(id); if (!this.api.online) this.post(id, {type: 'platform-offline', message: '正在连接游戏服务…'}); return; }
    if (!data.type.startsWith(prefix + '-') || !Object.hasOwn(this.actions, data.type)) return;
    if (!this.api.online) { this.offline('连接中断，请先重新连接。'); return; }
    const action = {type: data.type, roundId: data.roundId};
    for (const field of this.actions[data.type]) action[field] = data[field];
    try {
      const response = await this.api.act(id, action);
      if (!response.action?.ok) this.post(id, {type: `${prefix}-error`, message: response.action?.message || '本次操作未生效。'});
    } catch { /* The shared connection notice handles uncertain outcomes. */ }
  }
}
if (typeof module !== 'undefined') module.exports = {GameBridge};

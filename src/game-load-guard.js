'use strict';

class GameLoadGuard {
  constructor({change, schedule = (fn, delay) => setTimeout(fn, delay), cancel = id => clearTimeout(id), timeout = 12000}) {
    Object.assign(this, {change, schedule, cancel, timeout});
    this.active = null;
    this.timer = null;
    this.readyGames = new Set();
  }
  open(id, retry = false) {
    this.leave();
    this.active = id;
    if (retry) this.readyGames.delete(id);
    if (this.readyGames.has(id)) { this.change('ready', id); return; }
    this.change('loading', id);
    this.timer = this.schedule(() => {
      this.timer = null;
      if (this.active === id && !this.readyGames.has(id)) this.change('failed', id);
    }, this.timeout);
  }
  ready(id) {
    this.readyGames.add(id);
    if (this.active !== id) return;
    this.cancel(this.timer);
    this.timer = null;
    this.change('ready', id);
  }
  leave() {
    this.cancel(this.timer);
    this.timer = null;
    this.active = null;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = {GameLoadGuard};

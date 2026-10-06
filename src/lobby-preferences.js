'use strict';

// Only game IDs live here. Balances, rounds and rewards remain session-only.
class LobbyPreferences {
  constructor(ids, storage) {
    this.ids = new Set(ids);
    this.storage = storage;
    this.key = 'playroom.lobby.v1';
    this.favorites = [];
    this.recent = [];
    this.explored = [];
    this.persistent = !!storage;
    try {
      const value = JSON.parse(storage?.getItem(this.key) || '{}');
      this.favorites = this.clean(value?.favorites);
      this.recent = this.clean(value?.recent).slice(0, 3);
      this.explored = this.clean(value?.explored);
    } catch { this.persistent = false; /* A corrupt or unavailable store never blocks play. */ }
  }
  clean(value) {
    return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && this.ids.has(id)))] : [];
  }
  save() {
    try {
      if (!this.storage) return false;
      this.storage.setItem(this.key, JSON.stringify({favorites: this.favorites, recent: this.recent, explored: this.explored}));
      this.persistent = true;
      return true;
    } catch { this.persistent = false; return false; }
  }
  toggle(id) {
    if (!this.ids.has(id)) return false;
    this.favorites = this.favorites.includes(id) ? this.favorites.filter(item => item !== id) : [...this.favorites, id];
    this.save();
    return this.favorites.includes(id);
  }
  visit(id) {
    if (!this.ids.has(id)) return;
    this.recent = [id, ...this.recent.filter(item => item !== id)].slice(0, 3);
    if (!this.explored.includes(id)) this.explored.push(id);
    this.save();
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = {LobbyPreferences};

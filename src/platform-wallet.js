'use strict';

// Session-only demo ledger. Amounts are stored as integer hundredths.
class PointsWallet {
  #cents;
  #entries = [];
  #transactions = new Set();

  constructor(initial = 1000, clock = () => new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})) {
    const cents = PointsWallet.toCents(initial);
    if (cents === null) throw new RangeError('Invalid initial balance');
    this.#cents = cents;
    this.clock = clock;
    this.#entries.push({label: '首次体验赠送', amount: cents / 100, time: '本次会话'});
  }

  static toCents(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  get points() { return this.#cents / 100; }
  get ledger() { return this.#entries.map(entry => ({...entry})); }
  charge(amount, label, key) { return this.#apply(amount, label, key, -1); }
  credit(amount, label, key) { return this.#apply(amount, label, key, 1); }

  #apply(amount, label, key, direction) {
    const cents = PointsWallet.toCents(amount);
    if (cents === null || (direction < 0 && cents === 0)) return false;
    if (key !== undefined && (typeof key !== 'string' || !key || this.#transactions.has(key))) return false;
    const next = this.#cents + direction * cents;
    if (!Number.isSafeInteger(next) || next < 0) return false;
    this.#cents = next;
    if (key !== undefined) this.#transactions.add(key);
    this.#entries.push({label, amount: direction * cents / 100, time: this.clock()});
    return true;
  }
}

if (typeof module !== 'undefined') module.exports = {PointsWallet};

'use strict';

// Server-owned demo ledger. Amounts are stored as integer hundredths.
class PointsWallet {
  #cents;
  #entries = [];
  #transactions = new Set();

  constructor(initial = 1000, clock = () => new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})) {
    const cents = PointsWallet.toCents(initial);
    if (cents === null) throw new RangeError('Invalid initial balance');
    this.#cents = cents;
    this.clock = clock;
    this.#entries.push({label: '首次体验赠送', amount: cents / 100, time: '体验开始'});
  }

  static toCents(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  static restore(data, clock) {
    const wallet = new PointsWallet(0, clock);
    if (!Number.isSafeInteger(data.cents) || data.cents < 0) throw new Error('Invalid stored balance');
    wallet.#cents = data.cents;
    wallet.#entries = data.entries;
    wallet.#transactions = new Set(data.transactions);
    return wallet;
  }
  export() {
    return {cents: this.#cents, entries: this.#entries.slice(-2000), transactions: [...this.#transactions].slice(-2000)};
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

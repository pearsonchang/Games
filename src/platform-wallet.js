'use strict';

// Local demo ledger. Amounts are stored as integer hundredths.
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

  static transactionId(key) {
    if (typeof key !== 'string') return null;
    const [game, round, kind, extra] = key.split(':');
    if (extra !== undefined || !['minesweeper', 'rocket', 'dice', 'plinko', 'horse', 'slots', 'matrix', 'blocks', '2048'].includes(game)) return null;
    const prefix = game === 'minesweeper' ? 'mines' : game;
    const match = kind === 'debit' ? /^([1-9]\d*)$/.exec(round) : ['credit', 'refund', 'loss'].includes(kind) ? new RegExp(`^${prefix}-([1-9]\\d*)$`).exec(round) : null;
    const counter = match && Number(match[1]);
    return Number.isSafeInteger(counter) && counter > 0 ? {group: `${game}:${kind}`, counter} : null;
  }
  static hasTransaction(record, key) {
    if (record.transactions.includes(key)) return true;
    const wanted = PointsWallet.transactionId(key);
    return !!wanted && record.transactions.some(value => {
      const previous = PointsWallet.transactionId(value);
      return previous?.group === wanted.group && previous.counter >= wanted.counter;
    });
  }

  get points() { return this.#cents / 100; }
  get ledger() { return this.#entries.map(entry => ({...entry})); }
  exportState() {
    return {cents: this.#cents, entries: this.ledger, transactions: [...this.#transactions]};
  }
  static validateState(record) {
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
    if (!plain(record) || Object.keys(record).sort().join(',') !== 'cents,entries,transactions' || !Number.isSafeInteger(record.cents) || record.cents < 0) return false;
    if (!Array.isArray(record.entries) || !record.entries.length || record.entries.length > 100000 || !Array.isArray(record.transactions) || record.transactions.length > record.entries.length) return false;
    if (record.transactions.some(key => typeof key !== 'string' || !key || key.length > 160) || new Set(record.transactions).size !== record.transactions.length) return false;
    let balance = 0;
    for (const entry of record.entries) {
      if (!plain(entry) || Object.keys(entry).sort().join(',') !== 'amount,label,time' || typeof entry.label !== 'string' || entry.label.length > 300 || typeof entry.time !== 'string' || entry.time.length > 100 || typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) return false;
      const cents = Math.round(entry.amount * 100);
      if (!Number.isSafeInteger(cents) || cents / 100 !== entry.amount) return false;
      balance += cents;
      if (!Number.isSafeInteger(balance) || balance < 0) return false;
    }
    return balance === record.cents;
  }
  importState(record) {
    if (!PointsWallet.validateState(record)) return false;
    this.#cents = record.cents;
    this.#entries = record.entries.map(entry => ({label: entry.label, amount: entry.amount, time: entry.time}));
    this.#transactions = new Set(record.transactions);
    return true;
  }
  charge(amount, label, key) { return this.#apply(amount, label, key, -1); }
  credit(amount, label, key) { return this.#apply(amount, label, key, 1); }

  #apply(amount, label, key, direction) {
    const cents = PointsWallet.toCents(amount);
    if (cents === null || (direction < 0 && cents === 0)) return false;
    if (key !== undefined && (typeof key !== 'string' || !key || PointsWallet.hasTransaction({transactions: [...this.#transactions]}, key))) return false;
    const next = this.#cents + direction * cents;
    if (!Number.isSafeInteger(next) || next < 0) return false;
    this.#cents = next;
    if (key !== undefined) {
      // Game counters only increase. One high-water mark per game/transaction kind
      // rejects every earlier duplicate without retaining an unbounded ID list.
      const current = PointsWallet.transactionId(key);
      if (current) for (const previous of this.#transactions) {
        if (PointsWallet.transactionId(previous)?.group === current.group) this.#transactions.delete(previous);
      }
      this.#transactions.add(key);
    }
    this.#entries.push({label, amount: direction * cents / 100, time: this.clock()});
    if (this.#entries.length > 500) {
      const earlier = this.#entries.splice(0, this.#entries.length - 499);
      const amount = earlier.reduce((total, entry) => total + Math.round(entry.amount * 100), 0) / 100;
      this.#entries.unshift({label: '历史结余', amount, time: ''});
    }
    return true;
  }
}

if (typeof module !== 'undefined') module.exports = {PointsWallet};

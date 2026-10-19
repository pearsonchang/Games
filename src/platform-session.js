'use strict';

// A versioned, local demo checkpoint, not a tamper-proof account or gambling receipt.
// Only the fields below are serialized; clocks, callbacks, DOM and animation caches
// always come from newly constructed engines. The checksum detects damaged writes.
const PlayroomSession = (() => {
  const node = typeof module !== 'undefined' && module.exports;
  const Wallet = node ? require('./platform-wallet.js').PointsWallet : PointsWallet;
  const rules = node ? require('./dice-rules.js') : DiceRules;
  const shapes = node ? require('./blocks-engine.js').BLOCK_SHAPES : BLOCK_SHAPES;
  const restored = new WeakSet(), adapters = new WeakMap();
  const ids = ['minesweeper', 'rocket', 'dice', 'plinko', 'horse', 'slots', 'matrix', 'blocks', '2048'];
  const prefix = id => id === 'minesweeper' ? 'mines' : id;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const number = (min = 0, max = Number.MAX_SAFE_INTEGER) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const integer = (min = 0, max = Number.MAX_SAFE_INTEGER) => value => Number.isSafeInteger(value) && value >= min && value <= max;
  const bool = value => typeof value === 'boolean';
  const text = (max = 300) => value => typeof value === 'string' && value.length <= max;
  const one = (...choices) => value => choices.includes(value);
  const nullable = check => value => value === null || check(value);
  const list = (check, min, max = min) => value => Array.isArray(value) && value.length >= min && value.length <= max && value.every(check);
  const shape = (fields, optional = []) => value => plain(value) && Object.keys(value).every(key => own(fields, key)) && Object.entries(fields).every(([key, check]) => own(value, key) ? check(value[key]) : optional.includes(key));
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (left, right) => canonical(left) === canonical(right);
  const money = number(0, Number.MAX_SAFE_INTEGER / 100);
  const count = integer(), timestamp = number(0, 8640000000000000);
  const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const values = list(integer(1, 6), 3), symbols = list(integer(0, 5), 3);
  const matrix = list(symbols, 5), order = value => list(integer(0, 3), 4)(value) && new Set(value).size === 4;
  const tile = value => value === 0 || (integer(2, 2048)(value) && Number.isInteger(Math.log2(value)));
  const coordinate = list(integer(0, 4), 2);
  const receiptResult = shape({values, sum: integer(3, 18), won: bool, amount: money, cost: one(50), net: number(-50)});
  const receiptShape = shape({protocol: one('playroom-local-dice-v1'), assurance: one('local-replay-only'), gameId: one('dice'), state: one('revealed'), sessionId: hex, roundId: text(50), nonce: integer(1), inputs: shape({mode: one('size', 'sum', 'triple'), target: value => value === null || typeof value === 'string' || integer(3, 18)(value)}), cost: one(50), rulesVersion: one('dice-v1'), rulesHash: hex, commitment: hex, clientSeed: hex, serverSeed: hex, randomWord: hex, result: receiptResult, recordHash: hex});
  const receipt = value => receiptShape(value) && value.roundId === `dice-${value.nonce}` && rules.valid(value.inputs.mode, value.inputs.target) && equal(value.result, rules.result(value.result.values, value.inputs.mode, value.inputs.target));
  function proof(value) {
    if (value === null) return true;
    if (value?.state === 'revealed') return receipt(value);
    if (value?.state === 'preparing') return shape({state: one('preparing'), assurance: one('local-replay-only'), rulesVersion: one('dice-v1')})(value);
    if (value?.state === 'failed') return shape({state: one('failed'), assurance: one('local-replay-only'), roundId: text(50)})(value);
    const fields = {state: one('committed', 'prepared'), assurance: one('local-replay-only'), roundId: text(50), nonce: integer(1), sessionId: hex, rulesVersion: one('dice-v1'), rulesHash: hex, commitment: hex, clientSeed: hex};
    return shape(fields, value?.state === 'committed' ? ['clientSeed'] : [])(value);
  }
  const commonResult = {id: text(50), gameId: one(...ids), won: bool, amount: money, cost: one(50), seconds: number()};
  const resultFields = {
    minesweeper: {...commonResult, state: one('lost', 'collected', 'forfeited'), opened: integer(0, 44), multiplier: number(), claimed: bool, autoCollected: bool},
    rocket: {...commonResult, multiplier: number(1, 10), claimed: bool, autoCollected: bool},
    dice: {...commonResult, mode: one('size', 'sum', 'triple'), target: value => value === null || typeof value === 'string' || integer(3, 18)(value), values, sum: integer(3, 18)},
    plinko: {...commonResult, multiplier: number(.2, 8), slot: integer(0, 8)},
    horse: {...commonResult, selected: integer(0, 3), rank: integer(1, 4), order},
    slots: {...commonResult, values: symbols, kind: one('triple', 'pair', 'miss'), multiplier: number(0, 100)},
    matrix: {...commonResult, board: matrix, lines: list(shape({symbol: integer(0, 3), count: integer(3, 5), multiplier: number(5, 25), amount: money, lineId: integer(0, 9), cells: list(coordinate, 3, 5)}), 0, 10), bonus: shape({count: integer(0, 15), multiplier: one(0, 2, 5, 20), cells: list(coordinate, 0, 15), amount: money}), lineAmount: money, multiplier: number(), net: number(-50), kind: one('win', 'return', 'partial', 'miss')},
    blocks: {...commonResult, state: one('finished'), reason: one('abandoned', 'steps', 'blocked'), net: number(-50, 30), score: count, lines: count, maxCombo: integer(0, 30), moves: integer(0, 30)},
    '2048': {...commonResult, state: one('finished'), reason: one('abandoned', 'target', 'blocked'), net: number(-50, 30), highest: tile, score: count, moves: count}
  };
  function result(value, gameId, history = false) {
    const fields = resultFields[gameId];
    if (!fields || !shape(history ? {...fields, time: text(100)} : fields)(value) || value.gameId !== gameId || !new RegExp(`^${prefix(gameId)}-[1-9]\\d*$`).test(value.id)) return false;
    if (gameId === 'dice') {
      if (!rules.valid(value.mode, value.target)) return false;
      const expected = rules.result(value.values, value.mode, value.target);
      if (value.sum !== expected.sum || value.won !== expected.won || value.amount !== expected.amount) return false;
    }
    return true;
  }
  const nullableResult = id => nullable(value => result(value, id));
  const commonRound = {state: text(20), id: text(50), counter: count, cost: one(50)};
  const piece = value => value === null || shape({name: text(30), cells: list(list(integer(0, 4), 2), 1, 9), rows: integer(1, 5), cols: integer(1, 5), color: integer(1, 5)})(value) && shapes.some(s => s.name === value.name && s.rows === value.rows && s.cols === value.cols && equal(s.cells, value.cells));
  const blockMove = nullable(shape({revision: integer(1), placed: list(integer(0, 63), 1, 9), cleared: list(integer(0, 63), 0, 64), colors: list(integer(1, 5), 0, 64), rows: list(integer(0, 7), 0, 8), cols: list(integer(0, 7), 0, 8), gain: count, combo: integer(0, 30), lines: integer(0, 16), refilled: bool}));
  const fusionMove = nullable(shape({revision: integer(1), direction: one('left', 'right', 'up', 'down'), gain: count, transitions: list(shape({from: integer(0, 15), to: integer(0, 15), value: tile}), 1, 16), merges: list(shape({index: integer(0, 15), value: tile}), 0, 8), spawn: nullable(shape({index: integer(0, 15), value: tile}))}));
  const path = nullable(shape({frames: list(value => list(number(-100000, 100000), 7)(value), 2, 20000), slot: integer(0, 8), duration: number(1, 120000)}));
  const fields = {
    minesweeper: {state: one('idle', 'playing', 'lost', 'collected', 'forfeited'), id: text(50), counter: count, revision: count, opened: integer(0, 44), payout: money, seconds: count, detonated: integer(-1, 53), autoCollected: bool, board: list(shape({mine: bool, revealed: bool, flagged: bool}), 0, 54), startedAt: timestamp},
    rocket: {...commonRound, state: one('idle', 'flying', 'crashed', 'collected'), elapsed: number(), payout: money, multiplier: number(1, 10), autoCollected: bool, startedAt: timestamp, crashAt: timestamp, capAt: timestamp},
    dice: {...commonRound, state: one('idle', 'preparing', 'rolling', 'finished', 'error'), result: nullableResult('dice'), proof, error: nullable(text()), mode: one('size', 'sum', 'triple'), target: value => value === null || typeof value === 'string' || integer(3, 18)(value), startedAt: timestamp, values},
    plinko: {...commonRound, state: one('idle', 'dropping', 'finished'), result: nullableResult('plinko'), path, lane: integer(0, 4), startTime: timestamp},
    horse: {...commonRound, state: one('idle', 'racing', 'finished'), selected: integer(0, 3), elapsed: number(0, 15900), result: nullableResult('horse'), startedAt: timestamp, order, runs: list(shape({finish: one(11700, 12100, 12500, 12900), knots: list(number(0, 1), 9)}), 4), duration: one(15900)},
    slots: {...commonRound, state: one('idle', 'spinning', 'finished'), result: nullableResult('slots'), startedAt: timestamp, values: symbols},
    matrix: {...commonRound, state: one('idle', 'spinning', 'finished'), result: nullableResult('matrix'), startedAt: timestamp, board: matrix},
    blocks: {...commonRound, state: one('idle', 'playing', 'finished'), revision: count, score: count, lines: count, combo: integer(0, 30), maxCombo: integer(0, 30), moves: integer(0, 30), board: list(integer(0, 5), 64), tray: list(piece, 3), lastMove: blockMove, result: nullableResult('blocks'), startedAt: timestamp},
    '2048': {...commonRound, state: one('idle', 'playing', 'finished'), revision: count, score: count, moves: count, highest: tile, board: list(tile, 16), lastMove: fusionMove, result: nullableResult('2048'), startedAt: timestamp}
  };
  const idleOptional = {minesweeper: ['startedAt'], rocket: ['startedAt', 'crashAt', 'capAt'], dice: ['mode', 'target', 'startedAt', 'values'], plinko: ['lane', 'startTime'], horse: ['startedAt', 'order', 'runs', 'duration'], slots: ['startedAt', 'values'], matrix: ['startedAt', 'board'], blocks: ['startedAt'], '2048': ['startedAt']};
  const terminal = (id, state) => id === 'minesweeper' ? ['lost', 'collected', 'forfeited'].includes(state) : id === 'rocket' ? ['crashed', 'collected'].includes(state) : state === 'finished';
  function roundValid(id, data) {
    const optional = data?.state === 'idle' ? idleOptional[id] : id === 'dice' && ['preparing', 'error'].includes(data?.state) ? ['startedAt', 'values'] : [];
    if (!shape(fields[id], optional)(data)) return false;
    if (data.state === 'idle') return data.counter === 0 && data.id === '';
    if (data.counter < 1 || data.id !== `${prefix(id)}-${data.counter}`) return false;
    if (own(data, 'result') && (terminal(id, data.state) ? !data.result || data.result.id !== data.id : data.result !== null)) return false;
    if (id === 'minesweeper') {
      const board = data.board;
      if (board.length !== 54 || board.filter(c => c.mine).length !== 10 || board.filter(c => c.revealed && !c.mine).length !== data.opened || board.filter(c => c.flagged).length > 10 || board.some(c => c.flagged && c.revealed)) return false;
      if (data.state === 'lost' && (data.detonated < 0 || !board[data.detonated].mine || !board[data.detonated].revealed)) return false;
      if (data.state !== 'lost' && (data.detonated !== -1 || board.some(c => c.revealed && c.mine))) return false;
      if (['lost', 'forfeited'].includes(data.state) && data.payout !== 0) return false;
    }
    if (id === 'rocket' && (data.capAt < data.startedAt || data.crashAt < data.startedAt)) return false;
    if (id === 'dice' && (!rules.valid(data.mode, data.target) || (data.state === 'rolling' && data.proof !== null && data.proof.state !== 'prepared') || (data.state === 'finished' && data.proof !== null && data.proof.state !== 'revealed') || (data.state === 'preparing' && !['preparing', 'committed'].includes(data.proof?.state)) || (data.state === 'error' && (data.proof?.state !== 'failed' || !data.error)))) return false;
    if (id === 'plinko' && (!data.path || data.path.frames.some((frame, index, all) => frame[0] < 0 || index > 0 && frame[0] < all[index - 1][0]))) return false;
    if (id === 'horse' && data.runs.some((run, horse) => run.finish !== 11700 + 400 * data.order.indexOf(horse) || run.knots[0] !== 0 || run.knots[8] !== 1 || run.knots.some((value, index) => index > 0 && value <= run.knots[index - 1]))) return false;
    if (id === 'blocks' || id === '2048') {
      if (data.revision !== data.moves || (data.lastMove && data.lastMove.revision !== data.revision)) return false;
      if (id === '2048' && data.highest !== Math.max(...data.board)) return false;
      if (id === 'blocks' && (data.combo > data.maxCombo || data.maxCombo > data.moves || data.lastMove && data.lastMove.colors.length !== data.lastMove.cleared.length)) return false;
    }
    return true;
  }
  const providerShape = shape({sessionId: hex, highestNonce: count, history: list(receipt, 0, 30), pending: nullable(receipt)});
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  function checksum(value) {
    const input = canonical(value);
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function pickRound(id, round) {
    const data = {};
    for (const key of Object.keys(fields[id])) if (own(round, key) && round[key] !== undefined) data[key] = clone(round[key]);
    return data;
  }
  function providerState(round) {
    const adapter = adapters.get(round), provider = adapter ? adapter.provider : round.fairness;
    if (!provider) return adapter?.saved ? clone(adapter.saved) : null;
    if (!(provider.rounds instanceof Map) || !Array.isArray(provider.history)) throw new TypeError('Unsupported dice provider');
    return {
      sessionId: provider.sessionId, highestNonce: Math.max(provider.highestNonce, round.counter),
      history: provider.history.filter(receipt).slice(-30).map(clone),
      pending: round.state === 'rolling' && round.proof ? clone(provider.rounds.get(round.id)?.record ?? adapter?.saved?.pending ?? null) : null
    };
  }
  function capture({wallet, bridge, session}) {
    if (wallet !== bridge.wallet) throw new TypeError('Mismatched session wallet');
    const rounds = {};
    for (const id of ids) {
      if (!bridge.rounds[id]) throw new TypeError(`Missing ${id} round`);
      rounds[id] = pickRound(id, bridge.rounds[id]);
    }
    const payload = {schemaVersion: 1, wallet: wallet.exportState(), bridge: {rounds, finished: [...bridge.finished], diceProvider: providerState(bridge.rounds.dice)}, session: {visited: session.visited, activeGame: session.activeGame, rounds: clone(session.rounds.slice(-200))}};
    const record = {...payload, checksum: checksum(payload)};
    if (!valid(record)) throw new TypeError('Cannot checkpoint an inconsistent demo session');
    return record;
  }
  function valid(record) {
    if (!shape({schemaVersion: one(1), wallet: value => Wallet.validateState(value), bridge: shape({rounds: shape(Object.fromEntries(ids.map(id => [id, value => roundValid(id, value)]))), finished: list(text(80), 0, 9), diceProvider: nullable(providerShape)}), session: shape({visited: bool, activeGame: one(...ids), rounds: list(value => result(value, value?.gameId, true), 0, 200)}), checksum: value => typeof value === 'string' && /^[0-9a-f]{8}$/.test(value)})(record)) return false;
    const {checksum: savedChecksum, ...payload} = record;
    if (checksum(payload) !== savedChecksum) return false;
    const {rounds, diceProvider} = record.bridge, transactions = new Set(record.wallet.transactions), finished = new Set(record.bridge.finished);
    const history = new Set(record.session.rounds.map(r => `${r.gameId}:${r.id}`));
    const paid = key => Wallet.hasTransaction(record.wallet, key), latest = new Map();
    if (history.size !== record.session.rounds.length || finished.size !== record.bridge.finished.length) return false;
    for (const key of finished) {
      const game = key.split(':')[0], parsed = Wallet.transactionId(`${key}:credit`);
      if (!parsed || !rounds[game] || latest.has(game) || parsed.counter > rounds[game].counter) return false;
      latest.set(game, parsed.counter);
    }
    for (const id of ids) {
      const round = rounds[id], key = `${id}:${round.id}`;
      if (terminal(id, round.state) !== finished.has(key)) return false;
      if (round.counter && !transactions.has(`${id}:${round.counter}:debit`)) return false;
      if (round.counter && !terminal(id, round.state) && paid(`${key}:credit`)) return false;
      if (id === 'dice' && (round.state === 'error') !== paid(`${key}:refund`)) return false;
    }
    for (const entry of record.session.rounds) {
      const counter = Number(entry.id.slice(prefix(entry.gameId).length + 1));
      if (!integer(1, latest.get(entry.gameId) ?? 0)(counter) || entry.amount > 0 && !paid(`${entry.gameId}:${entry.id}:credit`)) return false;
    }
    const dice = rounds.dice;
    if (diceProvider && diceProvider.highestNonce < dice.counter) return false;
    if (dice.state === 'rolling' && dice.proof) {
      const pending = diceProvider?.pending;
      if (!pending || pending.roundId !== dice.id || pending.nonce !== dice.counter || pending.sessionId !== diceProvider.sessionId || pending.inputs.mode !== dice.mode || pending.inputs.target !== dice.target || !equal(pending.result.values, dice.values)) return false;
      for (const key of ['roundId', 'nonce', 'sessionId', 'rulesVersion', 'rulesHash', 'commitment', 'clientSeed']) if (pending[key] !== dice.proof[key]) return false;
    } else if (diceProvider?.pending) return false;
    return true;
  }
  function restoreProvider(round, saved) {
    const provider = round.fairness;
    if (saved && provider) {
      provider.sessionId = saved.sessionId;
      provider.highestNonce = saved.highestNonce;
      provider.history = clone(saved.history);
      provider.rounds = new Map();
      if (saved.pending) provider.rounds.set(round.id, {state: 'prepared', record: clone(saved.pending)});
      // The separate verifier reads Web Storage. Rehydrate its local receipt
      // mirror too, even when a restored round was already settled before boot.
      // Native persistence remains authoritative if this optional mirror fails.
      try { provider.storage?.setItem(provider.storageKey, JSON.stringify(provider.history)); }
      catch { try { provider.onStorageError?.(); } catch { /* Reporting cannot invalidate a restored session. */ } }
    } else if (provider) provider.highestNonce = Math.max(provider.highestNonce, round.counter);
    // Prepared dice need no new entropy. If Web Crypto availability changed, finish
    // the original round with its original receipt (or explicit lack of receipt),
    // then return to the newly constructed provider for the next roll.
    if (round.state === 'rolling' && (!provider || !round.proof)) {
      adapters.set(round, {provider, saved});
      round.fairness = {complete() {
        round.fairness = provider;
        adapters.delete(round);
        return saved?.pending ? clone(saved.pending) : null;
      }};
    }
  }
  function restore(record, {wallet, bridge, session}) {
    try {
      // Boot-only restoration prevents old async preparation callbacks from writing
      // into a newly restored round, and prevents rewinding an already live wallet.
      if (wallet !== bridge.wallet || restored.has(bridge) || ids.some(id => !bridge.rounds[id] || bridge.rounds[id].state !== 'idle' || bridge.rounds[id].counter !== 0) || session.rounds.length || bridge.finished.size) return false;
      const freshWallet = wallet.exportState();
      if (freshWallet.entries.length !== 1 || freshWallet.transactions.length) return false;
      const provider = bridge.rounds.dice.fairness;
      if (provider && (!(provider.rounds instanceof Map) || !Array.isArray(provider.history))) return false;
      // Reject oversized or non-JSON values before inspecting or assigning anything.
      const serialized = JSON.stringify(record);
      if (!serialized || serialized.length > 16 * 1024 * 1024) return false;
      const saved = JSON.parse(serialized);
      if (!valid(saved)) return false;
      wallet.importState(saved.wallet);
      session.visited = saved.session.visited;
      session.activeGame = saved.session.activeGame;
      session.rounds = saved.session.rounds;
      bridge.finished = new Set(saved.bridge.finished);
      bridge.presented.clear();
      for (const id of ids) {
        const round = bridge.rounds[id];
        for (const key of Object.keys(fields[id])) {
          if (own(saved.bridge.rounds[id], key)) round[key] = saved.bridge.rounds[id][key];
          else delete round[key];
        }
      }
      const dice = bridge.rounds.dice;
      restoreProvider(dice, saved.bridge.diceProvider);
      restored.add(bridge);
      if (dice.state === 'preparing') {
        dice.state = 'error';
        dice.proof = {state: 'failed', assurance: 'local-replay-only', roundId: dice.id};
        dice.error = '验证记录准备失败，50 模拟积分已退回。';
        dice.refund(50);
      }
      bridge.pulse();
      return true;
    } catch { return false; }
  }
  return Object.freeze({capture, restore});
})();
if (typeof window !== 'undefined') window.PlayroomSession = PlayroomSession;
if (typeof module !== 'undefined') module.exports = PlayroomSession;

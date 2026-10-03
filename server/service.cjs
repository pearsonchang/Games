'use strict';
const {PointsWallet} = require('./wallet.cjs');
const {games} = require('./games.cjs');
const {random: secureRandom} = require('./random.cjs');
class ServiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const actionFields = {
  'mines-start': [], 'mines-reveal': ['index'], 'mines-flag': ['index'], 'mines-collect': [], 'mines-forfeit': [],
  'rocket-launch': [], 'rocket-collect': [], 'dice-roll': ['mode', 'target'], 'plinko-drop': ['lane'], 'horse-start': ['selected']
};
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServiceError(400, '请求格式不正确。');
  if (!['connect', 'sync', 'act'].includes(body.op)) throw new ServiceError(400, '不支持的操作。');
  if (body.op === 'act' && (typeof body.gameId !== 'string' || typeof body.type !== 'string' || !Object.hasOwn(games, body.gameId) || !Object.hasOwn(actionFields, body.type) || !Object.hasOwn(games[body.gameId].actions, body.type))) throw new ServiceError(400, '不支持的游戏操作。');
  const allowed = body.op === 'act' ? ['op', 'gameId', 'type', 'roundId', 'requestId', 'revision', 'knownRounds', ...(actionFields[body.type] || [])] : ['op', 'knownRounds'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ServiceError(400, '不接受客户端提交的积分或结果。');
  if (body.knownRounds !== undefined && (!body.knownRounds || typeof body.knownRounds !== 'object' || Array.isArray(body.knownRounds) || Object.keys(body.knownRounds).some(key => !Object.hasOwn(games, key) || typeof body.knownRounds[key] !== 'string' || body.knownRounds[key].length > 80))) throw new ServiceError(400, '轮次格式不正确。');
  if (body.op !== 'act') return;
  if (!Object.hasOwn(games, body.gameId) || !Object.hasOwn(games[body.gameId].actions, body.type)) throw new ServiceError(400, '不支持的游戏操作。');
  if (typeof body.roundId !== 'string' || body.roundId.length > 80 || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId)) throw new ServiceError(400, '操作标识不正确。');
  if (body.gameId === 'minesweeper' && (!Number.isSafeInteger(body.revision) || body.revision < 0)) throw new ServiceError(400, '棋盘版本不正确。');
  if (['mines-reveal', 'mines-flag'].includes(body.type) && (!Number.isInteger(body.index) || body.index < 0 || body.index > 53)) throw new ServiceError(400, '格子位置不正确。');
  if (body.type === 'plinko-drop' && (!Number.isInteger(body.lane) || body.lane < 0 || body.lane > 4)) throw new ServiceError(400, '入口不正确。');
  if (body.type === 'horse-start' && (!Number.isInteger(body.selected) || body.selected < 0 || body.selected > 3)) throw new ServiceError(400, '赛马选择不正确。');
  if (body.type === 'dice-roll' && !((body.mode === 'size' && ['small', 'big'].includes(body.target)) || (body.mode === 'sum' && Number.isInteger(body.target) && body.target >= 3 && body.target <= 18) || (body.mode === 'triple' && body.target === null))) throw new ServiceError(400, '骰子模式不正确。');
}
function initialState() {
  return {schema: 1, version: 0, wallet: new PointsWallet().export(), games: {}, history: [], receipts: []};
}
function evolve(stored, body, {now = Date.now(), random = secureRandom} = {}) {
  validate(body);
  const data = structuredClone(stored);
  if (data.schema !== 1) throw new Error('Unsupported session schema');
  const clock = () => new Date(now).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore'});
  const wallet = PointsWallet.restore(data.wallet, clock);
  const rounds = {};
  for (const [gameId, definition] of Object.entries(games)) {
    const round = new definition.Engine({now: () => now, random,
      charge: amount => wallet.charge(amount, definition.debit, `${gameId}:${round.counter + 1}:debit`),
      credit: amount => wallet.credit(amount, definition.credit, `${gameId}:${round.id}:credit`),
      onFinish: result => {
        if (data.history.some(entry => entry.gameId === gameId && entry.id === result.id)) return;
        if (!result.amount && definition.loss) wallet.credit(0, definition.loss(result), `${gameId}:${result.id}:loss`);
        data.history.push({...result, time: clock()});
        data.history = data.history.slice(-100);
      }
    });
    if (data.games[gameId]) Object.assign(round, data.games[gameId]);
    rounds[gameId] = round;
    round.tick?.();
  }
  let action;
  if (body.op === 'act') {
    const signature = JSON.stringify(Object.fromEntries(Object.entries(body).filter(([key]) => !['knownRounds', 'requestId'].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
    const receipt = data.receipts.find(item => item.id === body.requestId);
    if (receipt && receipt.signature !== signature) throw new ServiceError(409, '操作标识已被使用，请刷新状态。');
    if (receipt) action = receipt.action;
    else {
      const round = rounds[body.gameId];
      const current = round.id === body.roundId && (body.gameId !== 'minesweeper' || round.revision === body.revision);
      const ok = current && games[body.gameId].actions[body.type](round, body);
      action = {gameId: body.gameId, requestId: body.requestId, ok: !!ok, ...(!ok ? {message: wallet.points < 50 ? '积分不足，本局需要 50 积分。' : '本次操作未生效，已同步当前游戏状态。'} : {})};
      data.receipts.push({id: body.requestId, signature, action});
      data.receipts = data.receipts.slice(-100);
    }
  }
  // Only explicit public snapshots cross the trust boundary, never serialized engines.
  const snapshots = Object.fromEntries(Object.entries(rounds).map(([id, round]) => [id, round.snapshot(wallet.points, body.knownRounds?.[id] !== round.id)]));
  for (const [id, round] of Object.entries(rounds)) data.games[id] = Object.fromEntries(Object.entries(round).filter(([, value]) => typeof value !== 'function'));
  data.wallet = wallet.export();
  const changed = JSON.stringify(data) !== JSON.stringify(stored);
  if (changed) data.version++;
  return {data, changed, response: {version: data.version, points: wallet.points, ledger: wallet.ledger.slice(-100), rounds: data.history, games: snapshots, ...(action ? {action} : {})}};
}
async function transact(store, key, body, options = {}) {
  validate(body);
  for (let attempt = 0; attempt < 8; attempt++) {
    const stored = await store.read(key);
    if (!stored) throw new ServiceError(401, '体验会话已过期，请刷新页面重新连接。');
    const result = evolve(stored, body, {now: options.clock?.() ?? Date.now(), random: options.random});
    if (!result.changed || await store.compareAndSwap(key, stored.version, result.data)) return result.response;
  }
  throw new ServiceError(409, '操作较多，请稍后重试。');
}
module.exports = {initialState, evolve, transact, validate, ServiceError};

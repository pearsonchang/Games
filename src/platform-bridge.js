'use strict';

// The parent owns rounds and points. Frames submit intents, never reward amounts.
class GameBridge {
  constructor({engines, frames, loadedGames, wallet, origin, onFinish, onReturn, onUpdate, fairnessProviders = {}}) {
    Object.assign(this, {frames, loadedGames, wallet, origin, onFinish, onReturn, onUpdate});
    this.rounds = {};
    this.finished = new Set();
    this.presented = new Map();
    this.definitions = {
      minesweeper: {prefix: 'mines', debit: '金币扫雷 · 开局消耗', credit: '金币扫雷 · 主动收取', loss: r => r.state === 'forfeited' ? '金币扫雷 · 结束本局' : '金币扫雷 · 踩雷，奖励归零',
        actions: {'mines-start': (r, d) => r.start(d.roundId), 'mines-reveal': (r, d) => r.reveal(d.index, d.roundId), 'mines-flag': (r, d) => r.flag(d.index, d.roundId), 'mines-collect': (r, d) => r.collect(d.roundId), 'mines-forfeit': (r, d) => r.forfeit(d.roundId)}},
      rocket: {prefix: 'rocket', debit: '小火箭 · 发射消耗', credit: '小火箭 · 主动收取', loss: () => '小火箭 · 坠毁，奖励归零',
        actions: {'rocket-launch': r => r.start(), 'rocket-collect': r => r.collect()}},
      dice: {prefix: 'dice', debit: '三骰挑战 · 掷骰消耗', credit: '三骰挑战 · 命中奖励', loss: () => '三骰挑战 · 未命中',
        actions: {'dice-roll': (r, d) => r.start(d.mode, d.target)}},
      plinko: {prefix: 'plinko', debit: '闪电跑道 · 落球消耗', credit: '闪电跑道 · 落袋奖励',
        actions: {'plinko-drop': (r, d) => r.start(d.lane)}},
      slots: {prefix: 'slots', debit: '星际老虎机 · 转动消耗', credit: '星际老虎机 · 转轴奖励', loss: () => '星际老虎机 · 未命中',
        actions: {'slots-spin': (r, d) => r.start(d.roundId)}},
      matrix: {prefix: 'matrix', debit: '星际矩阵 · 转动消耗', credit: '星际矩阵 · 连线奖励', loss: () => '星际矩阵 · 未命中',
        actions: {'matrix-spin': (r, d) => r.start(d.roundId)}},
      '2048': {prefix: '2048', debit: '星际 2048 · 挑战入场', credit: '星际 2048 · 数字奖励', loss: r=>r.reason==='abandoned'?'星际 2048 · 放弃本局，奖励 0':'星际 2048 · 未达奖励档，到账 0', actions: {
        '2048-start': (r,d)=>r.start(d.roundId),
        '2048-move': (r,d)=>r.move(d.direction,d.roundId,d.revision),
        '2048-restart': (r,d)=>r.restart(d.roundId,d.revision)
      }},
      blocks: {prefix: 'blocks', debit: '星际方块 · 挑战入场', credit: '星际方块 · 得分奖励', loss: r=>r.reason==='abandoned'?'星际方块 · 放弃本局，奖励 0':'星际方块 · 未达奖励档，到账 0', actions: {
        'blocks-start': (r,d) => r.start(d.roundId),
        'blocks-place': (r,d) => r.place(d.slot,d.row,d.col,d.roundId,d.revision),
        'blocks-restart': (r,d) => r.restart(d.roundId,d.revision)
      }},
      horse: {prefix: 'horse', debit: '星际赛马 · 参赛消耗', credit: '星际赛马 · 名次奖励', loss: () => '星际赛马 · 第 4 名，奖励 0',
        actions: {'horse-start': (r, d) => r.start(d.selected, d.roundId)}}
    };
    for (const [gameId, Engine] of Object.entries(engines)) {
      const definition = this.definitions[gameId];
      const round = new Engine({
        fairness: fairnessProviders[gameId],
        // Engines increment their counter only after a successful charge.
        charge: amount => wallet.charge(amount, definition.debit, `${gameId}:${round.counter + 1}:debit`),
        credit: amount => wallet.credit(amount, definition.credit, `${gameId}:${round.id}:credit`),
        refund: amount => wallet.credit(amount, `${definition.prefix} · 验证准备失败，退回投入`, `${gameId}:${round.id}:refund`),
        onStateChange: () => { this.sync(gameId, true); this.onUpdate?.(); },
        onFinish: result => {
          const key = `${gameId}:${result.id}`;
          if (this.finished.has(key)) return;
          this.finished.add(key);
          if (!result.amount && definition.loss) wallet.credit(0, definition.loss(result), `${key}:loss`);
          this.onFinish?.(result);
        }
      });
      this.rounds[gameId] = round;
    }
  }

  post(gameId, data) { this.frames[gameId]?.contentWindow?.postMessage(data, this.origin); }
  sync(gameId, full = false) {
    if (!this.loadedGames.has(gameId)) return;
    const round = this.rounds[gameId];
    // Settle before reading the balance passed to the snapshot.
    round.tick?.();
    const snapshot = round.snapshot(this.wallet.points, full);
    // A full Plinko snapshot includes its large path only on entry/action.
    // Compare public state independently of that optional presentation data.
    const key = JSON.stringify({...snapshot, path: undefined});
    if (!full && this.presented.get(gameId)?.key === key) return;
    this.presented.set(gameId, {key, balance: snapshot.balance, state: snapshot.state, roundId: snapshot.roundId});
    this.post(gameId, snapshot);
  }
  pulse(activeGame = null) {
    // Time-based rounds must still settle offscreen. Their hidden frames do
    // not need snapshots, DOM updates, or a stream of postMessage events.
    for (const gameId of this.loadedGames) this.rounds[gameId]?.tick?.();
    if (!this.loadedGames.has(activeGame)) return;
    const round = this.rounds[activeGame], previous = this.presented.get(activeGame);
    const live = ['flying', 'rolling', 'dropping', 'racing', 'spinning'].includes(round.state);
    if (live || !previous || previous.balance !== this.wallet.points || previous.state !== round.state || previous.roundId !== round.id) this.sync(activeGame);
  }
  handle(event) {
    const data = event.data;
    if (event.origin !== this.origin || !data || typeof data !== 'object' || Array.isArray(data) || typeof data.type !== 'string') return;
    const gameId = Object.keys(this.rounds).find(id => this.frames[id]?.contentWindow === event.source);
    if (!gameId || !this.loadedGames.has(gameId)) return;
    if (data.type === 'game-return') { this.onReturn?.(); return; }
    const definition = this.definitions[gameId];
    if (data.type === `${definition.prefix}-ready`) { this.sync(gameId, true); return; }
    if (!Object.hasOwn(definition.actions, data.type)) return;
    const round = this.rounds[gameId];
    const current = typeof data.roundId === 'string' && data.roundId === round.id;
    const ok = current && definition.actions[data.type](round, data);
    if (!ok) this.post(gameId, {
      type: `${definition.prefix}-error`,
      message: this.wallet.points < (round.cost ?? 50) ? '积分不足，本局需要 50 积分。' : '本次操作未生效，请查看当前游戏状态。'
    });
    this.sync(gameId, true);
    this.onUpdate?.();
  }
}
if (typeof module !== 'undefined') module.exports = {GameBridge};

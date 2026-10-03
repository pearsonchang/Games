'use strict';
const {MinesRound} = require('./engines/mines.cjs');
const {RocketRound} = require('./engines/rocket.cjs');
const {DiceRound} = require('./engines/dice.cjs');
const {PlinkoRound} = require('./engines/plinko.cjs');
const {HorseRound} = require('./engines/horse.cjs');
const games = {
  minesweeper: {Engine: MinesRound, prefix: 'mines', debit: '金币扫雷 · 开局消耗', credit: '金币扫雷 · 主动收取', loss: r => r.state === 'forfeited' ? '金币扫雷 · 结束本局' : '金币扫雷 · 踩雷，奖励归零',
    actions: {'mines-start': (r, d) => r.start(d.roundId), 'mines-reveal': (r, d) => r.reveal(d.index, d.roundId), 'mines-flag': (r, d) => r.flag(d.index, d.roundId), 'mines-collect': (r, d) => r.collect(d.roundId), 'mines-forfeit': (r, d) => r.forfeit(d.roundId)}},
  rocket: {Engine: RocketRound, prefix: 'rocket', debit: '小火箭 · 发射消耗', credit: '小火箭 · 主动收取', loss: () => '小火箭 · 坠毁，奖励归零',
    actions: {'rocket-launch': r => r.start(), 'rocket-collect': r => r.collect()}},
  dice: {Engine: DiceRound, prefix: 'dice', debit: '三骰挑战 · 掷骰消耗', credit: '三骰挑战 · 命中奖励', loss: () => '三骰挑战 · 未命中',
    actions: {'dice-roll': (r, d) => r.start(d.mode, d.target)}},
  plinko: {Engine: PlinkoRound, prefix: 'plinko', debit: '闪电跑道 · 落球消耗', credit: '闪电跑道 · 落袋奖励',
    actions: {'plinko-drop': (r, d) => r.start(d.lane)}},
  horse: {Engine: HorseRound, prefix: 'horse', debit: '星际赛马 · 参赛消耗', credit: '星际赛马 · 名次奖励', loss: () => '星际赛马 · 第 4 名，奖励 0',
    actions: {'horse-start': (r, d) => r.start(d.selected, d.roundId)}}
};
module.exports = {games};

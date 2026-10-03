'use strict';
const catalog=[
{id:'minesweeper',name:'金币扫雷',category:'概率',description:'逐格翻开奖励，踩雷前主动收取',cost:'50 积分 / 局',cover:'sweep-cover',available:true},
{id:'rocket',name:'小火箭',category:'反应',description:'飞得越久奖励越高，坠毁前收取',cost:'50 积分 / 局',cover:'cover-rocket',available:true},
{id:'dice',name:'三骰挑战',category:'概率',description:'选定模式，掷出你的幸运组合',cost:'50 积分 / 局',cover:'cover-dice',available:true},
{id:'plinko',name:'闪电跑道',category:'概率',description:'选择落球入口，落袋揭晓奖励',cost:'50 积分 / 局',cover:'cover-plinko',available:true},
{id:'horse',name:'星际赛马',category:'概率',description:'选择你的赛马，冲线揭晓名次奖励',cost:'50 积分 / 局',cover:'cover-horse',available:true},
{id:'2048',name:'2048',category:'益智'},
{id:'memory',name:'记忆翻牌',category:'益智'},
{id:'rhythm',name:'节奏点击',category:'反应'}];

function gameName(id) { return catalog.find(game => game.id === id)?.name || '游戏'; }
const gameRoutes = {
  minesweeper: 'minesweeper.html', rocket: 'rocket.html', dice: 'dice.html',
  plinko: 'plinko.html', horse: 'horse.html'
};

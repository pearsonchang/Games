'use strict';
const catalog=[
{id:'minesweeper',name:'金币扫雷',category:'主动收取',tag:'寻宝探险',description:'逐格发现宝藏，决定何时收取',cost:'50 积分 / 局',cover:'sweep-cover',available:true},
{id:'rocket',name:'小火箭',category:'主动收取',tag:'太空飞行',description:'看火箭升空，在坠毁前收取',cost:'50 积分 / 局',cover:'cover-rocket',available:true},
{id:'dice',name:'三骰挑战',category:'掷骰与转轴',tag:'多种模式',description:'选择一种模式，揭晓三骰组合',cost:'50 积分 / 局',cover:'cover-dice',available:true},
{id:'plinko',name:'闪电跑道',category:'竞速与弹珠',tag:'碰撞弹珠',description:'选好落球入口，看弹珠一路碰撞',cost:'50 积分 / 局',cover:'cover-plinko',available:true},
{id:'horse',name:'星际赛马',category:'竞速与弹珠',tag:'选马观赛',description:'选一匹小马，见证冲线时刻',cost:'50 积分 / 局',cover:'cover-horse',available:true},
{id:'slots',name:'星际老虎机',category:'掷骰与转轴',tag:'经典三列',description:'转动星际图案，揭晓三连组合',cost:'50 积分 / 局',cover:'cover-slots',available:true},
{id:'matrix',name:'星际矩阵',category:'掷骰与转轴',tag:'多列老虎机',description:'五列三行，连接你的星际图案',cost:'50 积分 / 局',cover:'cover-matrix',available:true},
{id:'blocks',name:'星际方块',category:'益智消除',tag:'方块消除',description:'30 步拼出高分，解锁积分奖励',cost:'50 积分 / 局',cover:'cover-blocks',available:true},
{id:'2048',name:'星际 2048',category:'益智消除',tag:'数字合并',description:'滑动合并数字，向 2048 进发',cost:'50 积分 / 局',cover:'cover-2048',available:true},
{id:'memory',name:'记忆翻牌',category:'益智'},
{id:'rhythm',name:'节奏点击',category:'反应'}];

function gameName(id) { return catalog.find(game => game.id === id)?.name || '游戏'; }
const gameRoutes = {
  minesweeper: 'minesweeper.html', rocket: 'rocket.html', dice: 'dice.html',
  plinko: 'plinko.html', horse: 'horse.html', slots: 'slots.html', matrix: 'matrix.html', blocks: 'blocks.html', '2048': '2048.html'
};

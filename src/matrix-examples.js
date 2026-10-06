'use strict';
// Fixed teaching boards use the production evaluator and never consume game RNG.
const matrixBase=()=>[[0,1,2],[1,2,3],[2,3,0],[3,0,1],[0,1,2]];
const MATRIX_EXAMPLES=[
 {name:'直线三连',focus:1,detail:'上轨从左侧起三个环星：5 × 5 = 25 积分。返还少于投入，净收益仍为负。',board:[[0,1,2],[0,2,3],[0,3,1],[1,0,2],[2,1,0]]},
 {name:'V 形五连',focus:3,detail:'沿 V 形路径，五个星晶连续相连：5 × 22 = 110 积分。',board:(()=>{const b=matrixBase();[0,1,2,1,0].forEach((r,c)=>b[c][r]=2);b[0][2]=0;b[4][2]=0;return b;})()},
 {name:'百搭补线',focus:1,detail:'百搭替代卫星形成五连：5 × 25 = 125 积分。百搭不能替代徽章。',board:(()=>{const b=matrixBase();[3,4,3,4,3].forEach((v,c)=>b[c][0]=v);b[2][1]=0;return b;})()},
 {name:'徽章奖励',focus:'bonus',detail:'三个徽章无需连线，任意位置都计数，额外获得 100 积分。',board:(()=>{const b=matrixBase();b[0][2]=5;b[2][0]=5;b[4][1]=5;return b;})()},
 {name:'多线叠加',focus:3,detail:'前面三列全是环星：10 条线各奖励 25 积分，合计返还 250 积分。',board:[[0,0,0],[0,0,0],[0,0,0],[1,1,1],[2,2,2]]},
 {name:'三连回本',focus:1,detail:'上轨三个星晶：5 × 10 = 50 积分，正好覆盖本局投入，净收益为 0。',board:[[2,1,0],[2,0,3],[2,3,1],[1,0,2],[0,1,3]]}
];
if(typeof module!=='undefined')module.exports={MATRIX_EXAMPLES};

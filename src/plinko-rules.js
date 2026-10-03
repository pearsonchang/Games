'use strict';
const PLINKO_MULT=[8,3,1,.5,.2,.5,1,3,8];
const PLINKO_LANES=[150,250,350,450,550];
const PLINKO_DROP_Y=40;
const PLINKO_BALL_RADIUS=8.5,PLINKO_PEG_RADIUS=6;
// Integrate a normal curve over the nine finite pockets, then normalize its tails.
const PLINKO_NORMAL=Object.freeze({mean:4,sigma:1.5});
function plinkoNormalCdf(x){
 const sign=x<0?-1:1,z=Math.abs(x)/Math.SQRT2,t=1/(1+.3275911*z);
 const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-z*z);
 return (1+sign*erf)/2;
}
const PLINKO_PROBS=Object.freeze((()=>{
 const {mean,sigma}=PLINKO_NORMAL;
 const mass=PLINKO_MULT.map((_,i)=>plinkoNormalCdf((i+.5-mean)/sigma)-plinkoNormalCdf((i-.5-mean)/sigma));
 const total=mass.reduce((a,b)=>a+b,0);return mass.map(p=>p/total);
})());
const PLINKO_PEGS=Array.from({length:9},(_,row)=>{
 const count=row%2?10:9,start=350-(count-1)*25;
 return Array.from({length:count},(_,column)=>({x:start+column*50,y:92+row*47}));
}).flat();
function plinkoBallAt(path,time,lane,preview=false){
 if(preview||!path)return {ball:[0,PLINKO_LANES[lane],PLINKO_DROP_Y],index:0,time:0};
 time=Math.max(0,Math.min(time,path.duration/1000));
 let low=0,high=path.frames.length-1;
 while(low<high){const mid=Math.ceil((low+high)/2);if(path.frames[mid][0]<=time)low=mid;else high=mid-1;}
 const a=path.frames[low],b=path.frames[Math.min(low+1,path.frames.length-1)],t=b[0]>a[0]?(time-a[0])/(b[0]-a[0]):0;
 return {ball:[time,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],index:low,time};
}

'use strict';
const PLINKO_MULT=[8,3,1,.5,.2,.5,1,3,8];
const PLINKO_LANES=[150,250,350,450,550];
const PLINKO_DROP_Y=40;
const PLINKO_BALL_RADIUS=8.5,PLINKO_PEG_RADIUS=6;
// Both staggered rows share the board centre; entry 5 now meets the same field as entry 1.
const PLINKO_PEGS=Array.from({length:9},(_,row)=>{
 const count=row%2?10:9,start=350-(count-1)*25;
 return Array.from({length:count},(_,column)=>({x:start+column*50,y:92+row*47}));
}).flat();
function plinkoPath(lane,random=Math.random){
 let x=PLINKO_LANES[lane],y=PLINKO_DROP_Y,vx=(random()-.5)*76,vy=45,time=0;
 const frames=[[0,x,y,-1,0,0,0]],dt=1/180,contact=PLINKO_BALL_RADIUS+PLINKO_PEG_RADIUS;
 const left=32,right=668;
 for(let step=0;step<3600&&y<548;step++){
  time+=dt;vy+=1000*dt;x+=vx*dt;y+=vy*dt;
  let hit=-1,strength=0,nx=0,ny=0;
  if(x<left){x=left;strength=Math.min(1,Math.abs(vx)/360);vx=Math.abs(vx)*.82;hit=-2;nx=1;}
  else if(x>right){x=right;strength=Math.min(1,Math.abs(vx)/360);vx=-Math.abs(vx)*.82;hit=-3;nx=-1;}
  for(let k=0;k<PLINKO_PEGS.length;k++){
   const peg=PLINKO_PEGS[k],dx=x-peg.x,dy=y-peg.y,d=Math.hypot(dx,dy);
   if(d>=contact)continue;
   const px=d>.0001?dx/d:0,py=d>.0001?dy/d:-1;
   x=peg.x+px*(contact+.05);y=peg.y+py*(contact+.05);
   const approach=vx*px+vy*py;
   if(approach>=0)continue;
   // Springier rebound, with impact strength carried to the renderer and sound.
   const restitution=.76;
   vx-= (1+restitution)*approach*px;vy-= (1+restitution)*approach*py;
   if(Math.abs(vx)<18&&Math.abs(px)<.25)vx=(random()<.5?-1:1)*(32+random()*20);
   hit=k;strength=Math.max(.15,Math.min(1,-approach/360));nx=px;ny=py;
  }
  vx*=.999;
  if(y>=548){
   // Sample the real crossing of the pocket line, never jump sideways to a slot centre.
   const previous=frames.at(-1),t=(548-previous[2])/(y-previous[2]);
   x=previous[1]+(x-previous[1])*t;time=previous[0]+(time-previous[0])*t;y=548;
  }
  if(step%2===0||hit!==-1||y>=548)frames.push([time,x,y,hit,strength,nx,ny]);
 }
 const slot=Math.max(0,Math.min(8,Math.floor(x/(700/9))));
 return {frames,slot,duration:time*1000};
}
// Preview uses the selected entry even when the previous round still has a saved path.
function plinkoBallAt(path,time,lane,preview=false){
 if(preview||!path)return {ball:[0,PLINKO_LANES[lane],PLINKO_DROP_Y],index:0,time:0};
 time=Math.max(0,Math.min(time,path.duration/1000));
 let low=0,high=path.frames.length-1;
 while(low<high){const mid=Math.ceil((low+high)/2);if(path.frames[mid][0]<=time)low=mid;else high=mid-1;}
 const a=path.frames[low],b=path.frames[Math.min(low+1,path.frames.length-1)],t=b[0]>a[0]?(time-a[0])/(b[0]-a[0]):0;
 return {ball:[time,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],index:low,time};
}
class PlinkoRound{
 constructor({now=()=>Date.now(),random=Math.random,charge,credit,onFinish}={}){Object.assign(this,{now,random,charge,credit,onFinish,state:'idle',counter:0,cost:50,id:'',result:null,path:null});}
 start(lane){if(this.state==='dropping'||!Number.isInteger(lane)||lane<0||lane>=PLINKO_LANES.length)return false;const path=plinkoPath(lane,this.random);if(!this.charge(this.cost))return false;this.path=path;this.lane=lane;this.id='plinko-'+(++this.counter);this.startTime=this.now();this.state='dropping';this.result=null;return true;}
 tick(){if(this.state!=='dropping'||this.now()-this.startTime<this.path.duration)return;this.state='finished';const multiplier=PLINKO_MULT[this.path.slot],amount=Math.floor(this.cost*multiplier);this.result={id:this.id,gameId:'plinko',won:amount>=this.cost,amount,cost:this.cost,multiplier,slot:this.path.slot,seconds:Math.ceil(this.path.duration/1000)};this.credit(amount);this.onFinish?.(this.result);}
 snapshot(balance,includePath=false){return {type:'plinko-state',state:this.state,roundId:this.id,balance,lane:this.lane,elapsed:this.state==='idle'?0:Math.min(this.now()-this.startTime,this.path.duration),result:this.result,...(includePath?{path:this.path}:{})};}
}
if(typeof module!=='undefined')module.exports={PlinkoRound,plinkoPath,plinkoBallAt,PLINKO_MULT,PLINKO_PEGS,PLINKO_LANES,PLINKO_DROP_Y};

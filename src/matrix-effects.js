'use strict';
// Presentation only: consumes settled results, never samples or changes a round.
class MatrixEffects {
 constructor({host,layer,allowed=()=>true,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
  this.host=host;this.layer=layer;this.allowed=allowed;this.schedule=schedule;this.cancel=cancel;this.timers=new Set();
 }
 later(fn,ms){const id=this.schedule(()=>{this.timers.delete(id);fn();},ms);this.timers.add(id);return id;}
 clear(){for(const id of this.timers)this.cancel(id);this.timers.clear();this.layer.replaceChildren();this.host.classList.remove('matrix-fx-active');delete this.host.dataset.fx;}
 node(tag,cls,style='',text=''){
  const node=this.layer.ownerDocument.createElement(tag);node.className=cls;node.style.cssText=style;if(text)node.textContent=text;this.layer.append(node);return node;
 }
 transient(cls,style,life){const node=this.node('i',cls,style);this.later(()=>node.remove(),life);}
 burst(x,y,count,delay=0){
  for(let i=0;i<count;i++){
   const angle=(i*2.39996),distance=28+(i%5)*13;
   this.node('i','matrix-fx-shard'+(i%4===0?' fx-star':''),'--px:'+x+'%;--py:'+y+'%;--dx:'+Math.cos(angle)*distance+'px;--dy:'+Math.sin(angle)*distance+'px;--twist:'+i*63+'deg;--delay:'+(delay+i%3*.045)+'s');
  }
 }
 launch(){
  this.clear();if(!this.allowed())return;
  this.host.dataset.fx='launch';this.host.classList.add('matrix-fx-active');
  this.node('i','matrix-fx-ignition');
  for(let i=0;i<12;i++)this.node('i','matrix-fx-warp','--lane:'+(4+i*8)+'%;--delay:'+i%4*.07+'s;--length:'+(35+i%3*12)+'%');
  this.later(()=>this.clear(),1000);
 }
 land(column){
  if(!this.allowed())return;
  this.transient('matrix-fx-stop','--column:'+column,650);
  for(let i=0;i<4;i++)this.transient('matrix-fx-stop-spark','--px:'+(column*20+10)+'%;--py:'+(20+i*20)+'%;--dx:'+(i%2?38:-38)+'px;--dy:'+(i%2?-18:18)+'px;--delay:'+i*.035+'s',700);
 }
 play(prize){
  this.clear();if(!this.allowed()||prize.amount===0)return;
  const profitable=prize.net>0;
  const kind=!profitable?'return':prize.bonus.amount?'bonus':prize.lines.length>=3?'multi':prize.lines.some(l=>l.count===5)?'five':'line';
  this.host.dataset.fx=kind;this.host.classList.add('matrix-fx-active');
  const duration=profitable?4200:1400;
  const paths=prize.lines.map((line,i)=>{
   const coords=line.cells.map(([c,r])=>(50+c*100)+','+(50+r*100)).join(' ');
   return '<g style="--delay:'+i*.10+'s"><polyline class="fx-wire" points="'+coords+'"/><polyline class="fx-runner" pathLength="100" points="'+coords+'"/></g>';
  }).join('');
  const svg=this.layer.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','matrix-fx-circuit');svg.setAttribute('viewBox','0 0 500 300');svg.setAttribute('preserveAspectRatio','none');svg.innerHTML=paths;this.layer.append(svg);
  const cells=new Map();
  for(const line of prize.lines)for(const cell of line.cells)cells.set(cell.join('-'),cell);
  for(const cell of prize.bonus.cells)if(prize.bonus.amount)cells.set(cell.join('-'),cell);
  let n=0;for(const [c,r] of cells.values()){
   const delay=Math.min(n++*.045,.45),style='--px:'+(10+c*20)+'%;--py:'+(100/6+r*100/3)+'%;--delay:'+delay+'s';
   this.node('i','matrix-fx-node',style);
   if(profitable)this.burst(10+c*20,100/6+r*100/3,kind==='multi'?3:5,delay);
  }
  if(profitable){
   this.node('i','matrix-fx-aura');this.node('i','matrix-fx-sweep');
   for(let i=0;i<3;i++)this.node('i','matrix-fx-ring','--ring:'+i+';--delay:'+i*.22+'s');
   for(let i=0;i<10;i++)this.node('i','matrix-fx-ray','--angle:'+i*36+'deg;--delay:'+i%3*.07+'s');
   const banner=this.node('div','matrix-fx-banner');
   const small=this.layer.ownerDocument.createElement('span'),title=this.layer.ownerDocument.createElement('b');
   small.textContent=kind==='bonus'?'CREST ACTIVATED':kind==='multi'?'MULTILINE COMBO':kind==='five'?'FULL ORBIT':'ORBIT CONNECTED';
   title.textContent=kind==='bonus'?'徽章觉醒':kind==='multi'?prize.lines.length+' 线共振':kind==='five'?'五连跃迁':'星轨命中';banner.append(small,title);
  }
  this.later(()=>this.clear(),duration);
 }
}
if(typeof module!=='undefined'&&module.exports)module.exports={MatrixEffects};

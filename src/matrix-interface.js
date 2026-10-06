'use strict';
// Read only what the round has revealed; spinning decoration is never counted.
function matrixRevealedStatus(snapshot){
 const columns=snapshot.state==='idle'?[null,null,null,null,null]:snapshot.stopped;
 return {landed:columns.map(Boolean),count:columns.filter(Boolean).length,crests:columns.reduce((n,col)=>n+(col?col.filter(value=>value===5).length:0),0)};
}
class MatrixLineTour{
 constructor({select,change=()=>{},allowed=()=>true,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
  Object.assign(this,{select,change,allowed,schedule,cancel,entries:[],index:0,timer:null,running:false});
 }
 notify(){this.change({running:this.running,index:this.index,total:this.entries.length});}
 pause(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.running=false;this.notify();}
 clear(){this.pause();this.entries=[];this.index=0;this.notify();}
 start(entries,{autoplay=true,delay=4400}={}){
  this.clear();this.entries=[...entries];if(!entries.length)return;
  this.select(this.entries[0]);this.running=autoplay&&entries.length>1&&this.allowed();this.notify();
  if(this.running)this.queue(delay);
 }
 queue(delay){this.timer=this.schedule(()=>{
  this.timer=null;if(!this.allowed()){this.pause();return;}
  if(this.index+1>=this.entries.length){this.pause();return;}
  this.index++;this.select(this.entries[this.index]);this.notify();this.queue(1800);
 },delay);}
 choose(entry){this.pause();this.index=this.entries.indexOf(entry);this.select(entry);this.notify();}
 replay(){const entries=[...this.entries];this.start(entries,{delay:1800});}
 toggle(){if(this.running)this.pause();else this.replay();}
}
if(typeof module!=='undefined'&&module.exports)module.exports={matrixRevealedStatus,MatrixLineTour};

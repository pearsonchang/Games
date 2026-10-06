'use strict';
const SLOT_FEEDBACK=Object.freeze({
  return:{label:'返还投入',color:'#91dfd1',secondary:'#bcfff0',particles:0,duration:.85},
  planet:{label:'环星共振',shout:'ORBIT WIN',color:'#ff9fca',secondary:'#87fff0',particles:32,duration:2.4},
  thruster:{label:'推进器点燃',shout:'BOOST!',color:'#6ce9ff',secondary:'#e0ffff',particles:40,duration:2.7},
  crystal:{label:'星晶绽放',shout:'CRYSTAL RUSH',color:'#75ffd0',secondary:'#e0fff5',particles:48,duration:3},
  satellite:{label:'卫星连线',shout:'SIGNAL LOCK',color:'#ffd078',secondary:'#8beeff',particles:56,duration:3.3},
  portal:{label:'跃迁开启',shout:'HYPER WIN',color:'#cba4ff',secondary:'#74eaff',particles:68,duration:3.9},
  crest:{label:'星际大奖',shout:'SUPER NOVA!',color:'#ffcf68',secondary:'#fff4c5',particles:84,duration:4.6},
  miss:{label:'未命中',color:'#8ea5be',secondary:'#aabbd0',particles:0,duration:0}
});
function slotFeedback(result){
  const id=result.kind==='pair'?'return':result.kind==='triple'?SLOT_SYMBOLS[result.values[0]].id:'miss';
  return {id,...SLOT_FEEDBACK[id]};
}
class SlotsEffects {
  constructor({machine,confetti,burst,title,amount,caption,reduced}) {
    Object.assign(this,{machine,confetti,burst,title,amount,caption,reduced,timer:0});
    burst.addEventListener('animationend',e=>{if(e.target===burst&&e.animationName==='reward-burst')this.clear();});
  }
  clear(){
    clearTimeout(this.timer);this.timer=0;this.machine.classList.remove('celebrating','returning');this.confetti.replaceChildren();
  }
  show(result,{preview=false}={}) {
    this.clear();const fx=slotFeedback(result);
    this.machine.dataset.reward=fx.id;
    this.machine.style.setProperty('--reward-color',fx.color);this.machine.style.setProperty('--reward-secondary',fx.secondary);this.machine.style.setProperty('--reward-duration',fx.duration+'s');
    this.machine.style.setProperty('--reward-shout','"'+(fx.shout||'')+'"');
    this.title.textContent=fx.label+(preview?' · 效果预览':' · '+result.multiplier+'×');
    this.amount.textContent=preview?result.multiplier+'×':'+'+result.amount.toLocaleString('zh-CN');
    this.caption.textContent=preview?'预览不扣分，不发放积分':fx.id==='return'?'返还本局投入 · 净收益 0':'模拟积分到账';
    if(fx.id==='miss'||this.reduced.matches||document.hidden)return;
    // Commit the cleared state so replaying the same combination restarts its animation.
    void this.machine.offsetWidth;
    this.machine.classList.add(fx.id==='return'?'returning':'celebrating');
    for(let i=0;i<fx.particles;i++){
      const bit=document.createElement('i'),a=Math.PI*2*i/fx.particles;
      let x=Math.cos(a)*(160+i%4*38),y=Math.sin(a)*(165+i%3*30)-45;
      if(fx.id==='thruster'){x=(i%9-4)*30;y=-130-(i%5)*38;}
      if(fx.id==='satellite'){x=(i%2?1:-1)*(100+i%4*40);y=(i%7-3)*48;}
      bit.className='spark-'+(fx.id==='crystal'?'shard':fx.id==='thruster'?'trail':fx.id==='satellite'?'signal':fx.id==='crest'&&i%2===0?'coin':i%3===0?'star':'chip');
      // Two short volleys keep a visible finale without a permanent emitter.
      const delay=i%4*.035+(i>=fx.particles/2?.42:0);
      bit.style.cssText='--color:'+(i%3?fx.color:fx.secondary)+';--x:'+x+'px;--y:'+y+'px;--r:'+i*47+'deg;--size:'+(0.75+i%5*.15)+';--delay:'+delay+'s';
      bit.addEventListener('animationend',()=>bit.remove(),{once:true});this.confetti.append(bit);
    }
    this.timer=setTimeout(()=>this.clear(),Math.ceil(fx.duration*1000)+100);
  }
}
if(typeof module!=='undefined')module.exports={SLOT_FEEDBACK,slotFeedback,SlotsEffects};

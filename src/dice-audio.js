'use strict';
class DiceAudio{
 constructor(){this.enabled=true;this.active=false;this.timer=0;this.nodes=new Set();}
 unlock(){this.active=true;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.ctx??=new Audio();if(!this.master){this.master=this.ctx.createGain();this.master.gain.value=.16;this.master.connect(this.ctx.destination)}this.ctx.resume().catch(()=>{});}catch{}}
 tone(hz,duration=.07,delay=0,type='sine',volume=1){if(!this.enabled||!this.active||document.hidden||!this.ctx||this.ctx.state!=='running')return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*.72,t+duration);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.006);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);this.nodes.add(o);o.onended=()=>{o.disconnect();g.disconnect();this.nodes.delete(o)};o.start(t);o.stop(t+duration+.02);}
 roll(){this.stop();let n=0;this.tone(430,.09,0,'triangle',.5);this.timer=setInterval(()=>{this.tone(260+(n++%4)*80,.045,0,'triangle',.3)},105);}
 stop(){clearInterval(this.timer);this.timer=0;for(const n of this.nodes){try{n.stop()}catch{}}this.nodes.clear();}
 land(i){this.tone(180+i*35,.085,0,'triangle',.65);}
 result(won){if(won)[660,830,990].forEach((f,i)=>this.tone(f,.18,i*.09,'sine',.45));else this.tone(210,.13,0,'sine',.22);}
 toggle(){this.enabled=!this.enabled;this.stop();if(this.master)this.master.gain.value=this.enabled?.16:0;return this.enabled;}
 leave(){this.active=false;this.stop();}
}

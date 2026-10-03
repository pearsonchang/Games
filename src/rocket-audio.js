'use strict';
class RocketAudio extends DiceAudio{
 enginePower(power){if(!this.enabled||!this.active||document.hidden||!this.ctx||this.ctx.state!=='running'){this.stopEngine();return}if(!this.engine){const noise=this.ctx.createBufferSource(),buffer=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;noise.buffer=buffer;noise.loop=true;const filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();filter.type='lowpass';filter.frequency.value=400;gain.gain.value=0;noise.connect(filter);filter.connect(gain);gain.connect(this.master);noise.start();this.engine={noise,filter,gain};}const t=this.ctx.currentTime,p=Math.max(0,Math.min(1,power));this.engine.gain.gain.setTargetAtTime(.12+.32*p,t,.09);this.engine.filter.frequency.setTargetAtTime(180+850*p,t,.1);}
 stopEngine(){if(!this.engine)return;const {noise,filter,gain}=this.engine;this.engine=null;try{noise.stop()}catch{}noise.disconnect();filter.disconnect();gain.disconnect();}
 stop(){this.stopEngine();super.stop();}
 ignition(){this.tone(140,.2,0,'triangle',.38);this.tone(280,.2,.08,'sine',.25)}
 collect(){this.stop();[587,784,1175].forEach((f,i)=>this.tone(f,.19,i*.085,'sine',.45))}
 crash(){this.stop();this.tone(95,.45,0,'triangle',.8);this.tone(48,.5,.05,'sine',.65);this.tone(210,.1,0,'sawtooth',.15)}
}
const rocketAudio=new RocketAudio();

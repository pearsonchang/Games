'use strict';
// A finite arcade sound bank: mechanical hits, synth fanfares and spatial coin showers.
// Audio randomness is local; it never consumes the game's random-number stream.
class SlotsAudio {
  constructor({contextFactory=null,hidden=()=>document.hidden}={}) {
    this.enabled=true;this.active=false;this.voices=new Map();this.contextFactory=contextFactory;this.hidden=hidden;
  }
  unlock() {
    this.active=true;
    try {
      if(!this.ctx){
        const Audio=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);
        this.ctx=this.contextFactory?this.contextFactory():Audio?new Audio():null;
        if(!this.ctx)return;
        const c=this.ctx;
        this.master=c.createGain();this.master.gain.value=.32;
        this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=10;this.limiter.ratio.value=8;this.limiter.attack.value=.003;this.limiter.release.value=.16;
        this.master.connect(this.limiter);this.limiter.connect(c.destination);
        this.delay=c.createDelay(.5);this.delay.delayTime.value=.14;
        this.wet=c.createGain();this.wet.gain.value=.19;
        this.lowpass=c.createBiquadFilter();this.lowpass.type='lowpass';this.lowpass.frequency.value=2400;
        this.delay.connect(this.lowpass);this.lowpass.connect(this.wet);this.wet.connect(this.master);
        this.noise=c.createBuffer(1,Math.ceil(c.sampleRate*.4),c.sampleRate);
        const samples=this.noise.getChannelData(0);let seed=12983;
        for(let i=0;i<samples.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;samples[i]=(seed>>>0)/2147483648-1;}
      }
      this.ctx.resume()?.catch(()=>{});
    } catch {this.stop();}
  }
  ready(){return this.enabled&&this.active&&!this.hidden()&&this.ctx&&this.master&&this.ctx.state!=='closed';}
  voice({hz=440,end=hz,duration=.2,delay=0,gain=.15,type='sine',pan=0,echo=false,noise=false,cutoff=null,endCutoff=cutoff,filterType='lowpass',attack=.008,hold=0}={}) {
    if(!this.ready())return;
    const c=this.ctx,t=c.currentTime+delay,source=noise?c.createBufferSource():c.createOscillator(),amp=c.createGain(),nodes=[amp];
    if(noise){source.buffer=this.noise;source.loop=true;}
    else {source.type=type;source.frequency.setValueAtTime(hz,t);source.frequency.exponentialRampToValueAtTime(end,t+duration);}
    if(noise||cutoff!==null){
      const filter=c.createBiquadFilter();filter.type=noise?'bandpass':filterType;filter.Q.value=.8;
      filter.frequency.setValueAtTime(cutoff??1600,t);filter.frequency.exponentialRampToValueAtTime(endCutoff??cutoff??1600,t+duration);
      source.connect(filter);filter.connect(amp);nodes.push(filter);
    }else source.connect(amp);
    const attackEnd=t+Math.min(attack,duration*.3),holdEnd=Math.min(t+duration*.7,attackEnd+hold);
    amp.gain.setValueAtTime(.0001,t);amp.gain.exponentialRampToValueAtTime(gain,attackEnd);
    if(hold>0)amp.gain.setValueAtTime(gain,holdEnd);
    amp.gain.exponentialRampToValueAtTime(.0001,t+duration);
    let out=amp;
    if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;amp.connect(p);nodes.push(p);out=p;}
    out.connect(this.master);if(echo)out.connect(this.delay);
    this.voices.set(source,{amp,nodes});
    source.onended=()=>{source.disconnect();nodes.forEach(n=>n.disconnect());this.voices.delete(source);};
    source.start(t);source.stop(t+duration+.025);
  }
  chime(hz,delay=0,duration=.38,gain=.17,pan=0) {
    this.voice({hz,delay,duration,gain,pan,echo:true,hold:.025});
    this.voice({hz:hz*2.01,delay,duration:duration*.48,gain:gain*.25,pan,echo:true});
    this.voice({hz:hz*3.02,delay,duration:duration*.23,gain:gain*.08,pan});
  }
  impact(delay=0,strength=1) {
    this.voice({hz:155,end:48,delay,duration:.38,gain:.52*strength});
    this.voice({hz:240,end:95,delay,duration:.12,gain:.17*strength,type:'triangle'});
    this.voice({noise:true,delay,duration:.085,gain:.20*strength,cutoff:2300,endCutoff:650});
  }
  lead(hz,delay,duration=.3,gain=.19,pan=0) {
    this.voice({hz,delay,duration,gain,type:'triangle',pan,hold:.07,echo:true});
    this.voice({hz:hz*.997,delay,duration,gain:gain*.55,type:'sawtooth',cutoff:2800,endCutoff:1000,pan,hold:.035,echo:true});
  }
  chord(delay,duration=.6,gain=.10) {
    [293.66,369.99,440,587.33].forEach((hz,i)=>this.voice({hz,delay,duration,gain,type:'sawtooth',cutoff:1800,endCutoff:600,pan:(i-1.5)*.28,attack:.02,hold:duration*.28,echo:true}));
  }
  sparkle(notes,delay,step=.09,gain=.13) {
    notes.forEach((hz,i)=>this.chime(hz,delay+i*step,.48,gain,(i%2?1:-1)*(.3+i%3*.15)));
  }
  whoosh(delay,duration=.5,strength=1,reverse=false) {
    this.voice({noise:true,delay,duration,gain:.16*strength,cutoff:reverse?4800:350,endCutoff:reverse?400:4200,attack:duration*.28,hold:duration*.18,echo:true});
  }
  roll(elapsed=0) {
    this.stop();if(!this.ready())return;
    const offset=Math.max(0,elapsed/1000),remaining=2.4-offset;if(remaining<=0)return;
    if(offset<.1){this.impact(0,.28);this.voice({hz:110,end:440,duration:.25,gain:.13,type:'triangle'});}
    this.voice({hz:85,end:145,duration:remaining,gain:.055,hold:remaining*.4});
    for(let n=0;n<32;n++){
      const at=n*.074;if(at<offset||at>=2.4)continue;
      this.voice({noise:true,delay:at-offset,duration:.024,gain:n%4===0?.19:.12,cutoff:1500+(n%3)*400,pan:(n%3-1)*.35});
      if(n%4===0)this.voice({hz:220+(n%3)*55,delay:at-offset,duration:.055,gain:.065,type:'triangle',pan:(n%3-1)*.35});
    }
  }
  land(index) {
    this.impact(0,.36+index*.12);
    this.chime([293.66,369.99,440][index],.015,.20,.20,(index-1)*.55);
  }
  result(cue) {
    this.stop();if(!this.ready())return;
    if(cue==='miss'){this.voice({hz:220,end:110,duration:.25,gain:.13,type:'triangle'});return;}
    if(cue==='return'){this.chime(440,0,.2,.12,-.15);this.chime(587.33,.10,.28,.13,.15);return;}
    const phrases={
      planet:[293.66,369.99,440,587.33,739.99,587.33],
      thruster:[293.66,440,587.33,739.99,880,1174.66,1479.98,1174.66],
      crystal:[587.33,880,739.99,1174.66,880,1479.98,1174.66,1760],
      satellite:[369.99,369.99,587.33,440,440,739.99,880,1174.66],
      portal:[293.66,369.99,440,587.33,739.99,880,1174.66,1479.98,1760]
    };
    if(cue==='crest'){this.jackpot();return;}
    const notes=phrases[cue];if(!notes)return;
    const step=cue==='portal'?.115:cue==='satellite'?.115:cue==='thruster'?.07:.085;
    this.impact(0,cue==='portal'?1.1:.8);this.whoosh(.02,.4,.6);
    notes.forEach((hz,i)=>cue==='crystal'?this.chime(hz,.07+i*step,.42,.21,(i%2?1:-1)*.55):this.lead(hz,.07+i*step,.29,.20,(i%3-1)*.4));
    this.chord(cue==='portal'?1.22:.85,.68,.095);
    if(cue==='planet')this.sparkle([1174.66,1479.98,1760,1174.66],1.32,.10,.14);
    if(cue==='thruster'){
      this.voice({hz:90,end:1100,delay:.05,duration:.65,gain:.12,type:'sawtooth',cutoff:1000,endCutoff:3600,attack:.12,hold:.15});
      this.whoosh(.3,.65,.85);this.sparkle([880,1174.66,1479.98,1760,1174.66],1.40,.12,.14);
    }
    if(cue==='crystal')this.sparkle([1760,1479.98,1174.66,1479.98,1760,1174.66,880],1.50,.13,.15);
    if(cue==='satellite'){
      [1.6,1.8,2.0].forEach((delay,i)=>this.lead([587.33,880,1174.66][i],delay,.18,.18,(i-1)*.5));
      this.sparkle([1174.66,1479.98,1760],2.28,.11,.15);
    }
    if(cue==='portal'){
      this.voice({hz:55,end:110,duration:1.4,gain:.13,type:'triangle',hold:.4});this.whoosh(.7,1.15,.95);
      this.voice({hz:1174.66,end:293.66,delay:1.7,duration:.65,gain:.10,type:'triangle',pan:.5,echo:true});
      this.impact(2.18,.65);this.chord(2.2,.65,.085);
      this.sparkle([1760,1479.98,1174.66,880,1174.66],2.62,.13,.14);
    }
  }
  jackpot() {
    // Brass-like pickup, two emphatic downbeats, then a wide metallic coin shower.
    this.impact(0,1.25);this.whoosh(.02,.45,.9);
    [293.66,293.66,440].forEach((hz,i)=>this.lead(hz,i*.14,.16,.22));
    [587.33,739.99,880,739.99,587.33].forEach((hz,i)=>this.lead(hz,.45+i*.2,.3,.24,(i%3-1)*.35));
    this.chord(.45,.7,.12);this.impact(.45,.8);this.impact(1.25,.8);
    [.85,1.65].forEach(delay=>this.voice({noise:true,delay,duration:.12,gain:.18,cutoff:2400,endCutoff:1200}));
    [587.33,739.99,880].forEach((hz,i)=>this.lead(hz,1.65+i*.1,.22,.21));
    this.whoosh(1.65,.4,.7);this.impact(2.05,1.05);this.chord(2.05,.85,.12);
    this.sparkle([1174.66,1479.98,1760,1479.98,1174.66,1760,1479.98,1760,1174.66,1479.98],2.42,.09,.17);
    this.chord(3.35,.72,.095);this.chime(1174.66,3.4,.68,.18,0);
  }
  stop() {
    for(const [source,{amp}] of this.voices){
      try {const t=this.ctx.currentTime;amp.gain.cancelScheduledValues(t);amp.gain.setTargetAtTime(.0001,t,.005);source.stop(t+.025);}catch{}
    }
    // Delayed echoes must not leak into another round or a muted/hidden page.
    if(this.delay&&this.lowpass){this.delay.disconnect();this.delay=this.ctx.createDelay(.5);this.delay.delayTime.value=.14;this.delay.connect(this.lowpass);}
  }
  toggle(){this.enabled=!this.enabled;this.stop();if(this.master)this.master.gain.setValueAtTime(this.enabled?.32:0,this.ctx.currentTime);return this.enabled;}
  leave(){this.stop();this.active=false;}
}
if(typeof module!=='undefined')module.exports={SlotsAudio};

'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {SlotsAudio}=require('../src/slots-audio.js');
const {SLOT_FEEDBACK}=require('../src/slots-effects.js');
function context(){
  const sources=[],delays=[];
  const param=()=>({value:0,events:[],setValueAtTime(value,t){this.value=value;this.events.push(['set',value,t]);},exponentialRampToValueAtTime(value,t){this.events.push(['ramp',value,t]);},setTargetAtTime(value,t,constant){this.events.push(['target',value,t,constant]);},cancelScheduledValues(t){this.events=this.events.filter(e=>e[2]<t);}});
  const node=()=>({connections:[],connect(n){this.connections.push(n);return n;},disconnect(){this.connections=[];}});
  const source=()=>{const n=Object.assign(node(),{frequency:param(),start(t){this.started=t;},stop(t){this.stopped=t;}});sources.push(n);return n;};
  const c={currentTime:0,state:'suspended',sampleRate:48000,destination:node(),sources,delays,resume(){this.state='running';return Promise.resolve();},createGain(){return Object.assign(node(),{gain:param()});},createDynamicsCompressor(){return Object.assign(node(),{threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()});},createDelay(){const d=Object.assign(node(),{delayTime:param()});delays.push(d);return d;},createBiquadFilter(){return Object.assign(node(),{frequency:param(),Q:param()});},createStereoPanner(){return Object.assign(node(),{pan:param()});},createBuffer(_channels,n){return {getChannelData:()=>new Float32Array(n)};},createBufferSource:source,createOscillator:source,advance(t){this.currentTime=t;sources.filter(s=>!s.ended&&s.stopped<=t).forEach(s=>{s.ended=true;s.onended?.();});}};
  return c;
}
test('slots audio schedules distinct finite cues with bounded volume and cleans every voice',()=>{
  const signatures=new Set();
  for(const cue of ['miss','return','planet','thruster','crystal','satellite','portal','crest']){
    const c=context(),a=new SlotsAudio({contextFactory:()=>c,hidden:()=>false});a.unlock();a.result(cue);
    assert.ok(c.sources.length>0&&c.sources.length<=110);assert.equal(a.master.gain.value,.32);
    // The last dry note and its single echo finish with the matching visual cue.
    const duration=SLOT_FEEDBACK[cue].duration||.5;
    assert.ok(c.sources.every(s=>s.stopped+.14<duration&&s.stopped>s.started),cue+' audio outlasts its effect');
    const peakVoices=Math.max(...c.sources.map(s=>c.sources.filter(v=>v.started<=s.started&&v.stopped>s.started).length));
    assert.ok(peakVoices<=40, cue+' has excessive simultaneous voices');
    signatures.add(JSON.stringify(c.sources.map(s=>[s.started,s.frequency.events])));
    c.advance(5);assert.equal(a.voices.size,0);assert.ok(c.sources.every(s=>s.connections.length===0));
  }
  assert.equal(signatures.size,8);
});
test('slots jackpot combines an impact, filtered fanfare and a delayed coin finale',()=>{
  const c=context(),a=new SlotsAudio({contextFactory:()=>c,hidden:()=>false});a.unlock();a.result('crest');
  assert.ok(c.sources.some(s=>s.frequency.events.some(e=>e[0]==='ramp'&&e[1]===48)));
  assert.ok(c.sources.some(s=>s.type==='sawtooth'&&s.started>=.45));
  assert.ok(c.sources.some(s=>s.buffer&&s.loop&&s.started>1));
  assert.ok(c.sources.some(s=>s.started>=3.3));
  assert.ok(c.sources.some(s=>s.connections[0]?.frequency?.events.length===2));
  const pending=[...a.voices.keys()];c.currentTime=.8;a.result('planet');
  assert.ok(pending.every(s=>s.stopped<=.826),'a replacement cue must cancel the entire scheduled finale');
  c.advance(5);assert.equal(a.voices.size,0);
});
test('slots audio: muted/hidden sounds stay silent, stop cancels scheduled notes and disconnects old echoes',()=>{
  const c=context();let hidden=false;const a=new SlotsAudio({contextFactory:()=>c,hidden:()=>hidden});
  a.result('crest');assert.equal(c.sources.length,0);a.unlock();a.result('crest');
  const echo=a.delay;c.currentTime=.1;a.toggle();assert.equal(echo.connections.length,0);assert.equal(a.master.gain.value,0);
  assert.ok(c.sources.every(s=>s.stopped<=.126));c.advance(.2);assert.equal(a.voices.size,0);
  const count=c.sources.length;a.result('planet');assert.equal(c.sources.length,count);
  a.toggle();hidden=true;a.land(0);a.result('crest');assert.equal(c.sources.length,count);
  hidden=false;a.leave();a.result('planet');assert.equal(c.sources.length,count);
});
test('slots reels resume only their remaining sound, and unavailable audio never blocks play',()=>{
  const c=context(),a=new SlotsAudio({contextFactory:()=>c,hidden:()=>false});a.unlock();a.roll(2100);
  assert.ok(c.sources.length<=5);assert.ok(c.sources.every(s=>s.stopped<.36));
  c.advance(1);assert.equal(a.voices.size,0);a.roll(2500);assert.equal(a.voices.size,0);
  const unavailable=new SlotsAudio({contextFactory:()=>null,hidden:()=>false});assert.doesNotThrow(()=>{unavailable.unlock();unavailable.roll();unavailable.land(0);unavailable.result('crest');unavailable.leave();});
});

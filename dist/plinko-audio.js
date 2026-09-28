'use strict';
class PlinkoAudio extends DiceAudio{
 constructor(){super();this.lastHit=-Infinity;}
 charge(){this.stop();this.tone(240,.09,0,'sine',.16);this.tone(380,.09,.07,'sine',.2);this.tone(570,.08,.14,'sine',.22);}
 launch(){this.stop();this.lastHit=-Infinity;this.tone(330,.1,0,'triangle',.35);this.tone(660,.17,.06,'sine',.28);}
 hit(index,now,strength=.4){
  if(now-this.lastHit<45)return;this.lastHit=now;
  const power=Math.max(.15,Math.min(1,strength)),notes=[587,659,784,880,988],note=notes[Math.abs(index)%notes.length];
  this.tone(note,.06+power*.065,0,'sine',.14+power*.26);
  // A short low strike gives hard impacts weight, without turning every peg into a loud chime.
  this.tone(125+power*85,.045+power*.03,0,'triangle',.12+power*.34);
  if(power>.65)this.tone(note*2,.045,.012,'sine',.1+power*.12);
 }
 land(multiplier){this.stop();this.tone(180,.12,0,'triangle',.35);const notes=multiplier>=3?[523,659,784,1047,1319]:multiplier>=1?[659,880,1047]:[440,330];notes.forEach((n,i)=>this.tone(n,multiplier>=3?.26:.16,.08+i*.085,'sine',.32));}
}
const plinkoAudio=new PlinkoAudio();

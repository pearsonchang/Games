'use strict';
class PlinkoAudio extends DiceAudio{
 constructor(){super();this.lastHit=-Infinity;}
 launch(){this.stop();this.lastHit=-Infinity;this.tone(330,.1,0,'triangle',.35);this.tone(660,.17,.06,'sine',.28)}
 hit(index,now){if(now-this.lastHit<85)return;this.lastHit=now;const notes=[587,659,784,880,988];this.tone(notes[index%notes.length],.075,0,'sine',.23);}
 land(multiplier){this.stop();this.tone(180,.12,0,'triangle',.35);const notes=multiplier>=3?[523,659,784,1047,1319]:multiplier>=1?[659,880,1047]:[440,330];notes.forEach((n,i)=>this.tone(n,multiplier>=3?.26:.16,.08+i*.085,'sine',.32))}
}
const plinkoAudio=new PlinkoAudio();

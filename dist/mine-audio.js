'use strict';
class MineAudio extends DiceAudio{
 reveal(green=false){this.tone(green?760:620,.1,0,'sine',.38);this.tone(green?1140:930,.12,.045,'sine',.22)}
 flag(){this.tone(420,.065,0,'triangle',.32)}
 lose(){this.stop();this.tone(110,.32,0,'triangle',.65);this.tone(65,.35,.06,'sine',.5)}
 win(){this.stop();[523,659,784,1047].forEach((n,i)=>this.tone(n,.23,i*.1,'sine',.45))}
}
const mineAudio=new MineAudio();

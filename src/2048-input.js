'use strict';

// Commit once when a swipe crosses the threshold; releasing cannot move twice.
class FusionSwipe {
  constructor(threshold=18){this.threshold=threshold;this.gesture=null;}
  begin(id,x,y){this.gesture={id,x,y,committed:false};}
  update(id,x,y){
    const g=this.gesture;
    if(!g||g.id!==id||g.committed)return null;
    const dx=x-g.x,dy=y-g.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))<this.threshold)return null;
    g.committed=true;
    return Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  }
  end(id,x,y){
    if(this.gesture?.id!==id)return null;
    const direction=this.update(id,x,y);this.cancel();return direction;
  }
  cancel(){this.gesture=null;}
}
if(typeof module!=='undefined')module.exports={FusionSwipe};

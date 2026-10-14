const test=require('node:test');
const assert=require('node:assert/strict');
const {FusionSwipe}=require('../src/2048-input.js');

test('2048 swipe commits at the threshold before release and cannot move again on release',()=>{
  const swipe=new FusionSwipe();swipe.begin(1,100,100);
  assert.equal(swipe.update(1,117,105),null);
  assert.equal(swipe.update(1,118,105),'right');
  assert.equal(swipe.update(1,70,100),null);
  assert.equal(swipe.end(1,50,100),null);
  assert.equal(swipe.gesture,null);
});
test('2048 swipe handles four directions, fast release and small taps',()=>{
  for(const [x,y,direction] of [[80,102,'left'],[122,103,'right'],[104,80,'up'],[101,120,'down']]){
    const swipe=new FusionSwipe();swipe.begin(1,100,100);
    assert.equal(swipe.end(1,x,y),direction);
    assert.equal(swipe.update(1,x,y),null);
  }
  const swipe=new FusionSwipe();swipe.begin(1,100,100);
  assert.equal(swipe.end(1,110,111),null);
});
test('2048 swipe ignores other pointers and cancels pending gestures on interruptions',()=>{
  const swipe=new FusionSwipe();swipe.begin(4,100,100);
  assert.equal(swipe.update(5,200,100),null);
  assert.equal(swipe.end(5,200,100),null);
  assert.equal(swipe.update(4,80,100),'left');
  swipe.begin(6,100,100);swipe.cancel();
  assert.equal(swipe.end(6,100,200),null);
  swipe.begin(7,100,100);assert.equal(swipe.update(7,100,120),'down');
});

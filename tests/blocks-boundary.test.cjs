const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('../src/blocks-engine.js');
const {blockPointerTarget,blockPlacementAnchor,blockCellTarget}=require('../src/blocks-input.js');
const {GameBridge}=require('../src/platform-bridge.js');

test('every shape may touch an edge only when the whole shape fits; overflow never changes the round',()=>{
  const r=new engine.BlocksRound({charge:()=>true});r.start('');
  for(const shape of engine.BLOCK_SHAPES){
    r.board=Array(64).fill(0);r.tray=[{...shape,color:1},r.piece(0,2),r.piece(0,3)];
    for(const [row,col] of [[0,0],[0,8-shape.cols],[8-shape.rows,0],[8-shape.rows,8-shape.cols]]){
      assert.equal(engine.blockFits(r.board,shape,row,col),true,shape.name);
    }
    const before=r.snapshot();
    for(const [row,col] of [[-1,0],[0,-1],[9-shape.rows,0],[0,9-shape.cols],[7,8],[8,7]]){
      assert.equal(engine.blockInBounds(shape,row,col),false);
      assert.equal(r.place(0,row,col,r.id,r.revision),false);
      assert.deepEqual(r.snapshot(),before);
    }
  }
});

test('edge hit testing accepts the full nearest grid footprint but never clamps an out-of-grid origin',()=>{
  const shape=engine.BLOCK_SHAPES[25],grid={left:105,top:205,pitch:40,cell:36,bounds:{left:100,top:200,right:426,bottom:526}};
  // A 3-row / 2-column zigzag, with a grip on its top-right cell.
  const grip={col:1,row:0,touch:false},point={x:403,y:423};
  let target=blockPointerTarget(shape,point,grip,grid);
  assert.equal(target.row,5);assert.equal(target.col,6);assert.equal(target.inside,true);
  target=blockPointerTarget(shape,{...point,x:point.x+7},grip,grid);
  assert.equal(target.col,6);assert.equal(target.inside,true);
  target=blockPointerTarget(shape,{...point,y:point.y+7},grip,grid);
  assert.equal(target.row,5);assert.equal(target.inside,true);
  target=blockPointerTarget(shape,{...point,x:point.x+21},grip,grid);
  assert.equal(target.col,7);assert.equal(target.inside,false);
  target=blockPointerTarget(shape,{...point,y:point.y+21},grip,grid);
  assert.equal(target.row,6);assert.equal(target.inside,false);
  const lift=56;
  const touch=blockPointerTarget(shape,{x:point.x,y:point.y+lift},{...grip,touch:true},grid);
  assert.deepEqual(touch,{...blockPointerTarget(shape,point,grip,grid),lift});
});

test('every shape uses an occupied click anchor and has equal half-cell targeting at all four edges',()=>{
  const grid={left:105,top:205,pitch:40,cell:36,bounds:{left:100,top:200,right:426,bottom:526}};
  for(const piece of engine.BLOCK_SHAPES) {
    const anchor=blockPlacementAnchor(piece);
    assert.ok(piece.cells.some(([r,c])=>r===anchor.row&&c===anchor.col));
    for(const [row,col] of [[0,0],[0,8-piece.cols],[8-piece.rows,0],[8-piece.rows,8-piece.cols]]) {
      assert.deepEqual(blockCellTarget(piece,row+anchor.row,col+anchor.col),{row,col});
      for(const [gr,gc] of piece.cells)for(const touch of [false,true])for(const delta of [-19.9,0,19.9]) {
        const p={x:105+(col+gc)*40+18+delta,y:205+(row+gr)*40+18+delta+(touch?56:0)};
        const target=blockPointerTarget(piece,p,{row:gr,col:gc,touch},grid);
        assert.equal(target.row,row);assert.equal(target.col,col);assert.equal(target.inside,true);
      }
    }
  }
});

// Exercise real controller events, including a release without a final pointermove.
// The DOM stand-in only supplies layout/classes; the production engine owns state.
function harness({reduced=true,setup,deferred=false,balance=1000}={}){
  const nodes=new Map(),listeners={},timers=new Map(),frames=new Map();let seq=0;
  const stats={cellWrites:0,rectReads:0,trayWrites:0,slotWrites:0,overlayWrites:0,effectCommits:0,forcedLayouts:0};
  const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
  function make(){
    const names=new Set(),handlers={};let markup='';
    const write=()=>{if(n.dataset.index!==undefined)stats.cellWrites++;};
    const n={children:[],dataset:{},style:{setProperty(){}},textContent:'',hidden:false,open:false,disabled:false,handlers,
      classList:{add:(...x)=>{write();x.forEach(v=>names.add(v));},remove:(...x)=>{write();x.forEach(v=>names.delete(v));},contains:v=>names.has(v),toggle:(v,on)=>{write();return on?names.add(v):names.delete(v);}},
      get className(){return [...names].join(' ');},set className(value){write();names.clear();value.split(/\s+/).filter(Boolean).forEach(v=>names.add(v));},
      get innerHTML(){return markup;},set innerHTML(value){markup=value;n.first=null;n.note=null;if(n.dataset.slot!==undefined)stats.slotWrites++;if(n===nodes.get('placement-outline')||n===nodes.get('drag-piece'))stats.overlayWrites++;if(n===nodes.get('tray')){stats.trayWrites++;n.buttons=[...value.matchAll(/data-slot="(\d)"/g)].map(m=>{const b=make();b.dataset.slot=m[1];return b;});}},
      get firstElementChild(){return n.first||(n.first=make());},
      get offsetWidth(){stats.forcedLayouts++;return 36;},animations:[],animate(keyframes,options){const a={keyframes,options,cancelled:false,cancel(){this.cancelled=true;}};n.animations.push(a);return a;},
      setAttribute(k,v){n[k]=String(v);},removeAttribute(k){delete n[k];},append(c){if(n===nodes.get('effects'))stats.effectCommits++;if(c.fragment)n.children.push(...c.children);else{n.children.push(c);c.parentElement=n;if(n===nodes.get('tray'))n.buttons=n.children.filter(b=>b.dataset.slot!==undefined);}},replaceChildren(){n.children=[];},
      addEventListener(k,fn){handlers[k]=fn;},querySelectorAll(){return n.buttons||[];},querySelector(sel){return sel==='.slot-note'?(n.note||(n.note=make())):n.firstElementChild;},
      closest(){return n;},setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},
      focus(){document.activeElement=n;},close(){n.open=false;},showModal(){n.open=true;},getBoundingClientRect(){stats.rectReads++;return n.rect||rect(0,700,72,108);}};
    return n;
  }
  const el=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
  const document={activeElement:null,hidden:false,body:make(),getElementById:el,createElement:make,createDocumentFragment:()=>Object.assign(make(),{fragment:true}),querySelector:()=>el('wordmark'),querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn};
  const r=new engine.BlocksRound({random:()=>.5,charge:()=>true});r.start('');
  // Same irregular shape as the report, and another playable shape.
  r.tray=[r.piece(25,5),r.piece(0,3),r.piece(9,4)];
  if(setup)setup(r);
  const requests=[],replies=[],saved=[];let delaying=false;
  const reply=data=>listeners.message({origin:'https://test.local',source:parent,data});
  const child={postMessage(data){if(delaying)replies.push(data);else reply(data);}};
  const bridge=new GameBridge({engines:{blocks:engine.BlocksRound},frames:{blocks:{contentWindow:child}},loadedGames:new Set(['blocks']),wallet:{points:balance},origin:'https://test.local'});
  bridge.rounds.blocks=r;
  const handle=data=>bridge.handle({origin:'https://test.local',source:child,data});
  const parent={postMessage(data){if(delaying)requests.push(data);else handle(data);}};
  const processRequest=(reject=false)=>{const data=requests.shift();if(data)handle(reject?{...data,revision:-1}:data);};
  const ack=()=>{const data=replies.shift();if(data)reply(data);};
  const flushMessages=()=>{let guard=0;while(requests.length||replies.length){if(++guard>100)throw new Error('message loop');if(requests.length)processRequest();while(replies.length)ack();}};
  const context=vm.createContext({...engine,blockPointerTarget,blockPlacementAnchor,blockCellTarget,document,window:{parent,addEventListener:(name,fn)=>listeners[name]=fn},location:{origin:'https://test.local'},matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({paddingLeft:'5px',paddingRight:'5px',paddingTop:'5px',borderLeftWidth:'0px',borderRightWidth:'0px',borderTopWidth:'0px',columnGap:'4px'}),localStorage:{getItem:()=> 'off',setItem(k,v){saved.push([k,v]);}},setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id),console});
  vm.runInContext(fs.readFileSync('src/blocks.js','utf8'),context);
  delaying=deferred;
  el('board').rect=rect(100,200,326,326);
  el('board').parentElement=el('stage');el('stage').rect=el('board').rect;
  el('board').children.forEach((cell,i)=>{cell.rect=rect(105+i%8*40,205+Math.floor(i/8)*40,36,36);});
  const cell=(row,col)=>el('board').children[row*8+col],button=(slot=0)=>el('tray').buttons.find(b=>b.dataset.slot===String(slot));
  const frame=()=>{const next=[...frames.values()];frames.clear();next.forEach(fn=>fn());};
  const click=(row,col)=>el('board').handlers.click({target:cell(row,col)});
  const hover=(row,col,flush=true)=>{el('board').handlers.pointermove({target:cell(row,col),pointerType:'mouse'});if(flush)frame();};
  const choose=(slot=0)=>el('tray').handlers.click({target:button(slot),detail:1});
  const pointer=(x,y,slot=0,pointerType='mouse')=>({pointerId:1,pointerType,button:0,target:button(slot),clientX:x,clientY:y,preventDefault(){}});
  const previewIndices=()=>{
    const outline=el('placement-outline');if(outline.hidden||!outline.classList.contains('valid'))return [];
    const [x,y]=outline.style.transform.match(/-?[\d.]+(?=px)/g).map(Number);
    const col=Math.round((x-105)/40),row=Math.round((y-205)/40);
    return [...outline.innerHTML.matchAll(/grid-row:(\d+);grid-column:(\d+)/g)].map(m=>(row+Number(m[1])-1)*8+col+Number(m[2])-1).sort((a,b)=>a-b);
  };
  return {r,el,cell,choose,click,hover,pointer,frame,frames,timers,stats,listeners,document,requests,replies,saved,processRequest,ack,reply,flushMessages,previewIndices,
    resetStats:()=>Object.keys(stats).forEach(k=>stats[k]=0),sync:()=>reply(r.snapshot(balance)),
    painted:()=>previewIndices().length};
}

test('irregular pieces show no clipped edge preview; click rejection preserves piece and score, then recovers',()=>{
  const h=harness();h.choose();const before=h.r.snapshot(),hint=h.el('hint').textContent;
  h.hover(6,7);assert.equal(h.painted(),0);assert.equal(h.el('board-frame').dataset.placement,undefined);
  assert.equal(h.el('placement-outline').hidden,false);
  assert.equal([...h.el('placement-outline').innerHTML.matchAll(/class="tile/g)].length,4,'edge preview keeps the complete shape outside the board');
  assert.equal(h.el('hint').textContent,hint);h.click(6,7);assert.deepEqual(h.r.snapshot(),before);
  assert.equal(h.el('placement-outline').hidden,true);
  assert.equal(h.painted(),0);assert.match(h.el('hint').textContent,/整个方块/);
  h.hover(5,7);assert.equal(h.painted(),4);assert.equal(h.el('hint').classList.contains('error'),false);
  h.click(5,7);assert.equal(h.r.score,20);assert.equal(h.r.tray[0],null);
  assert.equal(h.r.board.filter(Boolean).length,4);
});

test('reported right-edge zigzag uses the same full cells for preview and click, including its empty top-left corner',()=>{
  const h=harness({setup:r=>{
    for(const row of [6,7])for(let col=0;col<6;col++)r.board[row*8+col]=col<4?(row===6?1:2):4;
    r.score=60;r.moves=3;r.revision=3;
    r.tray=[r.piece(15,1),r.piece(17,2),r.piece(25,3)];
  }});
  h.choose(2);h.hover(5,7);
  const preview=h.previewIndices();
  assert.deepEqual(preview,[47,54,55,62]);
  assert.ok(h.el('placement-outline').classList.contains('pointed'));assert.match(h.el('placement-outline').innerHTML,/placement-anchor/);
  h.click(5,7);
  assert.deepEqual(h.r.lastMove.placed,preview);assert.equal(h.r.score,180);assert.equal(h.r.lines,1);
  assert.equal(h.r.tray[2],null);
});

test('right-edge drag preview and release agree even when the floating piece slightly crosses the border',()=>{
  const h=harness(),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(54,718));
  tray.handlers.pointermove(h.pointer(410,430));h.frame();
  const preview=h.previewIndices();
  assert.deepEqual(preview,[47,54,55,62]);
  tray.handlers.pointerup(h.pointer(410,430));
  assert.deepEqual(h.r.lastMove.placed,preview);assert.equal(h.r.score,20);
});

test('pointerup recalculates its own boundary and never commits the previous valid preview',()=>{
  const h=harness(),before=h.r.snapshot();
  h.el('tray').handlers.pointerdown(h.pointer(18,718));
  h.el('tray').handlers.pointermove(h.pointer(163,263));
  h.frame();
  assert.equal(h.painted(),4);
  // Pointer is released outside without a final movement event being delivered.
  h.el('tray').handlers.pointerup(h.pointer(450,263));
  assert.deepEqual(h.r.snapshot(),before);assert.equal(h.painted(),0);
  assert.equal(h.el('drag-piece').hidden,true);assert.match(h.el('hint').textContent,/整个方块/);
  // A new drag uses the current release coordinate, not the old hover coordinate.
  h.el('tray').handlers.pointerdown(h.pointer(18,718));
  h.el('tray').handlers.pointermove(h.pointer(163,263));
  h.el('tray').handlers.pointerup(h.pointer(203,263));
  assert.equal(h.r.score,20);assert.equal(h.r.board[1*8+3],5);assert.equal(h.r.board[1*8+2],0);
});

test('movement bursts render once per frame; same-cell movement reuses geometry and performs no cell writes',()=>{
  const h=harness(),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(18,718));h.resetStats();
  for(let i=0;i<100;i++)tray.handlers.pointermove(h.pointer(163+i/100,263));
  assert.equal(h.frames.size,1);assert.equal(h.painted(),0);assert.equal(h.stats.rectReads,0);
  h.frame();assert.equal(h.painted(),4);assert.equal(h.stats.rectReads,0);
  assert.equal(h.stats.cellWrites,0,'the board does not repaint for a moving preview');assert.equal(h.stats.overlayWrites,0,'sprite markup is prepared before the first move');
  h.resetStats();
  for(let i=0;i<10;i++){tray.handlers.pointermove(h.pointer(164+i/10,263));h.frame();}
  assert.equal(h.stats.rectReads,0);assert.equal(h.stats.cellWrites,0);
  assert.equal(h.frames.size,0);assert.equal(h.stats.forcedLayouts,0);
});

test('mouse and touch keep full blocked outlines visible, follow the pointer, and reject invalid releases',()=>{
  for(const type of ['mouse','touch']) {
    const h=harness({setup:r=>{r.board[10]=2;r.board[11]=2;}}),tray=h.el('tray'),before=h.r.snapshot();
    const lift=type==='touch'?56:0;
    const move=x=>{tray.handlers.pointermove(h.pointer(x,263+lift,0,type));h.frame();};
    tray.handlers.pointerdown(h.pointer(18,718,0,type));move(123);
    assert.equal(h.painted(),4);
    const hint=h.el('hint').textContent;
    move(163);assert.equal(h.painted(),0);
    assert.equal(h.el('placement-outline').hidden,false);
    const outlineMarkup=h.el('placement-outline').innerHTML;
    assert.equal([...outlineMarkup.matchAll(/class="tile/g)].length,4);
    assert.equal(h.cell(1,2).className,'cell filled color-2');
    h.resetStats();let previousTransform=h.el('drag-piece').style.transform;
    for(const x of [203,204,450]) {
      move(x);
      assert.equal(h.painted(),0);assert.equal(h.stats.cellWrites,0);
      assert.equal(h.el('placement-outline').hidden,false);
      assert.equal(h.el('placement-outline').innerHTML,outlineMarkup,'reuse the outline through occupied and out-of-bounds positions');
      assert.equal(h.stats.rectReads,0,'moving the outline reuses cached geometry');
      assert.equal(h.el('hint').textContent,hint);assert.equal(h.el('hint').classList.contains('error'),false);
      assert.equal(h.el('drag-piece').classList.contains('drop-invalid'),false);
      assert.equal(h.el('board-frame').dataset.placement,undefined);
      assert.equal(h.el('drag-piece').hidden,false);
      assert.notEqual(h.el('drag-piece').style.transform,previousTransform);
      previousTransform=h.el('drag-piece').style.transform;
    }
    // Re-entering a valid spot restores the full preview; releasing on an occupied one still fails.
    move(123);assert.equal(h.painted(),4);assert.equal(h.el('placement-outline').hidden,false);assert.equal(h.el('placement-outline').classList.contains('valid'),true);
    tray.handlers.pointerup(h.pointer(163,263+lift,0,type));h.frame();
    assert.deepEqual(h.r.snapshot(),before);assert.equal(h.painted(),0);
    assert.equal(h.el('drag-piece').hidden,true);assert.equal(h.el('hint').classList.contains('error'),false);
    assert.equal(h.el('placement-outline').hidden,true);
    tray.handlers.pointerdown(h.pointer(18,718,0,type));move(123);
    tray.handlers.pointerup(h.pointer(123,263+lift,0,type));
    assert.equal(h.r.moves,1);assert.equal(h.r.score,20);
  }
});

test('hover batching moves only an overlay and cancels pending previews on leave or Escape',()=>{
  const h=harness();h.choose();h.resetStats();
  for(let i=0;i<100;i++)h.hover(1,i%4,false);
  assert.equal(h.frames.size,1);h.frame();assert.equal(h.painted(),4);
  assert.equal(h.stats.cellWrites,0);
  h.resetStats();h.hover(1,3);assert.equal(h.stats.cellWrites,0);
  h.hover(2,3);assert.equal(h.stats.cellWrites,0,'crossing a grid cell never changes settled board cells');
  h.hover(3,3,false);h.el('board').handlers.pointerleave();h.frame();assert.equal(h.painted(),0);
  h.hover(2,3,false);h.el('board').handlers.keydown({target:h.cell(2,3),key:'Escape',preventDefault(){}});
  h.frame();assert.equal(h.painted(),0);assert.equal(h.frames.size,0);
});

test('a blocked click/keyboard preview follows scrolling without disappearing',()=>{
  const h=harness({setup:r=>{r.board[10]=2;}});h.choose();h.hover(1,2);
  const outline=h.el('placement-outline'),before=outline.style.transform;
  assert.equal(outline.hidden,false);
  h.el('board').rect.left+=40;h.el('board').rect.right+=40;
  h.listeners.scroll();assert.equal(outline.hidden,false);
  h.resetStats();h.frame();assert.equal(outline.hidden,false);assert.notEqual(outline.style.transform,before);
  assert.equal(h.stats.rectReads,1);assert.equal(h.stats.cellWrites,0);
});

test('release before the next frame uses release coordinates once and cancels the queued preview',()=>{
  const h=harness(),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(18,718));
  tray.handlers.pointermove(h.pointer(163,263));
  assert.equal(h.frames.size,1);
  tray.handlers.pointerup(h.pointer(203,263));
  assert.equal(h.r.moves,1);assert.equal(h.r.board[1*8+3],5);
  h.frame();assert.equal(h.frames.size,0);assert.equal(h.painted(),0);assert.equal(h.el('drag-piece').hidden,true);
  tray.handlers.pointerup(h.pointer(203,263));assert.equal(h.r.moves,1);
});

test('scroll invalidates drag geometry and release still rejects a partial shape; cancellation leaves no queued input',()=>{
  const h=harness(),tray=h.el('tray'),before=h.r.snapshot();
  tray.handlers.pointerdown(h.pointer(54,718));tray.handlers.pointermove(h.pointer(403,423));h.frame();
  assert.equal(h.painted(),4);
  h.listeners.scroll();assert.equal(h.el('drag-piece').hidden,false);assert.equal(h.frames.size,1);
  h.resetStats();h.frame();assert.equal(h.stats.rectReads,1);assert.equal(h.painted(),4);
  // The viewport changed immediately before release, with no new move or frame.
  h.el('board').rect.right-=10;
  tray.handlers.pointerup(h.pointer(403,423));assert.deepEqual(h.r.snapshot(),before);
  tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointermove(h.pointer(163,263));
  tray.handlers.pointercancel(h.pointer(163,263));h.frame();
  assert.equal(h.painted(),0);assert.equal(h.el('drag-piece').hidden,true);assert.deepEqual(h.r.snapshot(),before);
});

test('touch drag keeps the lifted preview and final placement aligned when frames are batched',()=>{
  const h=harness(),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(18,718,0,'touch'));
  tray.handlers.pointermove(h.pointer(163,319,0,'touch'));h.frame();assert.equal(h.painted(),4);
  tray.handlers.pointerup(h.pointer(203,319,0,'touch'));
  assert.equal(h.r.moves,1);assert.equal(h.r.board[1*8+3],5);assert.equal(h.r.board[1*8+2],0);
});

test('animated cells never change drag grid geometry, and the next selection is not swallowed after a drop',()=>{
  const h=harness(),tray=h.el('tray');
  // Mimic cell rectangles midway through their scale animation.
  h.cell(0,0).rect.width=27;h.cell(0,0).rect.left+=4.5;h.cell(0,1).rect.left+=4.5;
  tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointermove(h.pointer(163,263));h.frame();
  assert.ok(h.previewIndices().includes(10));assert.equal(h.painted(),4);
  tray.handlers.pointerup(h.pointer(163,263));assert.equal(h.r.board[1*8+2],5);
  h.choose(1);h.click(0,0);assert.equal(h.r.moves,2);assert.equal(h.r.board[0],3);
});

test('a fresh click on the same piece after an invalid drag is accepted without waiting for a suppression timer',()=>{
  const h=harness(),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointermove(h.pointer(450,263));
  tray.handlers.pointerup(h.pointer(450,263));assert.equal(h.r.moves,0);
  tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointerup(h.pointer(18,718));h.choose();
  h.click(1,1);assert.equal(h.r.moves,1);
});

test('consecutive clears and dragging remain available while effects play, with bounded effects and exact scoring',()=>{
  const h=harness({reduced:false,setup:r=>{
    for(let row=0;row<4;row++)for(let col=0;col<7;col++)r.board[row*8+col]=1;
    r.tray=[r.piece(2,2),r.piece(2,3),r.piece(9,4)];
  }});
  h.choose();h.resetStats();h.click(0,7);
  assert.equal(h.r.score,410);assert.equal(h.r.lines,2);
  const effects=h.el('effects'),firstEffect=effects.children[0];
  assert.ok(effects.children.length<=56);assert.equal(h.stats.effectCommits,1);assert.equal(h.stats.rectReads,1,'measure the board once for all clear effects');assert.equal(h.stats.forcedLayouts,0);
  assert.ok(h.el('board-frame').classList.contains('combo-flash'));
  // No timers advance: the previous implementation rejected both the selection and placement.
  h.choose(1);h.click(2,7);
  assert.equal(h.r.score,1220);assert.equal(h.r.lines,4);assert.equal(h.r.maxCombo,2);
  assert.ok(effects.children.length<=56);assert.equal(effects.children[0],firstEffect,'reuse particles across clears');
  assert.equal(h.el('callout').animations.length,2,'consecutive clears each restart the callout without a reflow');
  assert.equal(h.el('callout').animations[0].cancelled,true);
  const tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(18,718,2));tray.handlers.pointermove(h.pointer(163,263,2));h.frame();
  assert.equal(h.painted(),4);assert.equal(h.el('drag-piece').hidden,false);
  tray.handlers.pointerup(h.pointer(163,263,2));
  assert.equal(h.r.score,1240);assert.equal(h.r.moves,3);assert.equal(effects.children.length,0,'celebrations yield to the next drag');
  assert.equal(h.el('callout').animations[1].cancelled,true);
  assert.equal(effects.children.length,0);assert.equal(h.r.score,1240);
});

test('maximum clear has a finite effect budget and hiding cancels every effect without replay',()=>{
  const h=harness({reduced:false,setup:r=>{
    r.board.fill(3);r.board[63]=0;r.combo=2;
    r.tray=[r.piece(0,1),r.piece(5,2),r.piece(9,4)];
  }});
  h.choose();h.resetStats();h.click(7,7);
  assert.equal(h.r.lastMove.lines,16);assert.equal(h.r.score,76805);
  const effects=h.el('effects'),nodes=[...effects.children];
  assert.ok(nodes.length>0&&nodes.length<=132,'even a full-board combo has a fixed node ceiling');
  assert.equal(h.stats.rectReads,1);assert.equal(h.stats.forcedLayouts,0);assert.equal(h.stats.effectCommits,1);
  for(const node of nodes){
    const animation=node.animations.at(-1);
    assert.ok(animation.options.duration+(animation.options.delay||0)<=900);
    assert.notEqual(animation.options.iterations,Infinity);
  }
  h.document.hidden=true;h.listeners.visibilitychange();
  assert.equal(effects.children.length,0);assert.equal(h.el('callout').classList.contains('active'),false);
  assert.equal(h.el('tier-toast').hidden,true);
  for(const node of nodes)assert.equal(node.animations.at(-1).cancelled,true);
  h.document.hidden=false;h.listeners.visibilitychange();h.sync();
  assert.equal(effects.children.length,0,'returning never replays an old clear');
});

test('reduced motion still reports a clear and a confirmed tier without spawning decorative animations',()=>{
  const h=harness({reduced:true,setup:r=>{
    r.score=490;for(let col=0;col<7;col++)r.board[56+col]=1;
    r.tray=[r.piece(0,2),r.piece(5,2),r.piece(9,4)];
  }});
  h.choose();h.click(7,7);
  assert.equal(h.r.score,595);assert.equal(h.el('reward-amount').textContent,'20');
  assert.equal(h.el('effects').children.length,0);assert.equal(h.el('score').animations.length,0);
  assert.equal(h.el('tier-toast').hidden,false);assert.equal(h.el('tier-toast').animations.length,0);
  assert.match(h.el('callout').innerHTML,/\+105/);
  h.reply({type:'platform-pause',paused:true});
  assert.equal(h.el('tier-toast').hidden,true);assert.equal(h.el('callout').classList.contains('active'),false);
  h.reply({type:'platform-pause',paused:false});h.sync();
  assert.equal(h.el('callout').classList.contains('active'),false);
});

test('duplicate embedded snapshots do not rebuild the tray or interrupt an active drag',()=>{
  const h=harness(),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointermove(h.pointer(163,263));h.frame();
  h.resetStats();h.sync();
  assert.equal(h.stats.trayWrites,0);assert.equal(h.stats.cellWrites,0);assert.equal(h.painted(),4);
  tray.handlers.pointerup(h.pointer(163,263));assert.equal(h.r.moves,1);
});

test('new round and window blur cancel queued input, while reduced motion still permits immediate successive moves',()=>{
  const h=harness({setup:r=>{r.tray=[r.piece(5,1),r.piece(5,2),r.piece(9,4)];}});
  h.choose(0);h.click(7,0);h.choose(1);h.click(7,4);h.choose(2);h.click(5,6);
  assert.equal(h.r.score,160);assert.equal(h.r.moves,3);assert.equal(h.el('effects').children.length,0);
  h.choose();h.hover(0,0,false);h.r.restart(h.r.id,h.r.revision);h.sync();h.frame();
  assert.equal(h.painted(),0);assert.equal(h.r.score,0);
  const tray=h.el('tray');tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointermove(h.pointer(163,263));
  h.listeners.blur();h.frame();assert.equal(h.painted(),0);assert.equal(h.el('drag-piece').hidden,true);
});

test('async drops paint immediately; acknowledgment preserves the next held piece and preview',()=>{
  const h=harness({deferred:true,reduced:false}),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(54,718));tray.handlers.pointermove(h.pointer(403,423));h.frame();
  tray.handlers.pointerup(h.pointer(403,423));
  assert.equal(h.r.score,0);assert.equal(h.el('score').textContent,'20');assert.equal(h.cell(5,7).classList.contains('filled'),true);
  assert.equal(h.saved.length,0,'unconfirmed score must not become a persistent record');
  const nextButton=tray.buttons.find(b=>b.dataset.slot==='1');
  tray.handlers.pointerdown(h.pointer(36,754,1));tray.handlers.pointermove(h.pointer(123,263,1));h.frame();
  assert.equal(h.el('drag-piece').hidden,false);assert.equal(h.painted(),1);
  h.resetStats();h.processRequest();h.ack();
  assert.equal(h.r.score,20);assert.equal(h.painted(),1);assert.equal(h.el('drag-piece').hidden,false);
  assert.equal(tray.buttons.find(b=>b.dataset.slot==='1'),nextButton,'retain the element holding pointer capture');
  assert.equal(h.stats.trayWrites,0);assert.equal(h.stats.cellWrites,0);assert.equal(h.el('score').animations.length,1);
  tray.handlers.pointermove(h.pointer(163,263,1));h.frame();tray.handlers.pointerup(h.pointer(163,263,1));
  assert.equal(h.el('score').textContent,'25');h.flushMessages();assert.equal(h.r.score,25);assert.equal(h.r.moves,2);
});

test('three rapid placements queue in order, clear once, and only the owner deals the next hand',()=>{
  const h=harness({deferred:true,setup:r=>{r.tray=[r.piece(5,1),r.piece(5,2),r.piece(9,4)];}});
  let randomCalls=0;h.r.random=()=>{randomCalls++;return .5;};
  h.choose(0);h.click(7,0);h.choose(1);h.click(7,4);h.choose(2);h.click(5,6);
  assert.equal(h.el('score').textContent,'160');assert.equal(h.r.moves,0);assert.equal(h.requests.length,1);
  assert.equal(randomCalls,0);assert.equal(h.el('tray').buttons.filter(b=>!b.disabled).length,0);assert.equal(h.el('result-dialog').open,false);
  h.flushMessages();assert.equal(h.r.score,160);assert.equal(h.r.moves,3);assert.equal(h.r.lines,1);assert.equal(h.r.revision,3);
  assert.equal(randomCalls,6);assert.equal(h.el('tray').buttons.length,3);assert.match(h.el('hint').textContent,/新方块已送达/);
});

test('rejected placement rolls back its dependent queue and score, then accepts fresh input',()=>{
  const h=harness({deferred:true});h.choose(0);h.click(1,2);h.choose(1);h.click(0,0);
  assert.equal(h.el('score').textContent,'25');assert.equal(h.saved.length,0);
  h.processRequest(true);h.ack();h.ack();
  assert.equal(h.el('score').textContent,'0');assert.equal(h.r.moves,0);assert.equal(h.requests.length,0);
  assert.equal(h.el('board').children.filter(c=>c.classList.contains('filled')).length,0);assert.equal(h.saved.length,0);
  h.choose(1);h.click(0,0);h.flushMessages();assert.equal(h.r.score,5);assert.equal(h.el('score').textContent,'5');
});

test('duplicate and stale snapshots do not reset optimistic moves or interrupt continuous dragging',()=>{
  const h=harness({deferred:true}),old=h.r.snapshot();h.choose(0);h.click(1,2);
  h.reply(old);assert.equal(h.el('score').textContent,'20');assert.equal(h.requests.length,1);
  h.flushMessages();h.reply(old);assert.equal(h.el('score').textContent,'20');assert.equal(h.r.moves,1);
});

test('restart during pending moves is serialized after them; late old-round replies are ignored',()=>{
  const h=harness({deferred:true});h.choose();h.click(1,2);h.el('confirm-restart').onclick();
  h.processRequest();const old=h.replies[0];h.ack();
  assert.equal(h.requests[0].type,'blocks-restart');assert.equal(h.requests[0].revision,1);
  h.flushMessages();assert.equal(h.r.score,0);assert.equal(h.r.moves,0);assert.equal(h.el('score').textContent,'0');
  h.reply(old);assert.equal(h.el('score').textContent,'0');assert.equal(h.el('tray').buttons.length,3);
});

test('hysteresis stabilizes a boundary, follows intentional motion, and never clamps an outside target',()=>{
  const piece=engine.BLOCK_SHAPES[0],grid={left:105,top:205,pitch:40,cell:36,bounds:{left:100,top:200,right:426,bottom:526}},grip={row:0,col:0,touch:false};
  let target=blockPointerTarget(piece,{x:142.9,y:223},grip,grid);
  for(const x of [143.1,142.9,144,145]){target=blockPointerTarget(piece,{x,y:223},grip,grid,target);assert.equal(target.col,0);}
  target=blockPointerTarget(piece,{x:148,y:223},grip,grid,target);assert.equal(target.col,1);
  target=blockPointerTarget(piece,{x:143,y:223},grip,grid,target);assert.equal(target.col,1);
  target=blockPointerTarget(piece,{x:138,y:223},grip,grid,target);assert.equal(target.col,0);
  const edge=blockPointerTarget(piece,{x:403,y:223},grip,grid);
  assert.equal(blockPointerTarget(piece,{x:424,y:223},grip,grid,edge).inside,false);
});

test('fractional pickup retains the exact grip and movement never waits on a scaling animation',()=>{
  const piece=engine.BLOCK_SHAPES[25],grid={left:105,top:205,pitch:40,cell:36,bounds:{left:100,top:200,right:426,bottom:526}};
  for(const touch of [false,true])for(const x of [.1,.4,.9]) {
    const grip={x,y:.3,touch},t=blockPointerTarget(piece,{x:300,y:400},grip,grid);
    assert.equal(t.x+t.width*x,300);assert.equal(t.y+t.height*.3+t.lift,400);
  }
  for(const reduced of [false,true]){
    const h=harness({reduced}),tray=h.el('tray');tray.handlers.pointerdown(h.pointer(54,718));
    assert.equal(tray.buttons[0]['aria-pressed'],'true','selection feedback starts on pointerdown');
    tray.handlers.pointermove(h.pointer(403,423));h.frame();
    const animations=h.el('drag-piece').firstElementChild.animations;
    assert.equal(animations.length,0);
    tray.handlers.pointercancel(h.pointer(403,423));assert.equal(h.el('drag-piece').hidden,true);

  }
});

test('drag release uses the displayed hysteresis target, while a fast final movement is re-evaluated',()=>{
  const h=harness({setup:r=>{r.tray=[r.piece(0,1),r.piece(0,2),r.piece(0,3)];}}),tray=h.el('tray');
  tray.handlers.pointerdown(h.pointer(36,754));tray.handlers.pointermove(h.pointer(142.9,223));h.frame();
  tray.handlers.pointermove(h.pointer(143.1,223));h.frame();assert.equal(h.previewIndices().includes(0),true);
  tray.handlers.pointerup(h.pointer(143.1,223));assert.equal(h.r.board[0],1);assert.equal(h.r.board[1],0);
  tray.handlers.pointerdown(h.pointer(36,754,1));tray.handlers.pointermove(h.pointer(163,223,1));h.frame();
  tray.handlers.pointerup(h.pointer(243,223,1));assert.equal(h.r.board[3],2);assert.equal(h.r.board[1],0);
});


test('placement preserves untouched tray art and all slot input targets; refill replaces only their contents',()=>{
  const h=harness({setup:r=>{r.tray=[r.piece(5,1),r.piece(5,2),r.piece(9,4)];}});
  const buttons=[...h.el('tray').buttons],art=buttons.map(b=>b.firstElementChild);
  h.choose(0);h.resetStats();h.click(7,0);
  assert.equal(h.stats.trayWrites,0);assert.equal(h.stats.slotWrites,1);
  assert.equal(h.el('tray').buttons[0],buttons[0]);assert.equal(buttons[0].disabled,true);
  assert.equal(buttons[1].firstElementChild,art[1]);assert.equal(buttons[2].firstElementChild,art[2]);
  h.choose(1);h.click(7,4);h.choose(2);h.click(5,6);
  assert.equal(h.r.score,160);assert.equal(h.r.moves,3);
  buttons.forEach((b,i)=>{assert.equal(h.el('tray').buttons[i],b);assert.notEqual(b.firstElementChild,art[i]);});
  const score=h.r.score;h.choose(0);h.click(0,0);assert.ok(h.r.score>score,'a refilled slot still accepts input');
});


test('a thousand cross-cell previews keep board DOM, sprite markup and layout measurements stable',()=>{
  const h=harness();h.choose();h.resetStats();
  const before=h.r.snapshot(),markup=h.el('placement-outline').innerHTML;
  for(let i=0;i<1000;i++)h.hover(1+i%3,1+i%5);
  assert.equal(h.stats.cellWrites,0);assert.equal(h.stats.overlayWrites,0);assert.equal(h.stats.rectReads,0);
  assert.equal(h.el('placement-outline').innerHTML,markup);assert.equal(h.painted(),4);
  assert.deepEqual(h.r.snapshot(),before);
});

test('line overlays predict simultaneous row/column clears, hide on blocked targets and follow scroll',()=>{
  const h=harness({setup:r=>{
    for(let i=0;i<8;i++){if(i!==3)r.board[3*8+i]=1;if(i!==3)r.board[i*8+3]=2;}
    r.tray=[r.piece(0,3),r.piece(0,4),r.piece(0,5)];
  }});
  h.choose();h.hover(3,3);
  const rails=h.el('line-preview').children;
  assert.deepEqual(rails.flatMap((n,i)=>!n.hidden?[i]:[]),[3,11]);
  assert.equal(h.el('line-preview').hidden,false);
  const before=h.el('placement-outline').style.transform;
  h.el('board').rect.top+=20;h.el('board').rect.bottom+=20;
  h.listeners.scroll();h.frame();assert.notEqual(h.el('placement-outline').style.transform,before);
  assert.deepEqual(rails.flatMap((n,i)=>!n.hidden?[i]:[]),[3,11]);
  h.hover(3,2);assert.equal(h.painted(),0);assert.equal(rails.filter(n=>!n.hidden).length,0);
  assert.equal(h.el('line-preview').hidden,true);
  h.hover(3,3);h.click(3,3);
  assert.equal(h.r.lines,2);assert.equal(h.r.score,405);assert.equal(rails.filter(n=>!n.hidden).length,0);
  assert.equal(h.el('line-preview').hidden,true,'inactive rails cannot retain an old width after phone rotation');
});


test('idle presentation requires explicit entry, shows reward tiers, and cannot start without funds',()=>{
  const h=harness({setup:r=>{r.state='idle';r.id='';r.tray=[null,null,null];}});
  assert.equal(h.r.state,'idle');assert.equal(h.el('entry-panel').open,true);assert.equal(h.el('tray').hidden,true);
  assert.equal(h.el('balance').textContent,'1,000');assert.equal(h.el('start').disabled,false);
  assert.equal(h.el('reward-tiers').children.length,3);assert.equal(h.el('board').inert,true);
  h.el('entry-panel').close();h.sync();assert.equal(h.el('entry-panel').open,false,'closing the entry sheet does not reopen or pay');
  assert.equal(h.r.state,'idle');h.el('round-open').onclick();assert.equal(h.el('entry-panel').open,true);
  h.el('start').onclick();assert.equal(h.r.state,'playing');assert.equal(h.el('entry-panel').open,false);assert.equal(h.el('tray').hidden,false);
  assert.equal(h.el('steps-left').textContent,'30');assert.equal(h.el('board').inert,false);
  const poor=harness({balance:49,setup:r=>{r.state='idle';r.id='';r.tray=[null,null,null];}});
  assert.equal(poor.el('start').disabled,true);assert.match(poor.el('entry-status').textContent,/积分不足/);
});

test('opening mobile panels cancels a drag and its queued frame without placing or charging',()=>{
  for(const [control,panel] of [['menu-open','settings-dialog'],['stats-open','stats-dialog'],['help','rules-dialog']]) {
    const h=harness(),before=h.r.snapshot(),tray=h.el('tray');
    tray.handlers.pointerdown(h.pointer(18,718));tray.handlers.pointermove(h.pointer(163,263));h.frame();
    assert.equal(h.el('drag-piece').hidden,false);assert.equal(h.painted(),4);
    tray.handlers.pointermove(h.pointer(203,263));assert.equal(h.frames.size,1);
    h.el(control).onclick();
    assert.equal(h.el(panel).open,true);assert.equal(h.el('drag-piece').hidden,true);
    assert.equal(h.el('placement-outline').hidden,true);assert.equal(h.frames.size,0);
    tray.handlers.pointerup(h.pointer(203,263));assert.deepEqual(h.r.snapshot(),before);
    h.el(panel).close();h.choose(1);h.click(0,0);assert.equal(h.r.moves,before.moves+1);
  }
});

test('30th optimistic move locks input until owner settlement and updates payout without duplicate credit presentation',()=>{
  const h=harness({deferred:true,setup:r=>{r.moves=29;r.revision=29;r.score=1995;r.tray=[r.piece(0,1),r.piece(0,2),r.piece(0,3)];}});
  h.choose(0);h.click(0,0);assert.equal(h.el('steps-left').textContent,'0');assert.equal(h.el('score').textContent,'2,000');
  assert.match(h.el('hint').textContent,/确认奖励/);assert.equal(h.el('result-dialog').open,false);
  assert.ok(h.el('tray').buttons.every(b=>b.disabled));h.choose(1);h.click(0,1);assert.equal(h.requests.length,1);
  h.flushMessages();assert.equal(h.r.state,'finished');assert.equal(h.r.result.amount,80);
  for(const item of [...h.timers.values()])if(item.ms===120)item.fn();
  assert.equal(h.el('result-dialog').open,true);assert.equal(h.el('result-amount').textContent,'80 积分');assert.match(h.el('result-net').textContent,/\+30/);
  assert.match(h.el('result-reason').textContent,/30 次/);assert.equal(h.el('reward-amount').textContent,'80');
  h.sync();assert.equal(h.el('result-amount').textContent,'80 积分');
});


test('tier feedback waits for confirmation, is not replayed, and yields to the next drag',()=>{
  const h=harness({reduced:false,deferred:true,setup:r=>{r.score=490;}});
  h.choose(0);h.click(1,2);
  assert.equal(h.el('reward-amount').textContent,'20');assert.equal(h.el('reward-timing').textContent,'结束时到账');
  assert.equal(h.el('tier-toast').hidden,true,'an unconfirmed projection does not celebrate');
  h.flushMessages();assert.equal(h.el('tier-toast').hidden,false);assert.match(h.el('tier-toast').textContent,/部分返还/);
  assert.equal(h.el('tier-toast').animations.length,1);
  const tiers=h.el('reward-tiers').children;
  assert.ok(tiers[0].classList.contains('reached'));assert.ok(tiers[1].classList.contains('next'));
  assert.match(h.el('reward-note').textContent,/再得 490 分/);
  h.sync();assert.equal(h.el('tier-toast').animations.length,1,'duplicate snapshots do not repeat an upgrade');
  const animation=h.el('tier-toast').animations[0];
  h.el('tray').handlers.pointerdown(h.pointer(36,754,1));h.el('tray').handlers.pointermove(h.pointer(163,263,1));h.frame();
  assert.equal(h.el('tier-toast').hidden,true);assert.equal(animation.cancelled,true);
});

test('rejected tier crossing rolls back progress and last-five-step hints need no ticking timer',()=>{
  const h=harness({deferred:true,setup:r=>{r.score=490;r.moves=25;r.revision=25;}});
  assert.equal(h.el('steps-phase').textContent,'最后 5 步');assert.ok(h.el('steps-badge').classList.contains('last-steps'));
  h.choose();h.click(1,2);assert.equal(h.el('reward-amount').textContent,'20');
  h.processRequest(true);while(h.replies.length)h.ack();h.flushMessages();
  assert.equal(h.el('reward-amount').textContent,'0');assert.equal(h.el('tier-toast').hidden,true);
  assert.equal(h.el('steps-left').textContent,'5');assert.match(h.el('reward-note').textContent,/再得 10 分/);
  assert.ok(!h.el('reward-tiers').children[0].classList.contains('reached'));
  h.choose(1);h.hover(0,0);assert.equal(h.el('steps-left').textContent,'5');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createController}=require('../src/native-session-store.js');
const step=()=>new Promise(resolve=>setImmediate(resolve));
test('native store checkpoints complete operations once, coalesces a microtask, and serializes writes',async()=>{
 let current=0,restores=0,release,reads=0;const writes=[];
 const controller=createController({store:{async get(){reads++;return null;},set(k,v){writes.push(v);if(writes.length===1)return new Promise(r=>release=r);return Promise.resolve();}},capture:()=>({current}),restore:()=>{restores++;return true;}});
 await Promise.all([controller.open(),controller.open()]);assert.equal(reads,1);assert.equal(restores,0);
 current=1;controller.saveSoon();current=2;controller.saveSoon();await step();assert.deepEqual(writes,[{current:2}]);
 current=3;controller.saveSoon();await step();assert.equal(writes.length,1);
 release();await controller.flush();assert.deepEqual(writes,[{current:2},{current:3}]);
 await controller.flush();assert.equal(writes.length,2);
});
test('flush consumes scheduled checkpoint instead of duplicating the pending microtask',async()=>{
 const writes=[];const c=createController({store:{get:async()=>null,set:async(k,v)=>writes.push(v)},capture:()=>({x:1}),restore:()=>true});
 await c.open();c.saveSoon();await c.flush();await step();assert.equal(writes.length,1);
});
test('invalid or unreadable saves never get overwritten by a new session',async()=>{
 for(const invalid of [false,true]){let writes=0;const c=createController({store:{get:async()=>{if(!invalid)throw Error('denied');return {bad:true};},set:async()=>writes++},capture:()=>({new:true}),restore:()=>false});
 assert.equal(await c.open(),invalid?'invalid':'unavailable');c.saveSoon();await c.flush();assert.equal(writes,0);assert.equal(c.writable,false);}
});
test('native write errors are visible, retry keeps latest state, and no false saved status is reported',async()=>{
 let value=1,fail=true;const statuses=[],written=[];const c=createController({store:{get:async()=>null,set:async(k,v)=>{if(fail)throw Error('full');written.push(v);}},capture:()=>({value}),restore:()=>true,onStatus:s=>statuses.push(s)});
 await c.open();assert.equal(await c.flush(),false);assert.equal(c.status,'error');assert.ok(!statuses.includes('saved'));
 fail=false;value=2;assert.equal(await c.flush(),true);assert.deepEqual(written,[{value:2}]);
});
test('timed-out native writes disable later writes to avoid stale data overwriting new snapshots',async()=>{
 let value=1,release;const calls=[];const c=createController({timeout:12,store:{get:async()=>null,set:(k,v)=>{calls.push(v);return new Promise(r=>release=r);}},capture:()=>({value}),restore:()=>true});
 await c.open();c.saveSoon();await step();value=2;c.saveSoon();await step();await c.flush();assert.equal(c.status,'error');assert.equal(c.writable,false);assert.equal(calls.length,1);release();
 value=3;await c.flush();assert.equal(calls.length,1);
});

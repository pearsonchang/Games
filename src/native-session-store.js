/* Ordered, event-driven persistence. Never write storage from animation frames. */
(function(root){
  'use strict';
  const KEY='mobile-session.v1';
  function createController({store,capture,restore,onStatus=()=>{},timeout=5000}){
    let ready=false,writable=false,scheduled=false,tail=Promise.resolve(),lastQueued=null,status='loading';
    let opening;
    function update(value,error){status=value;onStatus(value,error);}
    function bounded(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('Storage timeout');e.code='STORAGE_TIMEOUT';reject(e);},timeout);})]).finally(()=>clearTimeout(timer));}
    function open(){
      if(opening)return opening;
      opening=(async()=>{
        try{
          const value=await bounded(store.get(KEY));
          if(value!==null&&!restore(value)){ready=true;update('invalid');return status;}
          ready=true;writable=true;lastQueued=value===null?null:JSON.stringify(value);update(value===null?'empty':'restored');
        }catch(error){ready=true;update('unavailable',error);}
        return status;
      })();return opening;
    }
    function enqueue(){
      if(!ready||!writable)return;
      let value,serialized;
      try{value=capture();serialized=JSON.stringify(value);}catch(error){update('error',error);return;}
      if(serialized===lastQueued)return;
      lastQueued=serialized;
      // Serialize writes so an older async native operation cannot replace a newer snapshot.
      tail=tail.then(async()=>{
        if(!writable)return;
        try{await bounded(store.set(KEY,value));update('saved');}
        catch(error){
          lastQueued=null;
          // An uncancellable native timeout may still complete. Stop later writes
          // rather than allowing an older operation to replace a newer snapshot.
          if(error.code==='STORAGE_TIMEOUT')writable=false;
          update('error',error);
        }
      });
    }
    function saveSoon(){if(!ready||!writable||scheduled)return;scheduled=true;queueMicrotask(()=>{if(!scheduled)return;scheduled=false;enqueue();});}
    async function flush(){scheduled=false;enqueue();await tail;return status==='saved'||status==='empty'||status==='restored';}
    return {open,saveSoon,flush,get status(){return status;},get writable(){return writable;}};
  }
  root.PlayroomSessionStore={KEY,createController};
  if(typeof module!=='undefined')module.exports=root.PlayroomSessionStore;
})(typeof window==='undefined'?globalThis:window);

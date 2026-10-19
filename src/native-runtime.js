/* Native UI lifecycle only. All game rules and settlement stay in the parent. */
(function(root){
  'use strict';
  function createRuntime({device=root.PlayroomDevice,document=root.document,now=Date.now,onError=()=>{}}={}){
    const native=!!device?.isNative;
    let handles=[],started=false,active=true,lastHaptic=-Infinity,haptics=true,backBusy=false,generation=0;
    function report(error){onError(error);}
    async function safe(fn){try{return await fn();}catch(error){report(error);}}
    function closeDialog(){
      const own=[...(document?.querySelectorAll('dialog[open]')||[])].at(-1);
      if(own){own.close();return true;}
      for(const frame of document?.querySelectorAll('iframe:not([hidden])')||[]){
        try{if(frame.closest?.('[hidden]'))continue;const dialog=[...frame.contentDocument.querySelectorAll('dialog[open]')].at(-1);if(dialog){dialog.close();return true;}}catch{/* A foreign document never receives privileged access. */}
      }
      return false;
    }
    async function start({onActiveChange=()=>{},onBack=()=>false,onNavigate=()=>{}}={}){
      if(!native||started)return;
      started=true;const current=++generation;document?.documentElement.classList.add('native-app');
      const listen=async(name,callback)=>{
        const handle=await safe(()=>device.App.addListener(name,(...args)=>{if(started&&generation===current)return callback(...args);}));
        if(!handle)return;if(started&&generation===current)handles.push(handle);else await safe(()=>handle.remove());
      };
      await Promise.all([
        listen('appStateChange',({isActive})=>{if(typeof isActive!=='boolean'||active===isActive)return;active=isActive;onActiveChange(active);}),
        device.platform==='android'?listen('backButton',async()=>{
          if(backBusy)return;backBusy=true;
          try{if(closeDialog())return;if(await onBack())return;if(!started||generation!==current)return;await safe(()=>device.App.minimizeApp());}
          finally{backBusy=false;}
        }):Promise.resolve()
      ]);
      if(!started||generation!==current)return;
      const navigate=event=>{
        const a=event.target?.closest?.('a[href]');if(!a||event.defaultPrevented)return;
        let url,currentURL;try{url=new URL(a.href,root.location.href);currentURL=new URL(root.location.href);}catch{return;}
        // URL.origin can be "null" for a WKWebView's custom capacitor: scheme.
        // Compare the scheme and host instead of treating every opaque URL as local.
        const local=url.protocol===currentURL.protocol&&url.host===currentURL.host;
        if(url.protocol==='https:'&&!local){
          event.preventDefault();safe(()=>device.Browser.open({url:url.href}));
        }else if(a.target==='_blank'&&local){
          event.preventDefault();Promise.resolve(onNavigate()).then(saved=>{if(saved!==false&&started&&generation===current)root.location.href=url.href;}).catch(report);
        }
      };
      document?.addEventListener('click',navigate);
      handles.push({remove:()=>document?.removeEventListener('click',navigate)});
    }
    async function haptic(kind='selection'){
      if(!native||!active||!haptics||now()-lastHaptic<90)return false;
      if(!['selection','success','impact'].includes(kind))return false;
      lastHaptic=now();
      await safe(()=>kind==='success'?device.Haptics.notification({type:'SUCCESS'}):kind==='impact'?device.Haptics.impact({style:'LIGHT'}):device.Haptics.selectionChanged());
      return true;
    }
    async function dispose(){started=false;generation++;const previous=handles;handles=[];await Promise.all(previous.map(h=>safe(()=>h.remove())));}
    return {native,start,dispose,haptic,closeDialog,setHaptics(value){haptics=!!value;},get haptics(){return haptics;},get active(){return active;}};
  }
  const api={createRuntime};root.PlayroomNative=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

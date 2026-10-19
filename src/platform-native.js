/* Native persistence coordinator. No cloud connection is enabled by this file. */
(function(root){
  'use strict';
  const settingsKeys=['playroom.blocks.challenge.best.v1','playroom.blocks.sound.v1','playroom.2048.best.v1','playroom.2048.sound','playroom.2048.controls'];
  root.PlayroomI18n?.register({messages:{
    '正在恢复游乐舱…':'Restoring your playroom…',
    '历史结余':'Earlier balance',
    '关闭应用后可从本机存档恢复。':'Progress can be restored from this device after reopening the app.',
    '积分与对局保存在这台设备。卸载应用会清除存档；模拟积分不涉及真实资产。':'Points and rounds are saved on this device. Uninstalling clears the save. Demo points have no real-world value.',
    '收藏与探索足迹保存在这台设备。':'Favorites and exploration history are saved on this device.',
    '本次为临时试玩，请留意存档提示。':'This is a temporary session. Please check the save notice.',
    '触感反馈':'Haptic feedback','触感已开':'On','触感已关':'Off',
    '无法读取存档，本次临时试玩，已有存档不会被覆盖。':'Your save could not be read. This session is temporary; the existing save will not be overwritten.',
    '存档暂时未保存，请保留应用并稍后重试。':'Your latest progress has not been saved. Keep the app open and try again.',
    '存档格式无法恢复，本次临时试玩，原存档已保留。':'This save could not be restored. This session is temporary; the original save has been preserved.',
    '重新保存':'Retry save','退出游戏回到大厅':'Return to the lobby'
  }});
  function create({wallet,bridge,session,preferences,storage,onRefresh,onActiveChange,onBack}){
    if(!root.PlayroomDevice?.isNative)return null;
    const runtime=root.PlayroomNative.createRuntime();
    const store=root.PlayroomData.createLocalStore({preferences:root.PlayroomDevice.Preferences,namespace:'playroom.'});
    let ready=false,overlay,settingsCache={};
    const readSettings=()=>{
      for(const key of settingsKeys)try{const value=storage?.getItem(key);if(typeof value==='string'&&value.length<=128)settingsCache[key]=value;}catch{/* Preserve the native copy if Web Storage is unavailable. */}
      return {...settingsCache};
    };
    const checkpoint=root.PlayroomSessionStore.createController({store,
      capture:()=>({version:1,session:root.PlayroomSession.capture({wallet,bridge,session}),ui:{language:root.PlayroomI18n?.language||'zh-CN',haptics:runtime.haptics,settings:readSettings(),favorites:preferences.favorites.slice(),recent:preferences.recent.slice(),explored:preferences.explored.slice()}}),
      restore(value){
        if(value?.version!==1||!value.ui||!['en','zh-CN'].includes(value.ui.language)||typeof value.ui.haptics!=='boolean'||!value.ui.settings||typeof value.ui.settings!=='object'||Array.isArray(value.ui.settings)||!['favorites','recent','explored'].every(key=>Array.isArray(value.ui[key])&&value.ui[key].length<=9&&value.ui[key].every(id=>preferences.ids.has(id))))return false;
        for(const [key,setting] of Object.entries(value.ui.settings))if(!settingsKeys.includes(key)||typeof setting!=='string'||setting.length>128)return false;
        if(!root.PlayroomSession.restore(value.session,{wallet,bridge,session}))return false;
        settingsCache={...value.ui.settings};
        runtime.setHaptics(value.ui.haptics);
        for(const key of ['favorites','recent','explored'])preferences[key]=preferences.clean(value.ui[key]);
        preferences.recent=preferences.recent.slice(0,3);preferences.save();
        for(const [key,setting] of Object.entries(value.ui.settings))try{storage?.setItem(key,setting);}catch{/* The native checkpoint remains authoritative for settings. */}
        root.PlayroomI18n?.setLanguage(value.ui.language);
        return true;
      },
      onStatus(status){const previous=session.storageStatus;session.storageStatus=status;const warnings=['invalid','unavailable','error'];if(ready&&previous!==status&&(warnings.includes(previous)||warnings.includes(status)))onRefresh();}
    });
    async function init(){
      overlay=root.document.createElement('div');overlay.className='native-boot';overlay.setAttribute('role','status');
      overlay.innerHTML='<strong>PLAYROOM</strong><span>正在恢复游乐舱…</span>';root.document.body.append(overlay);
      void runtime.start({onActiveChange:isActive=>{onActiveChange(isActive);if(!isActive)void checkpoint.flush();else checkpoint.saveSoon();},onBack,onNavigate:()=>checkpoint.flush()}).catch(()=>{});
      await checkpoint.open();ready=true;session.native=true;session.storageStatus=checkpoint.status;overlay.remove();
      root.document.addEventListener('playroom:languagechange',()=>checkpoint.saveSoon());
      root.addEventListener('pagehide',()=>{void checkpoint.flush();});
      // Storage events from same-origin game frames save sound settings and bests.
      root.addEventListener('storage',event=>{if(settingsKeys.includes(event.key))checkpoint.saveSoon();});
      checkpoint.saveSoon();return checkpoint.status;
    }
    function decorate(content,page){
      if(!ready)return;
      if(['invalid','unavailable','error'].includes(checkpoint.status)){
        const note=root.document.createElement('div');note.className='native-notice';note.setAttribute('role','status');
        note.textContent=checkpoint.status==='invalid'?'存档格式无法恢复，本次临时试玩，原存档已保留。':checkpoint.status==='unavailable'?'无法读取存档，本次临时试玩，已有存档不会被覆盖。':'存档暂时未保存，请保留应用并稍后重试。';
        if(checkpoint.writable){const retry=root.document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent='重新保存';retry.onclick=()=>{void checkpoint.flush();};note.append(retry);}
        content.prepend(note);
      }
      if(page!=='me')return;
      const panel=root.document.createElement('div');panel.className='native-settings';
      const label=root.document.createElement('span');label.textContent='触感反馈';
      const toggle=root.document.createElement('button');toggle.type='button';toggle.setAttribute('aria-pressed',String(runtime.haptics));toggle.textContent=runtime.haptics?'触感已开':'触感已关';
      toggle.onclick=()=>{runtime.setHaptics(!runtime.haptics);checkpoint.saveSoon();onRefresh();void runtime.haptic();};panel.append(label,toggle);(content.querySelector('[data-native-settings-slot]')||content).append(panel);
    }
    return {init,decorate,saveSoon:()=>checkpoint.saveSoon(),flush:()=>checkpoint.flush(),haptic:kind=>runtime.haptic(kind),get active(){return runtime.active;},get ready(){return ready;},get status(){return checkpoint.status;}};
  }
  root.PlayroomMobile={create};
})(typeof window==='undefined'?globalThis:window);

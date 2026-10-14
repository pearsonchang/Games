'use strict';
class FairnessPanel {
  constructor() {
    this.current=null; this.lastRecord=null; this.revision=0;
    const strip=document.createElement('div');strip.className='fairness-strip';
    strip.innerHTML='<span><i aria-hidden="true">◇</i> 本地验证试点</span><button type="button">验证记录 <span aria-hidden="true">↗</span></button>';
    document.querySelector('.arena-head').after(strip);
    this.button=strip.querySelector('button');
    this.dialog=document.createElement('dialog');this.dialog.className='fairness-dialog';this.dialog.setAttribute('aria-labelledby','fairness-title');
    this.dialog.innerHTML=`<div class="fairness-heading"><div><span class="fairness-eyebrow">ROUND RECEIPT / 01</span><h2 id="fairness-title">这一掷，可以复算</h2></div><button type="button" data-fair-close aria-label="关闭验证记录">×</button></div>
      <p class="fairness-boundary">本地演示 · 尚未上链。可核对规则、点数和奖励；浏览器记录无法证明平台未挑选结果或事后重造整份记录。</p>
      <div class="fairness-steps"><span>01 固定规则</span><span>02 提交承诺</span><span>03 公开复算</span></div>
      <p class="fairness-phase" role="status"></p><div class="fairness-receipt-summary"></div><p class="fairness-meta"></p>
      <div class="fairness-actions"><button type="button" data-fair-verify>复算本局</button><button type="button" data-fair-export>导出记录</button></div>
      <div class="fairness-checks" role="status" aria-live="polite"></div><details class="fairness-export" hidden><summary>复制或手动保存本局记录</summary><textarea readonly aria-label="本局 JSON 记录" spellcheck="false"></textarea><button type="button" data-fair-copy>复制记录</button><p role="status">可下载文件，也可复制记录到独立验证页。</p></details><details class="fairness-technical"><summary>查看种子与完整摘要</summary><dl class="fairness-fields"></dl></details>
      <a class="fairness-verifier-link" href="fairness.html" target="_blank" rel="noopener">打开独立验证页 ↗</a><p class="fairness-note">只保存最近 30 局已完成的记录到本机；积分仍随页面刷新重置。</p>`;
    document.body.append(this.dialog);
    this.button.onclick=()=>{this.render();this.dialog.showModal();};
    this.dialog.querySelector('[data-fair-close]').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('click',e=>{if(e.target===this.dialog){const r=this.dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.dialog.close();}});
    this.dialog.querySelector('[data-fair-verify]').onclick=()=>this.verify();
    this.dialog.querySelector('[data-fair-export]').onclick=()=>{
      if(!this.lastRecord)return;
      const value=JSON.stringify(this.lastRecord,null,2)+'\n',fallback=this.dialog.querySelector('.fairness-export');
      fallback.hidden=false;fallback.open=true;fallback.querySelector('textarea').value=value;
      const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`playroom-${this.lastRecord.roundId}-${this.lastRecord.sessionId.slice(0,8)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    this.dialog.querySelector('[data-fair-copy]').onclick=async()=>{
      const area=this.dialog.querySelector('.fairness-export textarea'),message=this.dialog.querySelector('.fairness-export p');
      try{await navigator.clipboard.writeText(area.value);message.textContent='已复制，可粘贴到独立验证页。';}catch{area.focus();area.select();message.textContent='已选中记录，请使用系统复制或长按复制。';}
    };
    this.render();
  }
  update(proof,roundState) {
    const key=proof?.recordHash||[proof?.roundId,proof?.state,proof?.commitment,roundState].join(':');
    if(key===this.key)return;
    this.key=key;this.current=proof||(['rolling','finished'].includes(roundState)?{state:'unavailable'}:null);this.lastRecord=proof?.state==='revealed'?proof:null;this.revision++;
    this.button.textContent=proof?.state==='revealed'?'复算这一掷 ↗':'验证记录 ↗';
    if(this.dialog.open)this.render();
  }
  render() {
    const p=this.current;
    const messages={preparing:'正在固定本局规则…',committed:'开局承诺已生成 · 等待客户端随机种子',prepared:'开局承诺已固定 · 落定后公开种子',revealed:'点数已落定 · 现在可以独立复算',failed:'本局准备失败 · 投入已退回',unavailable:'当前环境仅支持普通试玩，未生成验证记录。请使用 HTTPS 或 localhost。'};
    this.dialog.querySelector('.fairness-phase').textContent=messages[p?.state]||'完成一局后，这里会展示验证记录。';
    this.dialog.querySelector('.fairness-meta').textContent=`${p?.rulesVersion||DiceRules.manifest.version} · ${p?.roundId||'尚未开局'}`;
    const summary=this.dialog.querySelector('.fairness-receipt-summary');summary.replaceChildren();summary.hidden=!this.lastRecord;
    if(this.lastRecord){
      const r=this.lastRecord.result,equation=document.createElement('strong'),outcome=document.createElement('p');
      equation.textContent=r.values.join(' + ')+' = '+r.sum+' 点';
      outcome.textContent=`${r.won?'命中':'未命中'} · 到账 ${r.amount.toLocaleString()} · 净收益 ${r.net>0?'+':''}${r.net} 模拟积分`;
      summary.append(equation,outcome);
    }
    const fields=this.dialog.querySelector('.fairness-fields');fields.replaceChildren();
    const entries=[['规则版本',p?.rulesVersion||DiceRules.manifest.version],['对局编号',p?.roundId||'尚未开局'],['规则摘要',p?.rulesHash],['开局承诺',p?.commitment],['客户端种子',p?.clientSeed],['公开种子',p?.serverSeed],['记录摘要',p?.recordHash]];
    for(const [label,value] of entries)if(value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;fields.append(dt,dd);}
    this.dialog.querySelector('[data-fair-verify]').disabled=!this.lastRecord;
    this.dialog.querySelector('[data-fair-export]').disabled=!this.lastRecord;
    this.dialog.querySelector('.fairness-checks').replaceChildren();
    const fallback=this.dialog.querySelector('.fairness-export');fallback.hidden=true;fallback.open=false;fallback.querySelector('textarea').value='';
  }
  async verify() {
    if(!this.lastRecord)return;
    const record=this.lastRecord,revision=this.revision;
    const output=this.dialog.querySelector('.fairness-checks');output.textContent='正在重新计算…';
    const result=await Fairness.verify(record);
    if(revision!==this.revision)return;
    output.replaceChildren();
    const title=document.createElement('strong');title.textContent=result.ok?'复算通过 · 本地记录一致':'复算未通过';output.append(title);
    for(const check of result.checks){const item=document.createElement('p');item.textContent=(check.ok?'✓ ':'× ')+check.name;output.append(item);}
  }
}

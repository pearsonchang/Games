'use strict';
(() => {
  const $=id=>document.getElementById(id),maxLength=100000;
  let records=[],revision=0;
  try { const saved=JSON.parse(localStorage.getItem('playroom.fairness.dice.v1')||'[]');if(Array.isArray(saved))records=saved.slice(-30).filter(r=>r&&typeof r==='object'&&typeof r.roundId==='string'&&typeof r.sessionId==='string').reverse(); } catch { /* Files can still be imported without storage. */ }
  records.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${r.roundId||'未知对局'} · ${(r.sessionId||'').slice(0,8)} · ${Array.isArray(r.result?.values)?r.result.values.join(' + '):'未知点数'}`;$('recent').append(option);});
  $('recent').onchange=()=>{revision++;const r=records[Number($('recent').value)];if($('recent').value!==''&&r){$('receipt').value=JSON.stringify(r,null,2);$('verification').textContent='记录已载入，点击重新计算。';}};
  $('receipt').oninput=()=>{revision++;$('verification').classList.remove('fail');$('verification').textContent='记录已更改，请重新计算。';};
  $('receipt-file').onchange=async()=>{const file=$('receipt-file').files[0];const rev=++revision;if(!file)return;if(file.size>maxLength){$('verification').textContent='文件过大，请导入 100 KB 以内的单局记录。';return;}const value=await file.text();if(rev!==revision)return;$('receipt').value=value;$('verification').textContent='文件已载入，点击重新计算。';};
  $('verify').onclick=async()=>{
    const rev=++revision,output=$('verification');output.classList.remove('fail');output.textContent='正在重新计算…';$('verify').disabled=true;
    try {
      if($('receipt').value.length>maxLength)throw new Error('记录过大，请使用单局记录。');
      const record=JSON.parse($('receipt').value),result=await Fairness.verify(record);
      if(rev!==revision)return;
      output.replaceChildren();output.classList.toggle('fail',!result.ok);
      const title=document.createElement('h3');title.textContent=result.ok?'复算通过 · 本地记录一致':'复算未通过';output.append(title);
      if(result.ok){const summary=document.createElement('p');summary.textContent=`顶面 ${record.result.values.join(' + ')} = ${record.result.sum} 点；到账 ${record.result.amount}，净收益 ${record.result.net} 模拟积分。`;output.append(summary);}
      const list=document.createElement('ul');for(const check of result.checks){const item=document.createElement('li');item.textContent=(check.ok?'✓ ':'× ')+check.name;list.append(item);}output.append(list);
    } catch(error) {if(rev===revision){output.classList.add('fail');output.textContent='无法验证：'+(error instanceof SyntaxError?'请输入完整有效的 JSON 记录。':error.message);}}
    finally {$('verify').disabled=false;}
  };
  const table=document.createElement('table');table.className='fairness-probabilities';
  table.innerHTML='<caption>三颗骰子共 216 种等概率组合；奖励含投入。</caption><thead><tr><th scope="col">目标</th><th scope="col">命中概率</th><th scope="col">到账</th><th scope="col">理论返还率</th></tr></thead>';
  const tbody=document.createElement('tbody');
  const entries=[['size','small','小'],['size','big','大'],['triple',null,'三同号'],...Array.from({length:16},(_,i)=>['sum',i+3,`${i+3} 点`])];
  for(const [mode,target,label]of entries){const odds=DiceRules.odds(mode,target),row=document.createElement('tr');for(const text of [label,`${(odds.wins/odds.total*100).toFixed(2)}%`,odds.amount.toLocaleString(),`${(odds.rtpNumerator/odds.rtpDenominator*100).toFixed(2)}%`]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}tbody.append(row);}table.append(tbody);$('sum-rules').append(table);
  Fairness.rulesHash().then(hash=>$('rules-hash').textContent=hash).catch(()=>$('rules-hash').textContent='当前环境不可用，请使用 HTTPS 或 localhost。');
})();

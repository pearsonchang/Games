'use strict';
(function(root){
 function render(container,inspection,ethers){
  if(!container)return;
  const funding=inspection.funding,unit=inspection.nativePayment?'Sepolia ETH':'测试 LINK';
  const amount=value=>typeof value==='bigint'?`${ethers.formatEther(value)} ${unit}`:'尚未验证';
  container.replaceChildren();
  const title=document.createElement('h3');title.textContent='资金检查';container.append(title);
  const fields=document.createElement('dl');fields.className='fairness-fields';
  const reference=inspection.nativePayment?funding.estimate?.baselineWei:null;
  for(const [label,value]of [
   ['订阅余额',amount(inspection.nativePayment?inspection.sub?.nativeBalance:inspection.sub?.balance)],
   ['文档参数参考',amount(reference)],
   ['已审核预留门槛',amount(funding.requiredWei)],
   ['单局 VRF 实际费用','待真实回调后核实'],
   ['当前入口',inspection.recoveryOnly?'旧版恢复模式 · 暂停新局':funding.ready?'预算检查通过':'暂停新局']
  ]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;fields.append(dt,dd);}
  container.append(fields);
  const note=document.createElement('p');note.className='fairness-note';note.textContent='预留参考用于核查资金，不是实际扣费或充值建议。当前链的完整费用和回调预算尚未验收，余额充足也不会自动开放旧版。';container.append(note);
  if(funding.reasons?.length){const list=document.createElement('ul');for(const reason of funding.reasons){const li=document.createElement('li');li.textContent=reason.message;list.append(li);}container.append(list);}
 }
 root.FairnessFundingView=Object.freeze({render});
})(globalThis);

'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FairnessFees=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const MAX_AGE_MS=60000;
 function quote(gas,fees,balance,nowMs=Date.now()){
  if(typeof gas!=='bigint'||gas<=0n||typeof balance!=='bigint'||balance<0n)throw Error('无法读取有效的 Gas 预估或钱包余额。');
  const gasLimit=(gas*120n+99n)/100n;
  let overrides,price;
  if(typeof fees.maxFeePerGas==='bigint'&&typeof fees.maxPriorityFeePerGas==='bigint'){
   if(fees.maxFeePerGas<=0n||fees.maxPriorityFeePerGas<0n||fees.maxPriorityFeePerGas>fees.maxFeePerGas)throw Error('网络费用报价无效。');
   price=fees.maxFeePerGas;overrides={gasLimit,maxFeePerGas:price,maxPriorityFeePerGas:fees.maxPriorityFeePerGas};
  }else if(typeof fees.gasPrice==='bigint'&&fees.gasPrice>0n){
   price=fees.gasPrice;overrides={gasLimit,gasPrice:price};
  }else throw Error('无法读取网络费用，请稍后重新预估。');
  const maxCostWei=gasLimit*price;
  return {gas,overrides,maxCostWei,balanceWei:balance,affordable:balance>=maxCostWei,createdAtMs:nowMs,expiresAtMs:nowMs+MAX_AGE_MS};
 }
 function assertFresh(value,nowMs=Date.now()){
  if(!value||!Number.isFinite(value.createdAtMs)||nowMs<value.createdAtMs||nowMs>=value.expiresAtMs)throw Error('费用报价已过期，请重新预估。');
  if(!value.affordable)throw Error('钱包余额低于本次交易的费用上限。');
  return value.overrides;
 }
 async function estimate(provider,signer,request){
  if(request.value&&BigInt(request.value)!==0n)throw Error('此费用工具仅用于不转账的测试操作。');
  const [gas,fees,balance]=await Promise.all([signer.estimateGas(request),provider.getFeeData(),provider.getBalance(await signer.getAddress())]);
  return quote(gas,fees,balance);
 }
 return Object.freeze({MAX_AGE_MS,quote,assertFresh,estimate});
});

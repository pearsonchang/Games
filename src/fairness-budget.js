'use strict';
// Funding estimates never represent an actual VRF charge. New requests stay
// disabled until a bounded administrator policy records a real Sepolia callback
// benchmark. This module must not gate viewing or settling an existing round.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FairnessBudget=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const CHAIN_ID=11155111,MAX_AGE_MS=60000,MAX_AGE_BLOCKS=5;
 // Read methods from the verified Sepolia VRFCoordinatorV2_5 ABI, not V2 getters.
 const coordinatorABI=Object.freeze([
  'function s_config() view returns(uint16 minimumRequestConfirmations,uint32 maxGasLimit,bool reentrancyLock,uint32 stalenessSeconds,uint32 gasAfterPaymentCalculation,uint32 fulfillmentFlatFeeNativePPM,uint32 fulfillmentFlatFeeLinkDiscountPPM,uint8 nativePremiumPercentage,uint8 linkPremiumPercentage)',
  'function s_provingKeys(bytes32) view returns(bool exists,uint64 maxGas)',
  'function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)',
  'function pendingRequestExists(uint256) view returns(bool)'
 ]);
 const uint=(value,label,max=(1n<<256n)-1n)=>{
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error(label+' 必须是精确整数。');
  if(!['bigint','number','string'].includes(typeof value)||!/^(0|[1-9][0-9]*)$/.test(String(value)))throw Error(label+' 必须是非负整数。');
  const n=BigInt(value);if(n>max)throw Error(label+' 超出范围。');return n;
 };
 const positive=(value,label,max)=>{const n=uint(value,label,max);if(n===0n)throw Error(label+' 必须大于零。');return n;};
 const time=(value,label)=>{if(!Number.isSafeInteger(value)||value<0)throw Error(label+' 无效。');return value;};
 const address=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value)&&!/^0x0{40}$/.test(value);
 const hash=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value)&&!/^0x0{64}$/.test(value);
 const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
 const ceilDiv=(n,d)=>(n+d-1n)/d;
 function estimateNativeReserve(input){
  const callback=positive(input.callbackGasLimit,'回调 Gas',0xffffffffn);
  const verification=positive(input.maxVerificationGas??200000n,'验证 Gas');
  if(verification<200000n)throw Error('验证 Gas 预算不能低于文档基线。');
  const price=positive(input.maxGasPriceWei,'Gas lane 上限',(1n<<64n)-1n);
  const premium=uint(input.nativePremiumPercentage,'原生币溢价',255n);
  const flat=uint(input.fulfillmentFlatFeeNativePPM,'原生币固定费用',0xffffffffn)*1000000000000n;
  const after=uint(input.gasAfterPaymentCalculation??0n,'后续记账 Gas',0xffffffffn);
  const extra=uint(input.extraGasBuffer??0n,'额外 Gas 余量');
  const margin=uint(input.safetyMarginBps??12500n,'资金余量');
  const pendingBuffer=uint(input.pendingBufferRequests??1n,'额外请求预留');
  if(margin<12500n||pendingBuffer<1n)throw Error('保守策略至少保留 25% 余量及一笔额外请求预算。');
  const charge=gas=>ceilDiv(gas*price*(100n+premium),100n)+flat;
  // Official 200k verification example is only a baseline. Add accounting gas,
  // a margin and an extra request reserve; do not call this Chainlink's Max Cost.
  const baselineWei=charge(200000n+callback);
  const modelPerRequestWei=ceilDiv(charge(verification+callback+after+extra)*margin,10000n);
  const override=input.perRequestReserveWei==null?0n:positive(input.perRequestReserveWei,'审核后的每局预留');
  if(override!==0n&&override<modelPerRequestWei)throw Error('策略预留不能低于保守本地模型。');
  const conservativePerRequestWei=override>modelPerRequestWei?override:modelPerRequestWei;
  return Object.freeze({baselineWei,modelPerRequestWei,conservativePerRequestWei,
   pendingBufferWei:conservativePerRequestWei*pendingBuffer,
   bufferedRequiredWei:conservativePerRequestWei*(1n+pendingBuffer),
   pendingBufferRequests:pendingBuffer,
   label:'保守本地资金预留估算；不等于 Chainlink 页面 Max Cost，也不是实际收费。',
   actualFeeKnown:false});
 }
 function assessFunding(snapshot,options={}){
  const result={ready:false,canViewExisting:true,reasons:[],message:'',currency:null,balanceWei:null,requiredWei:null,shortfallWei:null,estimate:null,actualFeeKnown:false,snapshotExpiresAtMs:null,policyId:null};
  const add=(code,message)=>result.reasons.push({code,message});
  const finish=()=>{
   result.ready=result.reasons.length===0;
   result.message=result.ready?'资金策略检查通过；实际 VRF 费用仍以链上扣费为准。':result.reasons.map(x=>x.message).join(' ');
   return Object.freeze(result);
  };
  try{
   if(!snapshot)throw Error('没有可核验的资金快照。');
   if(uint(snapshot.chainId,'链 ID')!==BigInt(CHAIN_ID))add('WRONG_CHAIN','资金预检仅支持 Ethereum Sepolia。');
   if(!address(snapshot.coordinator)||!hash(snapshot.keyHash))throw Error('协调器或 Gas lane 标识无效。');
   const subId=positive(snapshot.subscriptionId,'订阅 ID');
   const now=time(options.nowMs,'当前时间'),readAt=time(snapshot.readAtMs,'读取时间'),blockTime=time(snapshot.blockTimestampMs,'区块时间');
   const currentBlock=uint(options.currentBlock,'当前区块'),readBlock=uint(snapshot.blockNumber,'读取区块');
   result.snapshotExpiresAtMs=Math.min(readAt+MAX_AGE_MS,blockTime+MAX_AGE_MS);
   if(now<readAt||now<blockTime||currentBlock<readBlock)add('FUTURE_SNAPSHOT','资金快照时间或区块与当前状态不一致。');
   else if(now>result.snapshotExpiresAtMs||currentBlock-readBlock>BigInt(MAX_AGE_BLOCKS))add('STALE_SNAPSHOT','资金预检已过期，请重新读取链上状态。');
   if(!hash(snapshot.blockHash))throw Error('资金快照缺少区块哈希。');
   if(typeof snapshot.nativePayment!=='boolean')throw Error('支付币种未知。');
   const config=snapshot.config,lane=snapshot.lane,sub=snapshot.subscription;
   if(!config||!lane||!sub)throw Error('资金或协调器配置不完整。');
   if(typeof lane.exists!=='boolean'||typeof sub.pendingRequestExists!=='boolean')throw Error('随机数密钥或待处理请求状态未知。');
   if(!lane.exists)add('UNKNOWN_GAS_LANE','所选随机数 Gas lane 未注册。');
   const callback=positive(snapshot.callbackGasLimit,'回调 Gas',0xffffffffn);
   const confirmations=positive(snapshot.confirmations,'确认数',0xffffn);
   const minConfirmations=positive(config.minimumRequestConfirmations,'协调器确认数',0xffffn);
   if(callback<100000n||callback>positive(config.maxGasLimit,'协调器 Gas 上限',0xffffffffn)||confirmations<3n||confirmations<minConfirmations||confirmations>200n)add('INVALID_REQUEST_CONFIG','回调 Gas 或确认数超出已支持范围。');
   result.currency=snapshot.nativePayment?'ETH':'LINK';
   if(!snapshot.nativePayment){add('LINK_BUDGET_UNVERIFIED','LINK 汇率与费用模型尚未验证；可以查看旧局，暂不能发起新局。');return finish();}
   result.balanceWei=uint(sub.nativeBalanceWei,'订阅 ETH 余额',(1n<<96n)-1n);
   if(sub.pendingRequestExists)add('PENDING_REQUEST','订阅还有待处理请求；数量和总预留未知，先完成旧局再重新预检。');
   const estimateInputs={callbackGasLimit:callback,maxGasPriceWei:lane.maxGasPriceWei,
    nativePremiumPercentage:config.nativePremiumPercentage,fulfillmentFlatFeeNativePPM:config.fulfillmentFlatFeeNativePPM,
    gasAfterPaymentCalculation:config.gasAfterPaymentCalculation};
   result.estimate=estimateNativeReserve(estimateInputs);
   const policy=options.policy;
   if(!policy){add('POLICY_REQUIRED','当前 Sepolia 分叉尚缺少已审核的真实回调基准与资金策略，新局已暂停。');}
   else{
    const scopeValid=typeof policy.id==='string'&&policy.id.trim()&&policy.enabled===true&&
     uint(policy.chainId,'策略链 ID')===BigInt(CHAIN_ID)&&same(policy.coordinator,snapshot.coordinator)&&same(policy.keyHash,snapshot.keyHash)&&
     positive(policy.subscriptionId,'策略订阅 ID')===subId&&positive(policy.callbackGasLimit,'策略回调 Gas')===callback;
    if(!scopeValid)add('POLICY_SCOPE_MISMATCH','资金策略未启用，或不适用于当前订阅和合约配置。');
    const reviewed=uint(policy.reviewedAtBlock,'策略审核区块'),until=uint(policy.validUntilBlock,'策略到期区块');
    if(reviewed>readBlock||until<currentBlock||until<reviewed||now>=time(policy.expiresAtMs,'策略到期时间'))add('POLICY_EXPIRED','资金策略已过期，或审核区块尚未到达。');
    // These are administrator attestations, not a claim that this pure function
    // verifies a receipt. Never accept policy from URL/localStorage/user input.
    const benchmark=policy.benchmark;
    if(!benchmark||benchmark.fork!=='glamsterdam'||benchmark.callbackSucceeded!==true||!hash(benchmark.transactionHash)||
     uint(benchmark.blockNumber,'回调基准区块')>reviewed||positive(benchmark.callbackGasUsed,'回调基准 Gas')>callback)
     add('CALLBACK_BENCHMARK_REQUIRED','策略缺少当前 Sepolia 分叉下成功回调的审核证据。');
    const pendingBufferRequests=positive(policy.pendingBufferRequests,'策略额外请求预留');
    const safetyMarginBps=positive(policy.safetyMarginBps,'策略资金余量');
    const maxVerificationGas=positive(policy.maxVerificationGas,'策略验证 Gas');
    const extraGasBuffer=uint(policy.extraGasBuffer,'策略 Gas 余量');
    result.estimate=estimateNativeReserve({...estimateInputs,pendingBufferRequests,safetyMarginBps,maxVerificationGas,extraGasBuffer,perRequestReserveWei:policy.perRequestReserveWei});
    if(!result.reasons.some(x=>x.code.startsWith('POLICY_')||x.code==='CALLBACK_BENCHMARK_REQUIRED')){
     result.policyId=policy.id;result.requiredWei=result.estimate.bufferedRequiredWei;
     result.shortfallWei=result.balanceWei<result.requiredWei?result.requiredWei-result.balanceWei:0n;
     if(result.shortfallWei>0n)add('INSUFFICIENT_RESERVE','订阅余额低于已审核策略的保守资金预留，新局已禁用。');
    }
   }
  }catch(error){add('FUNDING_UNAVAILABLE',error?.message||'资金预检暂不可用。');}
  return finish();
 }
 async function readSnapshot(ethers,provider,input,options={}){
  const fail=message=>{const error=Error(message);error.code='FUNDING_UNAVAILABLE';throw error;};
  if(uint((await provider.getNetwork()).chainId,'链 ID')!==BigInt(CHAIN_ID))fail('请连接 Ethereum Sepolia 后读取资金配置。');
  if(!address(input.coordinator)||!hash(input.keyHash)||typeof input.nativePayment!=='boolean')fail('资金读取参数无效。');
  const coordinator=ethers.getAddress(input.coordinator),subscriptionId=positive(input.subscriptionId,'订阅 ID');
  const block=await provider.getBlock('latest');
  if(!block||!hash(block.hash))fail('无法取得可核验的最新区块。');
  const blockNumber=Number(uint(block.number,'读取区块',BigInt(Number.MAX_SAFE_INTEGER)));
  const blockTimestampMs=Number(uint(block.timestamp,'区块时间',BigInt(Math.floor(Number.MAX_SAFE_INTEGER/1000))))*1000;
  const contract=new ethers.Contract(coordinator,coordinatorABI,provider),tag={blockTag:blockNumber};
  const [config,lane,sub,pending]=await Promise.all([
   contract.s_config(tag),contract.s_provingKeys(input.keyHash,tag),contract.getSubscription(subscriptionId,tag),contract.pendingRequestExists(subscriptionId,tag)
  ]);
  if(uint((await provider.getNetwork()).chainId,'链 ID')!==BigInt(CHAIN_ID))fail('读取过程中钱包网络已改变，请重新检查。');
  const confirmedBlock=await provider.getBlock(blockNumber);
  if(!confirmedBlock||!same(confirmedBlock.hash,block.hash))fail('读取时发生区块重组，请重新检查资金。');
  const readAtMs=time(options.nowMs??Date.now(),'读取时间');
  return Object.freeze({chainId:CHAIN_ID,coordinator,keyHash:input.keyHash.toLowerCase(),subscriptionId,
   callbackGasLimit:positive(input.callbackGasLimit,'回调 Gas',0xffffffffn),confirmations:positive(input.confirmations??3,'确认数',0xffffn),nativePayment:input.nativePayment,
   blockNumber,blockHash:block.hash,blockTimestampMs,readAtMs,
   config:{minimumRequestConfirmations:config.minimumRequestConfirmations,maxGasLimit:config.maxGasLimit,
    gasAfterPaymentCalculation:config.gasAfterPaymentCalculation,fulfillmentFlatFeeNativePPM:config.fulfillmentFlatFeeNativePPM,nativePremiumPercentage:config.nativePremiumPercentage,linkPremiumPercentage:config.linkPremiumPercentage},
   lane:{exists:lane.exists,maxGasPriceWei:lane.maxGas},
   subscription:{nativeBalanceWei:sub.nativeBalance,linkBalanceBaseUnits:sub.balance,owner:sub.owner,consumers:Array.from(sub.consumers),pendingRequestExists:pending}});
 }
 return Object.freeze({CHAIN_ID,MAX_AGE_MS,MAX_AGE_BLOCKS,coordinatorABI,estimateNativeReserve,assessFunding,readSnapshot});
});

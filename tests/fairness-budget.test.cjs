'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const budget=require('../src/fairness-budget.js');
const coordinator='0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B';
const keyHash='0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae';
const NOW=1791907200000,BLOCK=11910000,BLOCK_HASH='0x'+'ab'.repeat(32),TX_HASH='0x'+'cd'.repeat(32);
function snapshot(){return {
 chainId:11155111,coordinator,keyHash,subscriptionId:88713210532806278298328455265925693511603970798844438983868912844783164962713n,
 callbackGasLimit:150000n,confirmations:3n,nativePayment:true,blockNumber:BLOCK,blockHash:BLOCK_HASH,blockTimestampMs:NOW-12000,readAtMs:NOW,
 config:{minimumRequestConfirmations:3n,maxGasLimit:2500000n,gasAfterPaymentCalculation:38900n,fulfillmentFlatFeeNativePPM:0n,nativePremiumPercentage:24n,linkPremiumPercentage:20n},
 lane:{exists:true,maxGasPriceWei:500000000000n},
 subscription:{nativeBalanceWei:1000000000000000000n,linkBalanceBaseUnits:0n,pendingRequestExists:false}
};}
function policy(s=snapshot()){return {
 id:'test-only-admin-attestation',enabled:true,chainId:11155111,coordinator,keyHash,subscriptionId:s.subscriptionId,callbackGasLimit:150000n,
 reviewedAtBlock:BLOCK-1,validUntilBlock:BLOCK+100,expiresAtMs:NOW+3600000,
 benchmark:{fork:'glamsterdam',callbackSucceeded:true,transactionHash:TX_HASH,blockNumber:BLOCK-1,callbackGasUsed:110000n},
 maxVerificationGas:200000n,extraGasBuffer:0n,safetyMarginBps:12500n,pendingBufferRequests:1n
};}
function assess(s=snapshot(),p=policy(s),overrides={}){return budget.assessFunding(s,{nowMs:NOW,currentBlock:BLOCK,policy:p,...overrides});}
const codes=result=>result.reasons.map(x=>x.code);
test('default readiness stays closed even with abundant ETH; the documented baseline is not a fee quote',()=>{
 const result=assess(snapshot(),null);
 assert.equal(result.ready,false);assert.equal(result.canViewExisting,true);
 assert.ok(codes(result).includes('POLICY_REQUIRED'));
 assert.equal(result.estimate.baselineWei,217000000000000000n);
 assert.equal(result.requiredWei,null);assert.equal(result.actualFeeKnown,false);
 assert.match(result.estimate.label,/不等于 Chainlink/);
});
test('an explicitly scoped, current administrator policy enables only sufficiently reserved native payments',()=>{
 const s=snapshot(),p=policy(s),yes=assess(s,p);
 assert.equal(yes.ready,true);assert.equal(yes.currency,'ETH');assert.equal(yes.requiredWei,602795000000000000n);
 assert.equal(yes.estimate.conservativePerRequestWei,301397500000000000n);
 assert.equal(yes.estimate.pendingBufferWei,301397500000000000n);
 assert.equal(yes.shortfallWei,0n);assert.equal(yes.policyId,p.id);
 s.subscription.nativeBalanceWei=30000000000000000n;
 const no=assess(s,p);assert.equal(no.ready,false);assert.equal(no.shortfallWei,572795000000000000n);
 assert.ok(codes(no).includes('INSUFFICIENT_RESERVE'));
 s.subscription.nativeBalanceWei=yes.requiredWei;assert.equal(assess(s,p).ready,true);
 s.subscription.nativeBalanceWei--;assert.equal(assess(s,p).shortfallWei,1n);
});
test('a higher reviewed reserve override is supported but cannot undercut the model or pending buffer',()=>{
 const p=policy();p.perRequestReserveWei=400000000000000000n;
 assert.equal(assess(snapshot(),p).requiredWei,800000000000000000n);
 p.perRequestReserveWei=1n;assert.equal(assess(snapshot(),p).ready,false);
 for(const change of [{safetyMarginBps:12499n},{pendingBufferRequests:0n},{maxVerificationGas:199999n}]){
  assert.equal(assess(snapshot(),{...policy(),...change}).ready,false);
 }
});
test('unknown pending count and LINK costs disable only new requests',()=>{
 const s=snapshot();s.subscription.pendingRequestExists=true;
 const pending=assess(s);assert.equal(pending.ready,false);assert.equal(pending.canViewExisting,true);assert.ok(codes(pending).includes('PENDING_REQUEST'));
 s.nativePayment=false;s.subscription.linkBalanceBaseUnits=10n**24n;
 const link=assess(s);assert.equal(link.ready,false);assert.ok(codes(link).includes('LINK_BUDGET_UNVERIFIED'));
 assert.equal(link.currency,'LINK');assert.equal(link.requiredWei,null);assert.equal(link.balanceWei,null);assert.equal(link.estimate,null);
});
test('freshness checks both block time and read time, with no caller bypass beyond sixty seconds',()=>{
 const s=snapshot();
 assert.equal(assess(s,policy(s),{nowMs:NOW+48001}).ready,false); // Block is already 12 seconds old.
 assert.ok(codes(assess(s,policy(s),{nowMs:NOW+48001})).includes('STALE_SNAPSHOT'));
 assert.ok(codes(assess(s,policy(s),{currentBlock:BLOCK+6})).includes('STALE_SNAPSHOT'));
 assert.ok(codes(assess(s,policy(s),{nowMs:NOW-1})).includes('FUTURE_SNAPSHOT'));
 assert.ok(codes(assess(s,policy(s),{currentBlock:BLOCK-1})).includes('FUTURE_SNAPSHOT'));
 assert.equal(assess(s,policy(s),{nowMs:NOW+48001,maxAgeMs:9999999}).ready,false);
 const old=snapshot();old.readAtMs=NOW-60001;old.blockTimestampMs=NOW-60001;
 assert.equal(assess(old).ready,false);
});
test('administrator policy requires the matching scope, expiry and successful fork-specific callback attestation',()=>{
 const variants=[{enabled:false},{chainId:1},{coordinator:'0x'+'11'.repeat(20)},{keyHash:'0x'+'11'.repeat(32)},
  {subscriptionId:1n},{callbackGasLimit:100000n},{expiresAtMs:NOW},{validUntilBlock:BLOCK-1},{reviewedAtBlock:BLOCK+1},
  {benchmark:null},{benchmark:{...policy().benchmark,callbackSucceeded:false}},
  {benchmark:{...policy().benchmark,fork:'pre-glamsterdam'}},{benchmark:{...policy().benchmark,callbackGasUsed:150001n}},
  {benchmark:{...policy().benchmark,transactionHash:'0x'}}, {benchmark:{...policy().benchmark,blockNumber:BLOCK+1}}];
 for(const change of variants){const result=assess(snapshot(),{...policy(),...change});assert.equal(result.ready,false,JSON.stringify(change,(_,v)=>typeof v==='bigint'?v.toString():v));assert.equal(result.canViewExisting,true);}
});
test('unknown or invalid coordinator configuration cannot be interpreted as a funded ready subscription',()=>{
 const mutations=[s=>s.chainId=1,s=>s.lane.exists=false,s=>s.lane.maxGasPriceWei=0n,s=>delete s.config.nativePremiumPercentage,
  s=>s.config.nativePremiumPercentage=256n,s=>delete s.subscription.pendingRequestExists,s=>s.subscription.nativeBalanceWei=-1n,
  s=>s.subscriptionId=Number.MAX_SAFE_INTEGER+1,s=>s.callbackGasLimit=2500001n,s=>s.confirmations=2n,s=>s.config.minimumRequestConfirmations=4n,
  s=>s.blockHash='0x',s=>s.blockNumber=Number.MAX_SAFE_INTEGER+1,s=>s.readAtMs=NaN];
 for(const mutate of mutations){const s=snapshot();mutate(s);const result=assess(s);assert.equal(result.ready,false);assert.equal(result.canViewExisting,true);}
 assert.equal(budget.assessFunding(null,{nowMs:NOW,currentBlock:BLOCK}).ready,false);
});
test('funding arithmetic stays exact above Number.MAX_SAFE_INTEGER and rounds every fraction upward',()=>{
 const result=budget.estimateNativeReserve({callbackGasLimit:1n,maxVerificationGas:200000n,maxGasPriceWei:9007199254740993n,
  nativePremiumPercentage:24n,fulfillmentFlatFeeNativePPM:1n,gasAfterPaymentCalculation:0n,safetyMarginBps:12500n,pendingBufferRequests:1n});
 const ceil=(n,d)=>(n+d-1n)/d,raw=ceil(200001n*9007199254740993n*124n,100n)+1000000000000n;
 assert.equal(result.baselineWei,raw);assert.equal(result.bufferedRequiredWei,ceil(raw*12500n,10000n)*2n);
 assert.throws(()=>budget.estimateNativeReserve({callbackGasLimit:150000n,maxGasPriceWei:Number.MAX_SAFE_INTEGER+1,nativePremiumPercentage:24n,fulfillmentFlatFeeNativePPM:0n}));
 for(const value of ['1e18','-1','1.5',undefined])assert.throws(()=>budget.estimateNativeReserve({callbackGasLimit:150000n,maxGasPriceWei:value,nativePremiumPercentage:24n,fulfillmentFlatFeeNativePPM:0n}));
});
function readerMock({chainIds=[11155111n,11155111n],reorg=false,readError=false}={}){
 const s=snapshot(),reads=[];let networkCalls=0;
 const rawConfig={...s.config},rawSub={nativeBalance:s.subscription.nativeBalanceWei,balance:0n,owner:'0x'+'22'.repeat(20),consumers:[]};
 const ethers={getAddress:x=>x,Contract:class{
  constructor(at,abi){assert.equal(at,coordinator);assert.ok(abi.some(x=>x.includes('s_config()')));
   this.s_config=async options=>{reads.push(['s_config',options]);if(readError)throw Error('RPC failed');return rawConfig;};
   this.s_provingKeys=async(key,options)=>{reads.push(['s_provingKeys',options]);assert.equal(key,keyHash);return {exists:true,maxGas:s.lane.maxGasPriceWei};};
   this.getSubscription=async(id,options)=>{reads.push(['getSubscription',options]);assert.equal(id,s.subscriptionId);return rawSub;};
   this.pendingRequestExists=async(id,options)=>{reads.push(['pendingRequestExists',options]);assert.equal(id,s.subscriptionId);return false;};
  }
 }};
 const provider={getNetwork:async()=>({chainId:chainIds[Math.min(networkCalls++,chainIds.length-1)]}),getBlock:async tag=>({number:BLOCK,hash:reorg&&tag!=='latest'?'0x'+'ef'.repeat(32):BLOCK_HASH,timestamp:(NOW-12000)/1000})};
 return {ethers,provider,reads,input:{coordinator,keyHash,subscriptionId:s.subscriptionId,callbackGasLimit:150000,nativePayment:true}};
}
test('snapshot reader pins all verified-ABI getters to one block and retains full uint256 subscription precision',async()=>{
 const m=readerMock(),s=await budget.readSnapshot(m.ethers,m.provider,m.input,{nowMs:NOW});
 assert.equal(s.subscriptionId,snapshot().subscriptionId);assert.equal(s.blockHash,BLOCK_HASH);assert.equal(s.lane.maxGasPriceWei,500000000000n);
 assert.equal(m.reads.length,4);for(const [,options]of m.reads)assert.deepEqual(options,{blockTag:BLOCK});
 assert.equal(assess(s).ready,true);
});
test('reader refuses wrong or switched networks, RPC failures and reorgs without signing',async()=>{
 for(const options of [{chainIds:[1n]},{chainIds:[11155111n,1n]},{reorg:true},{readError:true}]){
  const m=readerMock(options);await assert.rejects(budget.readSnapshot(m.ethers,m.provider,m.input,{nowMs:NOW}));
  if(options.chainIds?.[0]===1n)assert.equal(m.reads.length,0);
 }
});
test('browser bundle exposes the same closed-by-default API without a wallet or side effects',()=>{
 const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/fairness-budget.js'),'utf8'),context);
 assert.equal(typeof context.FairnessBudget.assessFunding,'function');assert.equal(context.FairnessBudget.MAX_AGE_MS,60000);
 assert.equal(context.FairnessBudget.assessFunding(null,{nowMs:NOW,currentBlock:BLOCK}).canViewExisting,true);
});

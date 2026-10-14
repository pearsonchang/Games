'use strict';
// Public testnet configuration only. No accounts or signing material are stored.
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./fairness-budget.js'):root.FairnessBudget);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FairnessSepolia=api;
})(typeof globalThis!=='undefined'?globalThis:this,(budget)=>{
 // V1 remains readable for recovery. Its unrestricted subscription spending and
 // missing expiry cannot be repaired by a website update.
 const recoveryOnly=true;
 const network=Object.freeze({chainId:11155111,coordinator:'0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B',keyHash:'0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',confirmations:3,callbackGasLimit:150000,explorer:'https://sepolia.etherscan.io'});
 const storageKey='playroom.sepolia.dice.v1';
 const coordinatorABI=['function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)','function addConsumer(uint256,address)'];
 function subscriptionId(value){
  const text=String(value).trim();
  if(!/^[1-9][0-9]*$/.test(text)||text.length>78||BigInt(text)>=(1n<<256n))throw Error('请输入有效的 VRF 订阅 ID。');
  return BigInt(text);
 }
 function normalizedRuntime(code,references){
  if(!/^0x(?:[0-9a-fA-F]{2})+$/.test(code))throw Error('合约代码无效。');
  let hex=code.slice(2).toLowerCase(),end=0;
  for(const {start,length} of references){
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<end||length<1||(start+length)*2>hex.length)throw Error('构建产物中的不可变参数范围无效。');
   hex=hex.slice(0,start*2)+'0'.repeat(length*2)+hex.slice((start+length)*2);end=start+length;
  }
  return '0x'+hex;
 }
 function assertRuntime(ethers,artifact,code){
  if(ethers.keccak256(normalizedRuntime(code,artifact.immutableReferences))!==artifact.runtimeFingerprint.value)throw Error('此地址的合约代码与当前 DiceVRF 构建不一致。');
 }
 function assertBindings(ethers,artifact,code,values){
  const expectedNames=['callbackGasLimit','confirmations','coordinator','keyHash','nativePayment','subscriptionId','vrfCoordinator'];
  if(JSON.stringify(artifact.immutableBindings.map(x=>x.name).sort())!==JSON.stringify(expectedNames))throw Error('合约不可变参数定义不完整。');
  const references=[];
  for(const binding of artifact.immutableBindings){
   const expected=ethers.AbiCoder.defaultAbiCoder().encode([binding.type],[values[binding.name]]).slice(2).toLowerCase();
   for(const ref of binding.references){
    references.push(ref);
    if(ref.length!==32||code.slice(2+ref.start*2,2+(ref.start+ref.length)*2).toLowerCase()!==expected)throw Error('合约的不可变参数或 VRF 回调权限与配置不一致。');
   }
  }
  references.sort((a,b)=>a.start-b.start);
  if(references.length!==artifact.immutableReferences.length||references.some((ref,i)=>ref.start!==artifact.immutableReferences[i].start||ref.length!==artifact.immutableReferences[i].length))throw Error('合约不可变参数覆盖不完整。');
 }
 function readSaved(storage){
  try{const value=JSON.parse(storage.getItem(storageKey));
   if(value?.chainId!==network.chainId||!/^0x[0-9a-fA-F]{40}$/.test(value.contractAddress)||!Number.isSafeInteger(value.deploymentBlock)||value.deploymentBlock<0)return null;
   return {chainId:network.chainId,contractAddress:value.contractAddress,deploymentBlock:value.deploymentBlock,deploymentTxHash:/^0x[0-9a-fA-F]{64}$/.test(value.deploymentTxHash||'')?value.deploymentTxHash:null};
  }catch{return null;}
 }
 function save(storage,address,block,deploymentTxHash=null){
  const value={chainId:network.chainId,contractAddress:address,deploymentBlock:block,deploymentTxHash};
  if(!readSaved({getItem:()=>JSON.stringify(value)}))throw Error('部署记录无效。');
  storage.setItem(storageKey,JSON.stringify(value));return value;
 }
 async function subscription(ethers,provider,id){
  return new ethers.Contract(network.coordinator,coordinatorABI,provider).getSubscription(subscriptionId(id));
 }
 async function inspect(ethers,artifact,provider,address){
  if((await provider.getNetwork()).chainId!==BigInt(network.chainId))throw Error('请连接 Ethereum Sepolia 测试网。');
  address=ethers.getAddress(address);
  const code=await provider.getCode(address);assertRuntime(ethers,artifact,code);
  const contract=new ethers.Contract(address,artifact.abi,provider);
  const [rules,coordinator,keyHash,id,confirmations,gas,nativePayment]=await Promise.all([contract.RULES_HASH(),contract.coordinator(),contract.keyHash(),contract.subscriptionId(),contract.confirmations(),contract.callbackGasLimit(),contract.nativePayment()]);
  if(rules.toLowerCase()!==artifact.rulesHash.toLowerCase()||coordinator.toLowerCase()!==network.coordinator.toLowerCase()||keyHash.toLowerCase()!==network.keyHash.toLowerCase()||confirmations!==BigInt(network.confirmations)||gas!==BigInt(network.callbackGasLimit))throw Error('合约的规则或 VRF 参数与本次测试配置不一致。');
  assertBindings(ethers,artifact,code,{coordinator:network.coordinator,vrfCoordinator:network.coordinator,subscriptionId:subscriptionId(id),keyHash:network.keyHash,confirmations:network.confirmations,callbackGasLimit:network.callbackGasLimit,nativePayment});
  let funding,sub=null,registered=false;
  try{
   sub=await subscription(ethers,provider,id);
   registered=sub.consumers.some(x=>x.toLowerCase()===address.toLowerCase());
   if(!budget)throw Error('资金检查组件未载入，请刷新页面。');
   const snapshot=await budget.readSnapshot(ethers,provider,{subscriptionId:id,coordinator,keyHash,callbackGasLimit:Number(gas),nativePayment});
   funding=budget.assessFunding(snapshot,{nowMs:Date.now(),currentBlock:await provider.getBlockNumber()});
  }catch(error){
   funding={ready:false,canViewExisting:true,actualFeeKnown:false,balanceWei:nativePayment?(sub?.nativeBalance??null):null,requiredWei:null,shortfallWei:null,message:'资金检查暂不可用，新局保持关闭；已有对局仍可查看和结算。',reasons:[{code:'CHECK_UNAVAILABLE',message:error?.message||'无法核对订阅资金。'}]};
  }
  return {address,id,nativePayment,sub,registered,funded:funding.ready,funding,recoveryOnly,ready:registered&&funding.ready&&!recoveryOnly};
 }
 return Object.freeze({network,storageKey,coordinatorABI,recoveryOnly,subscriptionId,normalizedRuntime,assertRuntime,assertBindings,readSaved,save,subscription,inspect});
});

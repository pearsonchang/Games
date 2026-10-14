'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ethers=require('../src/vendor/ethers.umd.min.js'),api=require('../src/fairness-sepolia.js');
const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/dice-vrf-deployment.js'),'utf8'),context);
const artifact=JSON.parse(JSON.stringify(context.DiceVRFDeployment));
const values={coordinator:api.network.coordinator,vrfCoordinator:api.network.coordinator,subscriptionId:77n,keyHash:api.network.keyHash,confirmations:3,callbackGasLimit:150000,nativePayment:true};
const address='0x1111111111111111111111111111111111111111',owner='0x2222222222222222222222222222222222222222';
function runtime(){
 let hex=artifact.deployedBytecode;
 for(const binding of artifact.immutableBindings){
  const encoded=ethers.AbiCoder.defaultAbiCoder().encode([binding.type],[values[binding.name]]).slice(2);
  for(const ref of binding.references)hex=hex.slice(0,2+ref.start*2)+encoded+hex.slice(2+(ref.start+ref.length)*2);
 }
 return hex;
}
function mock({code=runtime(),chainId=11155111n,registered=true,funded=true,subscriptionFails=false}={}){
 const sub={balance:0n,nativeBalance:funded?100n:0n,owner,consumers:registered?[address]:[]};
 const reads={RULES_HASH:artifact.rulesHash,coordinator:values.coordinator,keyHash:values.keyHash,subscriptionId:77n,confirmations:3n,callbackGasLimit:150000n,nativePayment:true};
 const fakeEthers={...ethers,Contract:class{constructor(at){if(at.toLowerCase()===api.network.coordinator.toLowerCase()){this.getSubscription=async()=>{if(subscriptionFails)throw Error('Subscription unavailable');return sub;};}else{for(const[name,value]of Object.entries(reads))this[name]=async()=>value;}}}};
 return {ethers:fakeEthers,provider:{getNetwork:async()=>({chainId}),getCode:async()=>code}};
}
test('Sepolia subscription IDs preserve uint256 precision and reject malformed/overflow input',()=>{
 const max=(1n<<256n)-1n;assert.equal(api.subscriptionId(max.toString()),max);
 for(const value of ['0','-1','1.2','1e8','', '0x123', (max+1n).toString()])assert.throws(()=>api.subscriptionId(value));
});
test('deployed code must match both instructions and every immutable occurrence',()=>{
 const code=runtime();api.assertRuntime(ethers,artifact,code);api.assertBindings(ethers,artifact,code,values);
 const changed='0x00'+code.slice(4);assert.throws(()=>api.assertRuntime(ethers,artifact,changed));
 for(const name of ['vrfCoordinator','coordinator','subscriptionId','keyHash','confirmations','callbackGasLimit','nativePayment']){
  const ref=artifact.immutableBindings.find(x=>x.name===name).references.at(-1),at=2+ref.start*2;
  const tampered=code.slice(0,at)+'ff'.repeat(ref.length)+code.slice(at+ref.length*2);
  api.assertRuntime(ethers,artifact,tampered); // A normalized fingerprint alone cannot detect this attack.
  assert.throws(()=>api.assertBindings(ethers,artifact,tampered,values),undefined,name);
 }
});
test('legacy inspection stays readable but cannot open new rounds, including when funding RPC fails',async()=>{
 for(const options of [{},{funded:false},{registered:false},{subscriptionFails:true}]){
  const m=mock(options),result=await api.inspect(m.ethers,artifact,m.provider,address);
  assert.equal(result.ready,false);assert.equal(result.recoveryOnly,true);assert.equal(result.funding.canViewExisting,true);
  assert.equal(result.funding.reasons[0].code,'CHECK_UNAVAILABLE');
 }
 for(const options of [{chainId:1n},{code:'0x'}]){const m=mock(options);await assert.rejects(api.inspect(m.ethers,artifact,m.provider,address));}
 const ref=artifact.immutableBindings.find(x=>x.name==='vrfCoordinator').references[0],at=2+ref.start*2,code=runtime();
 const tampered=code.slice(0,at)+'00'.repeat(12)+'33'.repeat(20)+code.slice(at+64),m=mock({code:tampered});
 await assert.rejects(api.inspect(m.ethers,artifact,m.provider,address),/回调权限/);
});
test('public local recovery pointers reject other networks and retain deployment transaction links',()=>{
 let saved;const storage={getItem:()=>saved,setItem:(_,v)=>saved=v};
 api.save(storage,address,123,'0x'+'a'.repeat(64));
 assert.equal(api.readSaved(storage).contractAddress,address);assert.equal(api.readSaved(storage).deploymentTxHash,'0x'+'a'.repeat(64));
 const value=JSON.parse(saved);value.chainId=1;saved=JSON.stringify(value);assert.equal(api.readSaved(storage),null);
 assert.equal(api.readSaved({getItem(){throw Error('disabled')}}),null);
 assert.throws(()=>api.save(storage,address,-1));
});
test('unconfigured testnet remains off, and query overrides are only candidate addresses',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/fairness-network.js'),'utf8');
 function run(search,stored){const c={FairnessSepolia:api,localStorage:{getItem:()=>stored},URLSearchParams,location:{search}};vm.runInNewContext(source+';globalThis.result=FairnessNetwork;',c);return c.result;}
 assert.equal(run('',null).enabled,false);assert.equal(run('?contract=invalid',null).enabled,false);
 assert.equal(run('?contract='+address,null).contractAddress,address);
 assert.equal(run('?contract='+address,null).coordinatorAddress,api.network.coordinator);
});

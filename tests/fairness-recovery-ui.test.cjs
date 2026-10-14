'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const fees=require('../src/fairness-fees.js');
const source=fs.readFileSync(path.join(__dirname,'../src/fairness-testnet.js'),'utf8');
function harness(state=1){
 const elements=new Map();
 const element=()=>({value:'',textContent:'',disabled:false,children:[],replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);if(!this.value&&nodes[0]?.value)this.value=nodes[0].value;}});
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 $('chain-mode').value='size';
 let currentState=state,sent=[],fundingRenders=0;
 const account='0x'+'1'.repeat(40),contractAddress='0x'+'2'.repeat(40);
 const signer={getAddress:async()=>account,estimateGas:async()=>100000n};
 const provider={send:async()=>[account],getNetwork:async()=>({chainId:11155111n}),getSigner:async()=>signer,getFeeData:async()=>({maxFeePerGas:100n,maxPriorityFeePerGas:10n}),getBalance:async()=>1000000000000n};
 const contract={balances:async()=>950n,claimed:async()=>true,nonces:async()=>1n,activeRound:async()=>currentState===3?0n:1n,
  rounds:async()=>({player:account,state:BigInt(currentState),requestId:2n,nonce:1n,randomWord:'0x'+'0'.repeat(63)+'1',amount:0n,mode:0n,target:0n})};
 contract.settle=async(id,overrides)=>{sent.push({id,overrides});return {hash:'0x'+'a'.repeat(64),wait:async()=>{currentState=3;}};};
 contract.settle.populateTransaction=async(id)=>({to:contractAddress,data:'0x1234'});
 const context={document:{getElementById:$,createElement:element,hidden:false},window:{ethereum:{on(){}}},setInterval(){},location:{reload(){}},
  FairnessNetwork:{enabled:true,chainId:11155111,contractAddress,coordinatorAddress:'0x'+'3'.repeat(40)},
  ethers:{isAddress:()=>true,BrowserProvider:class{constructor(){return provider;}},Contract:class{constructor(){return contract;}},formatEther:x=>String(x)},
  DiceVRFDeployment:{rulesHash:'0xabc'},DiceRules:{prize:()=>100,result:()=>({amount:0})},Fairness:{rulesHash:async()=>'abc',diceFromWord:async()=>[1,2,3]},
  FairnessFees:fees,FairnessSepolia:{recoveryOnly:true,inspect:async()=>({ready:false,funding:{ready:false,canViewExisting:true,message:'预算暂不可用'}})},
  FairnessFundingView:{render:()=>fundingRenders++}};
 vm.runInNewContext(source,context);
 return {$,sent,contract,renderCount:()=>fundingRenders};
}
test('legacy wallet connection restores pending rounds while funding is unavailable; forced new-round clicks send nothing',async()=>{
 const h=harness(1);await h.$('connect').onclick();
 assert.match(h.$('chain-round-status').textContent,/等待原 VRF 请求/);
 assert.equal(h.$('start-chain').disabled,true);assert.equal(h.$('claim').disabled,true);
 await h.$('start-chain').onclick();await h.$('claim').onclick();assert.equal(h.sent.length,0);
 await h.$('check-funding').onclick();assert.equal(h.renderCount(),2);
 assert.equal(h.$('settle-chain').disabled,true);assert.equal(h.$('check-funding').disabled,false);
});
test('legacy ready rounds can settle despite closed funding gate and send the displayed fee parameters',async()=>{
 const h=harness(2);await h.$('connect').onclick();assert.equal(h.$('settle-chain').disabled,false);
 await h.$('settle-chain').onclick();assert.equal(h.sent.length,1);
 assert.deepEqual({...h.sent[0].overrides},{chainId:11155111,gasLimit:120000n,maxFeePerGas:100n,maxPriorityFeePerGas:10n});
 assert.match(h.$('chain-fee').textContent,/12000000/);assert.match(h.$('chain-round-status').textContent,/已结算/);
 assert.equal(h.$('start-chain').disabled,true);assert.equal(h.$('settle-chain').disabled,true);
});
test('a stale ready screen does not send settlement after another caller already settled',async()=>{
 const h=harness(2);await h.$('connect').onclick();
 h.contract.rounds=async()=>({state:3n});await h.$('settle-chain').onclick();
 assert.equal(h.sent.length,0);assert.match(h.$('network-status').textContent,/已完成结算/);
});

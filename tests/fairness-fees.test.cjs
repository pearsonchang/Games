'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fees=require('../src/fairness-fees.js');
test('fee estimate pins both EIP-1559 prices to the same parameters shown to the user',()=>{
 const q=fees.quote(101n,{maxFeePerGas:200n,maxPriorityFeePerGas:10n},24400n,1000);
 assert.deepEqual(q.overrides,{gasLimit:122n,maxFeePerGas:200n,maxPriorityFeePerGas:10n});
 assert.equal(q.maxCostWei,24400n);assert.equal(q.affordable,true);
 assert.deepEqual(fees.assertFresh(q,1001),q.overrides);
 assert.equal(fees.quote(101n,{maxFeePerGas:200n,maxPriorityFeePerGas:10n},24399n).affordable,false);
});
test('stale quotes, invalid prices and insufficient balances cannot produce transaction overrides',()=>{
 const q=fees.quote(100n,{gasPrice:10n},1200n,1000);
 for(const now of [999,61000])assert.throws(()=>fees.assertFresh(q,now));
 assert.throws(()=>fees.assertFresh(fees.quote(100n,{gasPrice:10n},1n,1000),1001));
 for(const f of [{},{gasPrice:0n},{maxFeePerGas:1n,maxPriorityFeePerGas:2n}])assert.throws(()=>fees.quote(100n,f,100n));
});
test('read-only estimation preserves provider prices and rejects value transfers',async()=>{
 const provider={getFeeData:async()=>({maxFeePerGas:10n,maxPriorityFeePerGas:2n}),getBalance:async()=>99999n};
 const signer={getAddress:async()=>'test',estimateGas:async()=>1234n};
 const q=await fees.estimate(provider,signer,{value:0n});assert.equal(q.overrides.maxPriorityFeePerGas,2n);
 await assert.rejects(fees.estimate(provider,signer,{value:1n}));
});

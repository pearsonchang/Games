'use strict';
(() => {
 const $=id=>document.getElementById(id),config=FairnessNetwork;
 const abi=[
  'function RULES_HASH() view returns(bytes32)','function coordinator() view returns(address)',
  'function balances(address) view returns(uint256)','function claimed(address) view returns(bool)',
  'function nonces(address) view returns(uint256)','function activeRound(address) view returns(uint256)',
  'function roundCount() view returns(uint256)',
  'function rounds(uint256) view returns(address player,uint8 mode,uint8 target,uint8 state,uint256 nonce,uint256 requestId,bytes32 randomWord,uint256 amount)',
  'function claimDemoPoints()','function startRound(uint8,uint8,uint256) returns(uint256)','function settle(uint256)',
  'event RoundRequested(uint256 indexed roundId,address indexed player,uint256 indexed requestId,uint256 nonce,uint8 mode,uint8 target,bytes32 rulesHash)',
  'event RoundSettled(uint256 indexed roundId,address indexed player,uint8[3] values,uint256 amount)'
 ];
 let provider,contract,account,roundId=0n,round,busy=false,polling=false,points=0n,hasClaimed=false,lastNonce=0n,connected=false,vrfReady=false;
 const ready=config.enabled&&config.chainId===11155111&&ethers.isAddress(config.contractAddress)&&ethers.isAddress(config.coordinatorAddress);
 function choices(){
  const mode=$('chain-mode').value,select=$('chain-target');select.replaceChildren();
  const options=mode==='size'?[['small','小 · 4–10 点'],['big','大 · 11–17 点']]:mode==='sum'?Array.from({length:16},(_,i)=>[String(i+3),`${i+3} 点`]):[['triple','任意三同号']];
  for(const[value,label]of options){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}prize();
 }
 function selection(){const mode=$('chain-mode').value,target=mode==='sum'?Number($('chain-target').value):mode==='triple'?null:$('chain-target').value;return {mode,target,code:mode==='size'?0:mode==='sum'?1:2,codeTarget:mode==='size'?(target==='small'?0:1):mode==='sum'?target:0};}
 function prize(){const s=selection();$('chain-prize').textContent=`命中到账 ${DiceRules.prize(s.mode,s.target).toLocaleString()} 测试积分，包含本局投入。`;}
 function controls(){
  $('connect').disabled=!ready||busy||connected;$('claim').disabled=FairnessSepolia.recoveryOnly||!connected||busy||hasClaimed;
  $('choices').disabled=!connected||busy||!!round&&Number(round.state)!==3;
  $('start-chain').disabled=FairnessSepolia.recoveryOnly||!connected||!vrfReady||busy||points<50n||!!round&&Number(round.state)!==3;
  $('check-funding').disabled=!connected||busy;
  $('settle-chain').disabled=!connected||busy||Number(round?.state)!==2;
  $('verify-chain').disabled=!connected||busy||!round||Number(round.state)<2;
 }
 const status=text=>$('network-status').textContent=text;
 function fail(error){status(error?.code==='ACTION_REJECTED'||error?.code===4001?'钱包操作已取消。':error?.shortMessage||error?.message||'连接暂时不可用。');}
 function transaction(hash){const output=$('chain-tx');output.replaceChildren();const a=document.createElement('a');a.href=`https://sepolia.etherscan.io/tx/${hash}`;a.target='_blank';a.rel='noopener';a.textContent='查看最近交易 ↗';output.append(a);}
 async function execute(action){if(busy)return;busy=true;controls();try{const success=await action();await refresh();if(success)status(success);}catch(error){fail(error);}finally{busy=false;controls();}}
 async function refresh(){
  if(!contract||polling)return;polling=true;
  try{
   const [balance,claimed,nonce,active]=await Promise.all([contract.balances(account),contract.claimed(account),contract.nonces(account),contract.activeRound(account)]);
   points=balance;hasClaimed=claimed;lastNonce=nonce;
   $('chain-balance').textContent=`测试积分：${points.toLocaleString()}`;
   if(active!==0n)roundId=active;
   if(roundId!==0n){
    round=await contract.rounds(roundId);
    if(round.player.toLowerCase()!==account.toLowerCase())throw Error('对局账户不匹配。');
    const state=Number(round.state),labels={1:'等待原 VRF 请求 · 本局目标已锁定。旧版没有超时退款入口；请查看请求状态，避免重复开局。',2:'随机值已返回 · 可以复算并结算',3:`已结算 · 到账 ${round.amount} 测试积分`};
    $('chain-round-status').textContent=labels[state]||'未知状态';
    $('chain-fields').replaceChildren();
    for(const[label,value]of[['合约',config.contractAddress],['对局编号',roundId.toString()],['请求编号',round.requestId.toString()],['操作序号',round.nonce.toString()],['随机值',state>=2?round.randomWord:'尚未返回']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('chain-fields').append(dt,dd);}
    if(state>=2){const values=await Fairness.diceFromWord(round.randomWord.slice(2));$('chain-dice').textContent=values.join(' + ');}
   }
  } finally{polling=false;controls();}
 }
 $('chain-mode').onchange=choices;$('chain-target').onchange=prize;choices();
 $('network-status').textContent=ready?'已载入合约地址。连接钱包后核对链上代码、规则和 VRF 订阅。':'测试网尚未配置 · 请先打开“管理 Sepolia 旧版接入”，载入已有合约。旧版部署与新局已暂停，大厅仍可直接试玩。';controls();
 $('connect').onclick=()=>execute(async()=>{
  if(!window.ethereum)throw Error('需要支持 Ethereum 的钱包；手机可从钱包内置浏览器打开本页。');
  provider=new ethers.BrowserProvider(window.ethereum);await provider.send('eth_requestAccounts',[]);
  const network=await provider.getNetwork();if(network.chainId!==BigInt(config.chainId))throw Error('请将钱包切换到 Ethereum Sepolia 测试网后重新连接。');
  const checked=await FairnessSepolia.inspect(ethers,DiceVRFDeployment,provider,config.contractAddress);
  if(DiceVRFDeployment.rulesHash.slice(2)!==await Fairness.rulesHash())throw Error('前端与合约规则摘要不一致。');
  const signer=await provider.getSigner();account=await signer.getAddress();contract=new ethers.Contract(config.contractAddress,abi,signer);vrfReady=checked.ready;
  connected=true;$('account').textContent=account;
  FairnessFundingView.render($('chain-funding'),checked,ethers);
  status('已连接 Sepolia · 旧版新局和免费领分已暂停。可以查询原对局、复算，以及在随机值返回后结算。');
  // Recover the latest settled round too, without scanning global player history.
  const active=await contract.activeRound(account);roundId=active;
  if(active===0n){try{const filter=contract.filters.RoundRequested(null,account);const latest=Number(await provider.getBlockNumber()),from=Math.max(config.deploymentBlock,latest-5000);const logs=await contract.queryFilter(filter,from,latest);if(logs.length)roundId=logs.at(-1).args.roundId;}catch{$('chain-round-status').textContent='历史记录读取受 RPC 限制；当前余额和未结算对局仍可恢复。';}}
 });
 $('claim').onclick=()=>execute(async()=>{
  if(FairnessSepolia.recoveryOnly)throw Error('旧版领分已暂停，已有积分与对局保留。');
  status('请在钱包中确认领取测试积分。');
  const tx=await contract.claimDemoPoints({chainId:config.chainId});transaction(tx.hash);
  status('领取交易已提交，等待链上确认。');await tx.wait();
  return '领取成功，测试积分已到账。';
 });
 $('start-chain').onclick=()=>execute(async()=>{
  if(FairnessSepolia.recoveryOnly)throw Error('旧版新局已暂停，下一版完成预算与异常流程验收后再开放。');
  status('正在核对 VRF 订阅，请稍候。');
  const checked=await FairnessSepolia.inspect(ethers,DiceVRFDeployment,provider,config.contractAddress);vrfReady=checked.ready;
  FairnessFundingView.render($('chain-funding'),checked,ethers);
  if(!vrfReady)throw Error('VRF 订阅当前未就绪，请先检查消费者与余额。');
  status('请在钱包中确认发起对局。');
  const s=selection(),tx=await contract.startRound(s.code,s.codeTarget,lastNonce+1n,{chainId:config.chainId});transaction(tx.hash);
  status('对局交易已提交，等待链上确认。');const receipt=await tx.wait();
  for(const log of receipt.logs){try{const e=contract.interface.parseLog(log);if(e?.name==='RoundRequested')roundId=e.args.roundId;}catch{}}
  return '对局已成功发起。VRF 返回随机值后即可复算和结算。';
 });
 $('settle-chain').onclick=()=>execute(async()=>{
  status('正在核对本局与当前网络费用。');
  const current=await contract.rounds(roundId);
  if(Number(current.state)!==2)throw Error('本局尚未收到随机值，或已完成结算。');
  const signer=await provider.getSigner(),request=await contract.settle.populateTransaction(roundId);
  const quote=await FairnessFees.estimate(provider,signer,request);
  $('chain-fee').textContent=`结算交易：当前报价上限 ${ethers.formatEther(quote.maxCostWei)} Sepolia ETH（含 20% Gas 余量）。使用所显示报价提交；钱包若修改费用，以钱包最终确认为准。此金额不含此前请求和 VRF 回调费用。`;
  const overrides=FairnessFees.assertFresh(quote);
  status('请在钱包中核对结算费用并确认。');
  const tx=await contract.settle(roundId,{chainId:config.chainId,...overrides});transaction(tx.hash);
  status('结算交易已提交，等待链上确认。');await tx.wait();
  return '结算成功，测试积分余额已更新。';
 });
 $('check-funding').onclick=()=>execute(async()=>{
  const checked=await FairnessSepolia.inspect(ethers,DiceVRFDeployment,provider,config.contractAddress);
  vrfReady=checked.ready;FairnessFundingView.render($('chain-funding'),checked,ethers);
  return '资金与原对局状态已刷新。旧版新局仍保持暂停。';
 });
 $('verify-chain').onclick=()=>execute(async()=>{
  const captured=roundId,r=await contract.rounds(captured);if(Number(r.state)<2)throw Error('随机值尚未返回。');
  const values=await Fairness.diceFromWord(r.randomWord.slice(2)),mode=Number(r.mode)===0?'size':Number(r.mode)===1?'sum':'triple',target=mode==='size'?(Number(r.target)===0?'small':'big'):mode==='sum'?Number(r.target):null;
  const result=DiceRules.result(values,mode,target),settled=Number(r.state)===3;
  if(settled&&BigInt(result.amount)!==r.amount)throw Error('复算奖励与合约记录不一致。');
  $('chain-checks').textContent=`复算点数 ${values.join(' + ')}，应到账 ${result.amount} 测试积分。${settled?'与合约结算一致。':'本局尚未结算。'} 随机值读取自配置合约，其 VRF 回调由协调器验证。`;
 });
 setInterval(()=>{if(connected&&!busy&&!document.hidden)refresh().catch(fail);},4000);
 function walletChanged(){connected=false;vrfReady=false;busy=true;controls();location.reload();}
 window.ethereum?.on?.('accountsChanged',walletChanged);window.ethereum?.on?.('chainChanged',walletChanged);
})();

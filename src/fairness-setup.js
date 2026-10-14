'use strict';
(() => {
 const $=id=>document.getElementById(id),api=FairnessSepolia,net=api.network,artifact=DiceVRFDeployment;
 let provider,signer,account,connected=false,busy=false,checked=null,estimate=null,inspection=null,deployedAddress='',deploymentBlock=0,receipt=null,deploymentTxHash=null;
 const status=text=>$('setup-status').textContent=text;
 const payment=()=>$('setup-payment').value==='native';
 const id=()=>api.subscriptionId($('setup-subscription').value);
 const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
 function controls(){
  $('setup-connect').disabled=busy||connected;
  $('setup-switch').disabled=busy||!window.ethereum;
  for(const name of ['check','import'])$('setup-'+name).disabled=busy||!connected;
  $('setup-subscription').disabled=busy;$('setup-payment').disabled=busy;$('setup-address').disabled=busy;
  $('setup-estimate').disabled=busy||!checked||!!deployedAddress;
  $('setup-deploy').disabled=api.recoveryOnly||busy||!estimate||!!deployedAddress;
  $('setup-register').disabled=api.recoveryOnly||busy||!inspection||inspection.registered||!same(inspection.sub?.owner,account);
  $('setup-recheck').disabled=busy||!connected||!deployedAddress;
  $('setup-export').disabled=busy||!inspection;
  $('setup-forget').disabled=busy||!deployedAddress;
  $('setup-play').setAttribute('aria-disabled',String(!inspection||busy));
  $('setup-play').tabIndex=inspection&&!busy?0:-1;
 }
 function errorText(error){
  return error?.code===4001||error?.code==='ACTION_REJECTED'?'钱包操作已取消，没有继续提交。':error?.shortMessage||error?.message||'暂时无法连接，请检查钱包和网络。';
 }
 async function execute(action){
  if(busy)return;busy=true;controls();
  try{await action();}catch(error){status(errorText(error));}finally{busy=false;controls();}
 }
 function transaction(tx){
  const a=document.createElement('a');a.href=net.explorer+'/tx/'+tx.hash;a.target='_blank';a.rel='noopener';a.textContent='查看交易状态 ↗';$('setup-tx').replaceChildren(a);
 }
 function invalidate(){checked=null;estimate=null;$('setup-estimate-status').textContent='配置已更改，请重新检查订阅并预估费用。';controls();}
 async function wallet(){
  if(!connected||(await provider.getNetwork()).chainId!==BigInt(net.chainId))throw Error('请先连接 Sepolia 钱包。');
  const accounts=await provider.send('eth_accounts',[]);
  if(!same(accounts[0],account))throw Error('钱包账户已变化，请重新连接。');
 }
 async function check(){
  checked=null;estimate=null;await wallet();const subId=id(),nativePayment=payment();
  const sub=await api.subscription(ethers,provider,subId);
  $('setup-sub-status').textContent=`订阅所有者 ${sub.owner} · ETH ${ethers.formatEther(sub.nativeBalance)} · LINK ${ethers.formatEther(sub.balance)}`;
  if(!same(sub.owner,account))throw Error('当前钱包不是订阅所有者。请切换到所有者钱包后部署和添加消费者。');
  checked={subId,nativePayment};status('已读取订阅余额。余额非零不代表可以开局；当前仅支持费用核查和恢复旧局。无需为检查而充值。');
 }
 const args=()=>[net.coordinator,checked.subId,net.keyHash,net.confirmations,net.callbackGasLimit,checked.nativePayment];
 function persist(){
  try{api.save(localStorage,deployedAddress,deploymentBlock,deploymentTxHash);}catch{status('浏览器无法保存记录，请导出部署记录。再次打开时可通过合约地址恢复。');}
  $('setup-address').value=deployedAddress;
  $('setup-play').href='fairness-testnet.html?contract='+encodeURIComponent(deployedAddress);
 }
 async function inspect(){
  inspection=null;await wallet();
  const result=await api.inspect(ethers,artifact,provider,deployedAddress);inspection=result;
  persist();$('setup-deployed').textContent=`代码与固定参数核对通过 · ${result.address} · 订阅 ${result.id} · 使用 ${result.nativePayment?'Sepolia ETH':'测试 LINK'}`;
  $('setup-readiness').textContent=`${!result.sub?'订阅状态暂不可用。':result.registered?'消费者已登记。':'消费者尚未登记。'} ${result.funding.message} 旧版已暂停新局，仍可进入查看已有对局。`;
  FairnessFundingView.render($('setup-funding'),result,ethers);
  status('合约代码已核对，可以查看已有对局。下一版完成成本验证前，暂停旧版部署与新局。');
 }
 $('setup-subscription').oninput=invalidate;$('setup-payment').onchange=invalidate;
 $('setup-connect').onclick=()=>execute(async()=>{
  if(!window.ethereum)throw Error('此浏览器未检测到 Ethereum 钱包。请把本页链接复制到装有钱包扩展的浏览器中打开；手机请使用已部署网站的 HTTPS 地址。');
  provider=new ethers.BrowserProvider(window.ethereum);await provider.send('eth_requestAccounts',[]);
  if((await provider.getNetwork()).chainId!==BigInt(net.chainId))throw Error('当前网络不是 Sepolia，请点击“切换到 Sepolia”后重新连接。');
  signer=await provider.getSigner();account=await signer.getAddress();connected=true;
  $('setup-account').textContent=`${account} · ${ethers.formatEther(await provider.getBalance(account))} Sepolia ETH`;
  status('钱包已连接。请填入 VRF 订阅 ID，或在下方载入已有合约。');
  if(deployedAddress)await inspect();
 });
 $('setup-switch').onclick=()=>execute(async()=>{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]});status('已请求切换到 Sepolia。请重新连接钱包。');});
 $('setup-check').onclick=()=>execute(check);
 $('setup-estimate').onclick=()=>execute(async()=>{
  await check();const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode,signer),request=await factory.getDeployTransaction(...args());
  const quote=await FairnessFees.estimate(provider,signer,request);
  $('setup-estimate-status').textContent=`旧版部署只读预估：${quote.gas.toLocaleString()} Gas；按当前网络报价及 20% Gas 余量，上限为 ${ethers.formatEther(quote.maxCostWei)} Sepolia ETH。不包含 VRF 订阅预留或后续对局费用。${quote.affordable?'':' 钱包不足以覆盖此上限。'}`;
  estimate={...quote,subId:checked.subId,nativePayment:checked.nativePayment};status('费用核查完成，未发起交易。旧版部署保持暂停。');
 });
 $('setup-deploy').onclick=()=>execute(async()=>{
  if(api.recoveryOnly)throw Error('旧版部署已暂停。请等待下一版完成成本与异常流程验证。');
  await wallet();if(!estimate||estimate.subId!==id()||estimate.nativePayment!==payment())throw Error('请重新检查并预估部署费用。');
  status('请在钱包中确认 Sepolia 合约部署。');
  const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode,signer),instance=await factory.deploy(...args(),{chainId:net.chainId,...FairnessFees.assertFresh(estimate)});
  const tx=instance.deploymentTransaction();transaction(tx);deploymentTxHash=tx.hash;deployedAddress=await instance.getAddress();persist();
  status('部署交易已提交，等待链上确认。合约地址已记录，可在页面重新打开后恢复。');
  receipt=await tx.wait();deploymentBlock=receipt.blockNumber;persist();await inspect();
 });
 $('setup-import').onclick=()=>execute(async()=>{
  const candidate=ethers.getAddress($('setup-address').value.trim());
  await wallet();inspection=null;const result=await api.inspect(ethers,artifact,provider,candidate);
  if(!same(candidate,deployedAddress)){receipt=null;deploymentBlock=0;deploymentTxHash=null;}
  deployedAddress=result.address;await inspect();
 });
 $('setup-recheck').onclick=()=>execute(inspect);
 $('setup-forget').onclick=()=>{
  // Clears only the local pointer, never a pending transaction or deployed contract.
  deployedAddress='';deploymentBlock=0;deploymentTxHash=null;receipt=null;inspection=null;checked=null;estimate=null;
  try{localStorage.removeItem(api.storageKey);}catch{}
  $('setup-address').value='';$('setup-deployed').textContent='本机连接记录已清除，链上交易和合约不受影响。';
  status('已清除本机连接记录。重新部署前，请先核对原交易是否仍在等待确认，避免重复部署。');controls();
 };
 $('setup-register').onclick=()=>execute(async()=>{
  if(api.recoveryOnly)throw Error('旧版已暂停添加消费者，已有对局的查询与结算不受影响。');
  await inspect();if(inspection.registered)return;
  if(!same(inspection.sub.owner,account))throw Error('只有 VRF 订阅所有者可以添加消费者。');
  const coordinator=new ethers.Contract(net.coordinator,api.coordinatorABI,signer);
  status('请在钱包确认把此合约加入 VRF 消费者列表。');
  const tx=await coordinator.addConsumer(inspection.id,deployedAddress,{chainId:net.chainId});transaction(tx);await tx.wait();await inspect();
 });
 $('setup-export').onclick=()=>{
  if(!inspection)return;
  const record={schemaVersion:1,chainId:net.chainId,contractAddress:deployedAddress,deploymentBlock,transactionHash:deploymentTxHash,subscriptionId:String(inspection.id),nativePayment:inspection.nativePayment,coordinator:net.coordinator,keyHash:net.keyHash,confirmations:net.confirmations,callbackGasLimit:net.callbackGasLimit,rulesHash:artifact.rulesHash,compiler:artifact.compiler,verification:artifact.verification,runtimeFingerprint:artifact.runtimeFingerprint,constructorArguments:ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256','bytes32','uint16','uint32','bool'],[net.coordinator,inspection.id,net.keyHash,net.confirmations,net.callbackGasLimit,inspection.nativePayment])};
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));a.href=url;a.download='playroom-sepolia-deployment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $('setup-play').onclick=event=>{if(!inspection||busy)event.preventDefault();};
 for(const[label,value]of[['网络','Ethereum Sepolia / 11155111'],['协调器',net.coordinator],['Gas lane',net.keyHash],['确认数 / 回调 Gas',`${net.confirmations} / ${net.callbackGasLimit}`],['规则摘要',artifact.rulesHash],['编译器',artifact.verification.compilerVersion]]){
  const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('setup-parameters').append(dt,dd);
 }
 try{const saved=api.readSaved(localStorage);if(saved){deployedAddress=saved.contractAddress;deploymentBlock=saved.deploymentBlock;deploymentTxHash=saved.deploymentTxHash;if(deploymentTxHash)transaction({hash:deploymentTxHash});$('setup-address').value=deployedAddress;$('setup-deployed').textContent=`本机记录：${deployedAddress} · 连接钱包后会重新核对链上状态。`;}}catch{}
 if(!window.ethereum)status('当前浏览器未检测到钱包。可先阅读接入步骤，再用装有钱包扩展的浏览器打开此页面。');
 function walletChanged(){connected=false;checked=null;estimate=null;inspection=null;busy=true;controls();location.reload();}
 window.ethereum?.on?.('chainChanged',walletChanged);window.ethereum?.on?.('accountsChanged',walletChanged);controls();
})();

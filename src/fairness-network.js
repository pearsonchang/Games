'use strict';
// Enable only after deploying and verifying DiceVRF on Sepolia, funding the VRF
// subscription and adding the consumer. This config never affects normal play.
const FairnessNetwork=(() => {
 const base={
  enabled:false,
  chainId:11155111,
  name:'Ethereum Sepolia',
  contractAddress:'',
  coordinatorAddress:FairnessSepolia.network.coordinator,
  deploymentBlock:0,
  explorer:'https://sepolia.etherscan.io'
 };
 // This is a candidate address only: the testnet page verifies deployed code
 // and immutable VRF settings before allowing any transaction.
 let candidate;
 try{candidate=FairnessSepolia.readSaved(localStorage);}catch{}
 const query=new URLSearchParams(location.search).get('contract');
 if(query&&/^0x[0-9a-fA-F]{40}$/.test(query))candidate={contractAddress:query,deploymentBlock:0};
 return Object.freeze(candidate?{...base,...candidate,enabled:true}:base);
})();

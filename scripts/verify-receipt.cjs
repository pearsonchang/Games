'use strict';
const fs=require('node:fs');
const Fairness=require('../src/fairness-core.js');
async function main(){
 const filename=process.argv[2];if(!filename)throw Error('Usage: node scripts/verify-receipt.cjs /path/to/receipt.json');
 if(fs.statSync(filename).size>100000)throw Error('Receipt must be at most 100 KB');
 const result=await Fairness.verify(JSON.parse(fs.readFileSync(filename,'utf8')));
 for(const check of result.checks)console.log(`${check.ok?'PASS':'FAIL'} ${check.name}`);
 console.log('Assurance: local record consistency only; no independent commitment anchor or onchain proof.');
 if(!result.ok)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

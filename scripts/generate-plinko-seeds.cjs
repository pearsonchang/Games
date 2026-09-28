const fs=require('node:fs');
const enginePath=require.resolve('../dist/plinko-engine.js');
const {plinkoSimulate,plinkoRandom,PLINKO_LANES,PLINKO_MULT}=require(enginePath);
const bank=PLINKO_LANES.map(()=>PLINKO_MULT.map(()=>[]));
for(let lane=0;lane<bank.length;lane++){
 const random=plinkoRandom(929000+lane);
 let attempts=0;
 while(bank[lane].some(seeds=>seeds.length<16)&&attempts<100000){
  const seed=Math.floor(random()*4294967296),path=plinkoSimulate(lane,plinkoRandom(seed));attempts++;
  if(path.frames.at(-1)[2]===548&&path.duration<12000&&bank[lane][path.slot].length<16&&!bank[lane][path.slot].includes(seed))bank[lane][path.slot].push(seed);
 }
 if(bank[lane].some(seeds=>seeds.length<16))throw new Error(`Entry ${lane+1}: incomplete trajectory coverage`);
 console.log(`Entry ${lane+1}: 16 physical trajectories per pocket, ${attempts} candidates`);
}
const source=fs.readFileSync(enginePath,'utf8');
if(!/^const PLINKO_PATH_SEEDS=.*;$/m.test(source))throw new Error('Missing seed bank marker');
fs.writeFileSync(enginePath,source.replace(/^const PLINKO_PATH_SEEDS=.*;$/m,`const PLINKO_PATH_SEEDS=${JSON.stringify(bank)};`));

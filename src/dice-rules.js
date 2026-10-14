'use strict';
// One versioned rule definition is shared by play, replay and contract tests.
const DiceRules = (() => {
  const payouts = Object.freeze([0,0,0,5000,1600,800,500,350,250,200,180,180,200,250,350,500,800,1600,5000]);
  const manifest = Object.freeze({
    gameId: 'dice', version: 'dice-v1', cost: 50, dice: 3, faces: 6,
    distribution: 'three-independent-uniform-d6',
    size: Object.freeze({small: Object.freeze([4,10]), big: Object.freeze([11,17]), excludeTriples: true, payout: 100}),
    sumPayouts: payouts, triplePayout: 1500, payoutIncludesStake: true,
    randomMapping: 'sha256-byte-rejection-v1'
  });
  function valid(mode, target) {
    return mode === 'size' ? ['small','big'].includes(target) : mode === 'sum' ? Number.isInteger(target) && target >= 3 && target <= 18 : mode === 'triple' && target === null;
  }
  function prize(mode, target) {
    if (!valid(mode, target)) return 0;
    return mode === 'size' ? manifest.size.payout : mode === 'sum' ? payouts[target] : manifest.triplePayout;
  }
  function win(values, mode, target) {
    if (!valid(mode, target) || !Array.isArray(values) || values.length !== 3 || !values.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) return false;
    const sum = values.reduce((a,b) => a+b,0), triple = values.every(v => v === values[0]);
    if (mode === 'triple') return triple;
    if (mode === 'sum') return sum === target;
    const [low,high] = manifest.size[target];
    return !triple && sum >= low && sum <= high;
  }
  function result(values, mode, target) {
    if (!valid(mode,target) || !Array.isArray(values) || values.length !== 3 || !values.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) throw new TypeError('Invalid dice result');
    const won = win(values,mode,target), amount = won ? prize(mode,target) : 0;
    return {values:[...values],sum:values.reduce((a,b)=>a+b,0),won,amount,cost:manifest.cost,net:amount-manifest.cost};
  }
  function odds(mode,target) {
    if(!valid(mode,target))throw new TypeError('Invalid dice choice');
    let wins=0;
    for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)if(win([a,b,c],mode,target))wins++;
    return {wins,total:216,amount:prize(mode,target),rtpNumerator:wins*prize(mode,target),rtpDenominator:216*manifest.cost};
  }
  return Object.freeze({manifest,payouts,valid,prize,win,result,odds});
})();
if (typeof module !== 'undefined') module.exports = DiceRules;

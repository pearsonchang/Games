'use strict';
const DICE_PAYOUTS=[0,0,0,5000,1600,800,500,350,250,200,180,180,200,250,350,500,800,1600,5000];
function dicePrize(mode,target){if(mode==='size'&&['small','big'].includes(target))return 100;if(mode==='sum'&&Number.isInteger(target)&&target>=3&&target<=18)return DICE_PAYOUTS[target];if(mode==='triple')return 1500;return 0}

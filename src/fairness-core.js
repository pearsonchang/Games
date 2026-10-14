'use strict';
// This module never treats a locally generated record as an onchain proof.
const Fairness = (() => {
  const rules = typeof module !== 'undefined' ? require('./dice-rules.js') : DiceRules;
  const PROTOCOL = 'playroom-local-dice-v1';
  const encoder = new TextEncoder();
  const clone = value => JSON.parse(JSON.stringify(value));
  const isHex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    throw new TypeError('Only JSON objects and safe integers are supported');
  }
  const hex = bytes => Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join('');
  function bytes(value) {
    if (!isHex(value)) throw new TypeError('Expected a 32-byte lowercase hex value');
    return Uint8Array.from(value.match(/../g), b=>parseInt(b,16));
  }
  const cryptoAPI = supplied => {
    const api = supplied || globalThis.crypto;
    if (!api?.subtle || !api?.getRandomValues) throw new Error('需要 HTTPS 或 localhost 才能准备验证记录。');
    return api;
  };
  async function sha256(value, api) {
    return hex(new Uint8Array(await cryptoAPI(api).subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value)));
  }
  async function rulesHash(api) { return sha256(canonical(rules.manifest), api); }
  function commitmentPayload(record, serverSeed) {
    return {protocol:PROTOCOL,sessionId:record.sessionId,roundId:record.roundId,nonce:record.nonce,rulesHash:record.rulesHash,inputs:record.inputs,cost:record.cost,serverSeed};
  }
  async function randomWord(record, serverSeed, api) {
    const key = await cryptoAPI(api).subtle.importKey('raw',bytes(serverSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const message = canonical({domain:'PLAYROOM:LOCAL-DICE:WORD:v1',sessionId:record.sessionId,roundId:record.roundId,nonce:record.nonce,rulesHash:record.rulesHash,inputs:record.inputs,cost:record.cost,clientSeed:record.clientSeed});
    return hex(new Uint8Array(await cryptoAPI(api).subtle.sign('HMAC',key,encoder.encode(message))));
  }
  // Matches DiceMath.sol byte-for-byte. Reject bytes 252..255 to avoid modulo bias.
  async function diceFromWord(word, api) {
    const domain = encoder.encode('PLAYROOM:DICE:v1:'), seed = bytes(word), values = [];
    for (let die=0;die<3;die++) {
      let value;
      for (let attempt=0;attempt<16 && value===undefined;attempt++) {
        const input = new Uint8Array(domain.length+40);
        input.set(domain); input.set(seed,domain.length);
        const view = new DataView(input.buffer);
        view.setUint32(domain.length+32,die); view.setUint32(domain.length+36,attempt);
        const digest = new Uint8Array(await cryptoAPI(api).subtle.digest('SHA-256',input));
        for (const byte of digest) if (byte<252) { value=byte%6+1; break; }
      }
      if (value===undefined) throw new Error('Random mapping exhausted');
      values.push(value);
    }
    return values;
  }
  function receiptPayload(record) { const {recordHash,...payload}=record; return payload; }
  async function verify(record, api) {
    const checks=[];
    const check=(name,ok)=>checks.push({name,ok:!!ok});
    try {
      check('记录格式与来源', record?.protocol===PROTOCOL && record.assurance==='local-replay-only' && record.gameId==='dice' && record.state==='revealed' && isHex(record.sessionId) && /^dice-[1-9]\d*$/.test(record.roundId) && Number.isSafeInteger(record.nonce) && record.nonce>0 && record.roundId===`dice-${record.nonce}` && record.cost===50 && record.rulesVersion===rules.manifest.version && rules.valid(record.inputs?.mode,record.inputs?.target) && isHex(record.serverSeed) && isHex(record.clientSeed) && isHex(record.randomWord) && isHex(record.commitment) && isHex(record.recordHash));
      if (!checks[0].ok) return {ok:false,assurance:'none',checks};
      check('固定规则版本', record.rulesHash===await rulesHash(api));
      check('开局承诺与公开种子一致', record.commitment===await sha256(canonical(commitmentPayload(record,record.serverSeed)),api));
      const word=await randomWord(record,record.serverSeed,api);
      check('随机值生成过程', word===record.randomWord);
      const values=await diceFromWord(word,api);
      check('三颗顶面点数', canonical(values)===canonical(record.result?.values));
      check('命中与积分结算', canonical(rules.result(values,record.inputs.mode,record.inputs.target))===canonical(record.result));
      check('完整记录摘要', record.recordHash===await sha256(canonical(receiptPayload(record)),api));
    } catch { check('记录可解析',false); }
    return {ok:checks.every(c=>c.ok),assurance:'local-replay-only',checks};
  }
  class DemoProvider {
    constructor({crypto,storage,onStorageError}={}) {
      this.crypto=cryptoAPI(crypto); this.storage=storage; this.onStorageError=onStorageError;
      this.sessionId=hex(this.crypto.getRandomValues(new Uint8Array(32)));
      this.rounds=new Map(); this.history=[]; this.highestNonce=0;
      this.storageKey='playroom.fairness.dice.v1';
      try {
        const old=JSON.parse(storage?.getItem(this.storageKey)||'[]');
        if (Array.isArray(old)) this.history=old.slice(-30).filter(r=>r?.protocol===PROTOCOL);
      } catch { this.onStorageError?.(); }
    }
    async prepare({roundId,nonce,mode,target,cost},onCommit=()=>{}) {
      if (!rules.valid(mode,target) || cost!==rules.manifest.cost || roundId!==`dice-${nonce}` || !Number.isSafeInteger(nonce) || nonce<=this.highestNonce || this.rounds.has(roundId)) throw new Error('Invalid or reused round');
      this.highestNonce=nonce;
      this.rounds.set(roundId,{state:'preparing'});
      try {
        const serverSeed=hex(this.crypto.getRandomValues(new Uint8Array(32)));
        const record={protocol:PROTOCOL,assurance:'local-replay-only',gameId:'dice',state:'revealed',sessionId:this.sessionId,roundId,nonce,inputs:{mode,target},cost,rulesVersion:rules.manifest.version,rulesHash:await rulesHash(this.crypto)};
        record.commitment=await sha256(canonical(commitmentPayload(record,serverSeed)),this.crypto);
        const committed={state:'committed',assurance:record.assurance,roundId,nonce,sessionId:record.sessionId,rulesVersion:record.rulesVersion,rulesHash:record.rulesHash,commitment:record.commitment};
        this.rounds.set(roundId,{state:'committed',commitment:record.commitment});
        // The commitment is published to the UI before requesting client entropy.
        await onCommit(clone(committed));
        record.clientSeed=hex(this.crypto.getRandomValues(new Uint8Array(32)));
        record.serverSeed=serverSeed;
        record.randomWord=await randomWord(record,serverSeed,this.crypto);
        record.result=rules.result(await diceFromWord(record.randomWord,this.crypto),mode,target);
        record.recordHash=await sha256(canonical(record),this.crypto);
        this.rounds.set(roundId,{state:'prepared',record});
        return {record:clone(record),public:{...committed,state:'prepared',clientSeed:record.clientSeed}};
      } catch(error) { this.rounds.set(roundId,{state:'failed'}); throw error; }
    }
    complete(roundId) {
      const entry=this.rounds.get(roundId);
      if (!entry || entry.state!=='prepared') throw new Error('Round is not ready or has already settled');
      entry.state='revealed'; this.history.push(clone(entry.record)); this.history=this.history.slice(-30);
      try { this.storage?.setItem(this.storageKey,JSON.stringify(this.history)); } catch { this.onStorageError?.(); }
      // Completed private state is bounded; uniqueness remains protected by engine nonce.
      if (this.rounds.size>64) this.rounds.delete(this.rounds.keys().next().value);
      return clone(entry.record);
    }
  }
  return Object.freeze({PROTOCOL,canonical,sha256,rulesHash,diceFromWord,verify,DemoProvider});
})();
if (typeof module !== 'undefined') module.exports = Fairness;

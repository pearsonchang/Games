'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../src');
function languageContext({saved, search='', blocked=false}={}) {
  const values = new Map(saved ? [['playroom.language', saved]] : []);
  const window = {location:{search}, localStorage:{getItem(key){if(blocked)throw Error('Denied');return values.get(key);},setItem(key,value){if(blocked)throw Error('Denied');values.set(key,value);}}};
  const context = vm.createContext({window, URLSearchParams, Map, WeakMap});
  for (const file of ['i18n.js', ...fs.readdirSync(root).filter(name => /^i18n-en-.*\.js$/u.test(name)).sort()]) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), context, {filename:file});
  return {api:window.PlayroomI18n, values};
}
test('language defaults safely, validates saved preferences, and preserves selection without storage',()=>{
  assert.equal(languageContext().api.language,'zh-CN');
  assert.equal(languageContext({saved:'en'}).api.language,'en');
  assert.equal(languageContext({saved:'garbage'}).api.language,'zh-CN');
  assert.equal(languageContext({saved:'zh-CN',search:'?lang=en'}).api.language,'en');
  const {api,values}=languageContext();
  assert.equal(api.setLanguage('en'),true);assert.equal(values.get('playroom.language'),'en');
  assert.equal(api.setLanguage('not-a-locale'),false);assert.equal(api.language,'en');
  const blocked=languageContext({blocked:true}).api;
  assert.equal(blocked.setLanguage('en'),true);assert.equal(blocked.translate('返回游戏大厅'),'Back to lobby');
});
test('exact translation preserves whitespace and English, never substitutes technical payloads',()=>{
  const {api}=languageContext({saved:'en'});
  assert.equal(api.translate('  模拟积分\n'),'  Demo points\n');
  assert.equal(api.translate('0x0123456789abcdef'),'0x0123456789abcdef');
  assert.equal(api.translate('dice-v1'),'dice-v1');
  assert.equal(api.translate('50 积分 / 局'),'50 pts / round');
  assert.equal(api.translate('金币扫雷'),'Coin Sweeper');
  assert.equal(api.translate('  模拟积分\n','zh-CN'),'  模拟积分\n');
  assert.equal(api.translate('开发者新增但尚未翻译的句子'),'开发者新增但尚未翻译的句子');
});
test('registered dynamic patterns translate whole status messages, retain values and switch back',()=>{
  const {api}=languageContext({saved:'en'});
  api.register({messages:{'测试状态':'Test status'},patterns:[[/^测试状态 (\d+) 积分$/u,'Test status $1 pts']]});
  assert.equal(api.translate('测试状态 125 积分'),'Test status 125 pts');
  assert.equal(api.translate('prefix 测试状态 125 积分'),'prefix 测试状态 125 积分');
  assert.equal(api.translate('测试状态 · 1,234.5 积分'),'Test status · 1,234.5 pts');
  api.setLanguage('zh-CN');assert.equal(api.translate('测试状态 125 积分'),'测试状态 125 积分');
});
test('all user entrypoints load language support before UI scripts and keep English styles last',()=>{
  const pages=['index','lobby-demo','palette-demo','lobby-designs','lobby-a-themes','palettes','minesweeper','rocket','dice','plinko','horse','slots','matrix','blocks','2048','fairness','fairness-setup','fairness-testnet'];
  for(const page of pages){
    const html=fs.readFileSync(path.join(root,page+'.html'),'utf8');
    assert.ok(html.includes('src="i18n.js"'),page);
    assert.ok(html.includes('src="i18n-en-common.js"'),page);
    assert.ok(html.lastIndexOf('href="i18n.css"')>html.lastIndexOf('rel="stylesheet"')-30,page);
    const firstScript=html.match(/<script\b[^>]*src="([^"]+)"/u);
    assert.equal(firstScript?.[1],'i18n.js',page);
  }
});

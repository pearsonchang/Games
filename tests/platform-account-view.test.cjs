'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {PointsWallet} = require('../src/platform-wallet.js');

function renderer() {
  const context = vm.createContext({});
  for (const name of ['platform-catalog', 'platform-view']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', name + '.js'), 'utf8'), context);
  return context;
}
const preferences = overrides => ({favorites: [], explored: [], recent: [], persistent: true, ...overrides});
const session = overrides => ({points: 1000, ledger: [{label: '首次体验赠送', amount: 1000, time: '本次会话'}], rounds: [], ...overrides});
const countRecords = html => (html.match(/class="record account-record"/g) || []).length;
function historySection(html, name) {
  const match = html.match(new RegExp(`<section class="panel ${name}">([\\s\\S]*?)</section>`));
  assert.ok(match, `missing ${name} section`);
  return match[1].split('<details class="account-more">');
}

test('exploration renders all nine playable games, complete names and only real explored progress', () => {
  const view = renderer();
  const html = view.renderExploration(preferences({explored: ['dice', 'dice', '2048', 'unknown']}));
  assert.match(html, /<progress[^>]+value="2" max="9" aria-label="游戏探索进度"/);
  assert.match(html, /class="shelf-heading account-section-head"[^]*?<span><b>2<\/b> \/ 9<\/span>/);
  assert.equal((html.match(/class="exploration-stop(?: visited)?"/g) || []).length, 9);
  assert.equal((html.match(/class="exploration-stop visited"/g) || []).length, 2);
  for (const [id, name] of [['minesweeper', '金币扫雷'], ['rocket', '小火箭'], ['dice', '三骰挑战'], ['plinko', '闪电跑道'], ['horse', '星际赛马'], ['slots', '星际老虎机'], ['matrix', '星际矩阵'], ['blocks', '星际方块'], ['2048', '星际 2048']]) {
    assert.ok(html.includes(`data-play="${id}"`));
    assert.ok(html.includes(`class="lobby-art art-${id}"`), 'art comes from the existing gameArt renderer');
    assert.ok(html.includes(`<span class="exploration-name">${name}</span>`));
    assert.ok(html.includes(`aria-label="${name}，${['dice', '2048'].includes(id) ? '已探索' : '未探索'}，进入游戏"`));
  }
  assert.equal((html.match(/<span>已探索<\/span>/g) || []).length, 2);
});

test('balance uses the wallet total and ledger previews five latest rows without dropping older entries', () => {
  const view = renderer(), wallet = new PointsWallet(1000, () => '12:34');
  for (let index = 0; index < 7; index++) wallet.charge(50, `entry-${index}`);
  wallet.credit(59.52, 'actual payout');
  const html = view.renderPlatformPage({page: 'rewards', session: session({points: wallet.points, ledger: wallet.ledger}), preferences: preferences()});
  assert.match(html, /class="balance">709\.52<span>积分<\/span>/);
  assert.match(html, /<details class="account-more points-rules"><summary>/);
  assert.match(html, /data-help="rules">查看完整规则/);
  const [preview, earlier] = historySection(html, 'account-ledger');
  assert.equal(countRecords(preview), 5);
  assert.equal(countRecords(earlier), 4);
  assert.ok(preview.indexOf('actual payout') < preview.indexOf('entry-6'));
  assert.ok(earlier.includes('首次体验赠送'));
  assert.match(earlier, /class="account-count">4<\/span>/);
  for (let index = 0; index < 7; index++) assert.equal(html.split(`entry-${index}`).length - 1, 1);
  assert.ok(!html.includes('href="#'), 'history disclosure must not navigate the page');
});

test('ledger colors distinguish real credit, debit, zero and a carried-forward balance', () => {
  const view = renderer();
  const examples = [
    [{label: '到账', amount: 60, time: '12:00'}, 'positive', '+60'],
    [{label: '入场', amount: -50, time: '12:00'}, 'negative', '-50'],
    [{label: '未命中', amount: 0, time: '12:00'}, 'neutral', '0'],
    [{label: '历史结余', amount: 1000, time: ''}, 'neutral', '1,000']
  ];
  for (const [record, tone, amount] of examples) {
    const html = view.renderLedgerRecord(record);
    assert.ok(html.includes(`class="account-record-value ${tone}">${amount} 积分`));
  }
});

test('profile uses actual stats, at most three favorite previews and retains every round summary', () => {
  const view = renderer();
  const rounds = [
    {gameId: 'minesweeper', won: true, amount: 59.52},
    {gameId: 'rocket', won: false, amount: 0},
    {gameId: 'dice', won: true, amount: 97},
    {gameId: 'plinko', won: false, amount: 25, multiplier: .5},
    {gameId: 'horse', won: false, amount: 14, rank: 3},
    {gameId: 'slots', won: false, amount: 50, kind: 'pair'},
    {gameId: 'matrix', won: true, amount: 100, net: 50},
    {gameId: 'blocks', won: false, amount: 20, score: 500, net: -30},
    {gameId: '2048', won: true, amount: 80, highest: 2048, net: 30}
  ].map((round, index) => ({...round, cost: 50, seconds: index + 1, time: `time-${index}`}));
  const html = view.renderProfilePage(session({rounds}), preferences({favorites: ['dice', 'rocket', 'slots', '2048'], explored: ['dice', 'rocket']}));
  assert.match(html, /class="profile-avatar"><svg class="station-buddy"/);
  assert.match(html, /class="profile-stat" data-collection>[^]*?<strong>4<\/strong><span>我的收藏/);
  assert.match(html, /class="profile-stat" data-page="rewards">[^]*?<strong>2<\/strong><span>已探索/);
  assert.equal((html.match(/class="collection-preview-art"/g) || []).length, 3);
  const [preview, earlier] = historySection(html, 'account-rounds');
  assert.equal(countRecords(preview), 3);
  assert.equal(countRecords(earlier), 6);
  for (const round of rounds) {
    assert.ok(html.includes(view.roundSummary(round)), `preserve ${round.gameId} payout information`);
    assert.equal(html.split(`${round.time} · ${round.seconds} 秒`).length - 1, 1);
  }
  for (const kind of ['rules', 'account', 'about']) assert.ok(html.includes(`data-help="${kind}"`));
  assert.ok(html.includes('href="fairness.html" target="_blank" rel="noopener"'));
  assert.match(html, /class="panel account-settings">[^]*?<div data-native-settings-slot><\/div>[^]*?<\/section>/);
});

test('empty states and persistence notices stay honest for web and unavailable native saves', () => {
  const view = renderer();
  const empty = view.renderProfilePage(session(), preferences({persistent: false}));
  assert.ok(empty.includes('还没有收藏的游戏'));
  assert.ok(empty.includes('还没有完成的游戏。'));
  assert.ok(empty.includes('当前无法保存到本机，收藏与足迹仅在本次页面有效。'));
  assert.ok(empty.includes('游戏积分与对局记录刷新后重置。'));
  assert.ok(!empty.includes('class="collection-preview-art"'));
  assert.ok(!empty.includes('查看更早对局'));
  assert.match(empty, /data-page="games">浏览游戏/);
  const noLedger = view.renderPointsPage(session({ledger: []}), preferences());
  assert.ok(noLedger.includes('暂无积分明细'));
  for (const status of ['invalid', 'unavailable', 'error']) for (const render of ['renderPointsPage', 'renderProfilePage']) {
    const html = view[render](session({native: true, storageStatus: status}), preferences());
    assert.ok(html.includes('本次为临时试玩，请留意存档提示。'));
    assert.ok(!html.includes('积分与对局保存在这台设备。'));
    assert.ok(!html.includes('刷新后重置'));
  }
  const native = view.renderProfilePage(session({native: true, storageStatus: 'saved'}), preferences());
  assert.ok(native.includes(view.nativeSaveNotice({storageStatus: 'saved'})));
});

test('history labels, timestamps and complete round summaries remain HTML-escaped', () => {
  const view = renderer(), unsafe = '<img src=x onerror="attack()">';
  const ledger = view.renderLedgerRecord({label: unsafe, time: unsafe, amount: 1});
  const round = view.renderRoundRecord({gameId: '2048', highest: unsafe, amount: 80, cost: 50, net: 30, time: unsafe, seconds: unsafe});
  for (const html of [ledger, round]) {
    assert.ok(!html.includes(unsafe));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;attack()&quot;&gt;'));
  }
});

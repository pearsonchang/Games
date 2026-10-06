'use strict';

const lobbyFilters = ['全部', '收藏', '主动收取', '掷骰与转轴', '竞速与弹珠'];
function lobbyGlyph(name) {
  const paths = {
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    orbit:'<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="6"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    grid:'<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>'
  };
  return `<svg class="ui-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
}
function stationBuddy() {
  return `<svg class="station-buddy" viewBox="0 0 76 68" fill="none" aria-hidden="true"><path d="M38 15V8" stroke="#a28aff" stroke-width="3"/><circle cx="38" cy="6" r="4" fill="#a28aff"/><path d="M14 37H8v11h7m47-11h6v11h-7" stroke="#73cde7" stroke-width="4" stroke-linejoin="round"/><rect x="14" y="18" width="48" height="41" rx="17" fill="#c0d8ef"/><path d="M18 44c3 11 11 12 20 12s18-2 21-11" stroke="#8a9dc9" stroke-width="3"/><rect x="20" y="25" width="36" height="24" rx="10" fill="#12283d"/><g class="buddy-eyes" fill="#71e2e9"><rect x="27" y="32" width="5" height="8" rx="2.5"/><rect x="44" y="32" width="5" height="8" rx="2.5"/></g><path d="M35 42q3 3 6 0" stroke="#71e2e9" stroke-width="1.5" stroke-linecap="round"/><path d="M28 59v3m20-3v3" stroke="#9cadd6" stroke-width="6" stroke-linecap="round"/></svg>`;
}
function favoriteButton(game, preferences, extra = '') {
  const saved = preferences.favorites.includes(game.id);
  return `<button class="favorite-button ${extra}" data-favorite="${game.id}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}${game.name}">${lobbyGlyph('star')}</button>`;
}
function gameArt(id, extra = '') {
  return `<span class="icon-motion ${extra}" aria-hidden="true"><i class="icon-spark"></i><span class="lobby-art art-${id}"></span><i class="icon-spark"></i></span>`;
}
function renderGameCard(game, preferences) {
  return `<article class="game-card" data-play="${game.id}"><button class="game-open" data-play="${game.id}" aria-label="${game.name}，${game.cost}，进入游戏"><span class="cover ${game.cover}"><span class="card-category">${game.tag}</span>${gameArt(game.id)}<span class="icon-pedestal" aria-hidden="true"></span></span><span class="game-details"><span class="game-title-row"><span class="game-name">${game.name}</span>${lobbyGlyph('arrow')}</span><span class="game-description">${game.description}</span><span class="card-bottom"><span class="entry-cost"><i aria-hidden="true"></i>${game.cost}</span><span class="play-label">开始玩</span></span></span></button>${favoriteButton(game, preferences)}</article>`;
}
function renderRecent(preferences) {
  if (!preferences.recent.length) return '';
  return `<section class="recent-section" aria-label="最近玩过"><div class="shelf-heading"><h2>${lobbyGlyph('clock')}最近玩过</h2><span>随时回到熟悉的世界</span></div><div class="recent-list">${preferences.recent.map(id => `<button class="recent-game" data-play="${id}" aria-label="再次打开${gameName(id)}"><span class="recent-art">${gameArt(id)}</span><span><strong>${gameName(id)}</strong><small>进入游戏</small></span>${lobbyGlyph('arrow')}</button>`).join('')}</div></section>`;
}
function renderLobby({session, filter, preferences}) {
  const available = catalog.filter(game => game.available);
  const featured = available.find(game => game.id === 'matrix');
  const games = available.filter(game => filter === '全部' ? true : filter === '收藏' ? preferences.favorites.includes(game.id) : game.category === filter);
  const categories = lobbyFilters.map(item => `<button class="filter" data-filter="${item}" aria-pressed="${filter === item}">${item === '收藏' ? lobbyGlyph('star') : ''}${item}${item === '收藏' ? `<span class="filter-count">${preferences.favorites.length}</span>` : ''}</button>`).join('');
  return `<div class="welcome"><div><p class="station-eyebrow">PLAYROOM / 星际游乐站</p><h1>今天，玩点什么<span>？</span></h1></div><div class="buddy-welcome"><span>选个世界，出发。</span>${stationBuddy()}</div></div>
    ${filter === '全部' ? `<section class="featured-game" aria-label="本次推荐：星际矩阵"><div class="featured-copy"><p class="feature-kicker"><span></span>本次推荐 <i>SECTOR 07</i></p><h2>星际矩阵</h2><p class="feature-description">让图案，连成一片星轨。</p><div class="feature-tags"><span>五列三行</span><span>十线叠加</span></div><div class="featured-actions"><button class="primary" data-play="matrix">进入矩阵${lobbyGlyph('arrow')}</button><span class="entry-cost">50 积分 / 局</span></div></div><div class="featured-scene" aria-hidden="true"><span class="scene-orbit orbit-one"></span><span class="scene-orbit orbit-two"></span><span class="scene-star star-one">✦</span><span class="scene-star star-two">✧</span><img src="matrix-icon.svg" alt="" width="300" height="248"><span class="scene-deck"></span><span class="scene-coordinate">ORBIT MATRIX / 5 × 3</span></div>${favoriteButton(featured, preferences, 'featured-favorite')}</section>` : ''}
    ${filter === '全部' ? renderRecent(preferences) : ''}
    <section class="game-collection" aria-label="探索游戏"><div class="shelf-heading collection-heading"><h2>${lobbyGlyph('grid')}${filter === '全部' ? '更多好玩' : filter === '收藏' ? '我的收藏' : filter}</h2><span>${filter === '全部' ? '7 款游戏 · 即点即玩' : games.length + ' 款游戏'}</span></div><div class="filters" aria-label="游戏分类">${categories}</div>
    <div class="catalog">${games.map(game => renderGameCard(game, preferences)).join('') || `<div class="collection-empty">${lobbyGlyph('star')}<h3>给喜欢的游戏，留颗星</h3><p>点击卡片右上角的星标，下次更快找到它。</p><button class="secondary-button" data-filter="全部">去发现游戏 ${lobbyGlyph('arrow')}</button></div>`}</div></section>
    <section class="station-roadmap" aria-label="筹备中的游戏"><span class="roadmap-label">下一站</span><p>2048<span>·</span>记忆翻牌<span>·</span>节奏点击</p><span class="roadmap-status">筹备中</span></section>
    <p class="catalog-footer">模拟积分仅供体验，刷新后重置。${preferences.persistent ? '收藏与足迹保存在本机。' : '收藏与足迹暂存于本次页面。'}</p>`;
}
function renderExploration(preferences) {
  const available = catalog.filter(game => game.available);
  return `<section class="panel exploration-panel"><div class="shelf-heading"><h2>探索足迹</h2><span><b>${preferences.explored.length}</b> / ${available.length}</span></div><p class="muted">你打开过的游戏，都在这里留下一颗星。</p><div class="exploration-track">${available.map(game => `<button data-play="${game.id}" class="exploration-stop ${preferences.explored.includes(game.id) ? 'visited' : ''}" aria-label="${game.name}，${preferences.explored.includes(game.id) ? '已探索' : '未探索'}，进入游戏">${lobbyGlyph(preferences.explored.includes(game.id) ? 'star' : 'orbit')}<span>${game.name.replace('星际','').replace('挑战','').replace('金币','')}</span></button>`).join('')}</div><p class="exploration-note">记录探索，不影响游戏概率或积分奖励。</p></section>`;
}
function roundSummary(round) {
  if (round.gameId === 'matrix') return `矩阵返还 ${round.amount} 积分 · 净收益 ${round.net > 0 ? '+' : ''}${round.net}`;
  if (round.gameId === 'slots') return round.kind === 'pair' ? '返还投入 · 50 积分' : round.kind === 'triple' ? `三连命中 · ${round.amount} 积分` : '未命中 · 0 积分';
  if (round.gameId === 'horse') return `第 ${round.rank} 名 · ${round.amount} 积分`;
  if (round.gameId === 'plinko') return `落袋 ${round.multiplier}× · ${round.amount} 积分`;
  if (round.gameId === 'dice') return round.won ? `命中 · ${round.amount} 积分` : '未命中 · 0 积分';
  if (round.gameId === 'rocket') return round.won ? `已收取 ${round.amount} 积分` : '已坠毁 · 0 积分';
  return round.won ? `已收取 ${formatPoints(round.amount)} 积分` : round.state === 'forfeited' ? '已结束 · 0 积分' : '踩到地雷 · 0 积分';
}
function renderPlatformPage({page, session, filter, preferences}) {
  if (page === 'games') return renderLobby({session, filter, preferences});
  if (page === 'rewards') return `<p class="station-eyebrow">YOUR PLAYROOM</p><h1>积分与足迹</h1><p class="muted">每个新世界，都值得探索一下。</p><div class="panel-grid"><section class="panel points-panel"><h2>本次体验积分</h2><div class="balance">${formatPoints(session.points)}<span>积分</span></div><p class="muted">初始赠送 1,000 积分 · 每局 50 积分<br>奖励含本局投入</p><button class="text-button" data-page="games">去游戏大厅 ${lobbyGlyph('arrow')}</button></section>${renderExploration(preferences)}</div><section class="panel list-panel"><h2>积分明细</h2>${session.ledger.slice().reverse().map(record => `<div class="record"><div>${record.label}<small>${record.time}</small></div><span class="${record.amount > 0 ? 'positive' : 'muted'}">${record.amount > 0 ? '+' : ''}${formatPoints(record.amount)} 积分</span></div>`).join('')}</section><p class="notice">模拟积分与游戏记录仅用于本次体验，刷新后重置。无充值、提现或真实资产交易。</p>`;
  return `<p class="station-eyebrow">PLAYER CABIN</p><h1>我的游乐舱</h1><div class="profile"><span class="avatar">P</span><div><h2>游客玩家</h2><p class="muted">${preferences.favorites.length} 款收藏 · ${preferences.explored.length} 款已探索</p></div></div><button class="collection-shortcut" data-collection>${lobbyGlyph('star')}<span>我的游戏收藏<small>把喜欢的世界放在一起</small></span><b>${preferences.favorites.length}</b>${lobbyGlyph('arrow')}</button><div class="panel-grid"><section class="panel"><h2>本次游戏记录</h2>${session.rounds.length ? session.rounds.slice().reverse().map(round => `<div class="record"><div>${gameName(round.gameId)}<small>${round.time} · ${round.seconds} 秒</small></div><span class="${round.won ? 'positive' : 'muted'}">${roundSummary(round)}</span></div>`).join('') : '<div class="empty">还没有完成的游戏。</div><button class="primary" data-page="games">挑一款游戏</button>'}</section><section><div class="rows"><button class="row-button" data-help="account"><span>账户与钱包</span><span>未接入 ›</span></button><button class="row-button" data-help="rules"><span>玩法说明</span><span>游戏规则 ›</span></button><button class="row-button" data-help="about"><span>关于 PLAYROOM</span><span>Demo ›</span></button></div><p class="notice">${preferences.persistent ? '收藏与探索足迹保存在当前浏览器。' : '当前无法保存到本机，收藏与足迹仅在本次页面有效。'}游戏积分与对局记录刷新后重置。</p></section></div>`;
}
function formatPoints(value) { return value.toLocaleString('zh-CN', {maximumFractionDigits: 2}); }

function help(kind){const copy={account:['账户与钱包','当前使用游客模式，无需注册即可试玩。\n账户绑定和钱包连接尚未接入。'],rules:['游戏怎么玩？','金币扫雷：54 格中固定藏着 10 颗雷，每局开始时随机生成。\n每次只翻开一格，没有数字提示或首次保护。金币颜色不提供线索。\n每局消耗 50 积分，成功揭开至少一格后可随时收取。奖励含本局投入；踩雷时本局奖励归零，开局消耗不退还。\n奖励按理论返还率 97% 计算，保留两位小数并向下取整，实际返还率略低。揭开全部安全格自动收取，返回大厅可保留当前局。\n\n小火箭：每局消耗 50 积分。飞行越久倍率越高，可随时主动收取；坠毁前未收取则本局奖励归零。收取得分含本局投入，切出页面不会暂停。\n理论返还率 97%，每局理论平均净收益约 −1.5 积分。没有起飞保护，约 3% 开局即坠毁；喷焰与音效不预示坠毁。倍率向下保留两位小数，到达 10× 自动收取 500 积分。\n\n三骰挑战：每局消耗 50 积分。可选大小、指定总点数、任意三同号；大小排除三同号。命中后自动发放界面所示奖励（含投入），未命中无奖励。\n\n闪电跑道：每局 50 积分，选择入口释放弹珠，按落袋倍率自动发放积分（含投入）；低于 1 倍会损失部分投入。返回大厅不暂停结算。\n\n星际赛马：每局 50 模拟积分，四匹马选一匹。每匹马任一名次的概率均为 25%，第 1–4 名到账 140、40、14、0 积分（含投入），理论返还率 97%。开赛时随机决定名次，再播放竞速动画。返回大厅后继续自动结算。\n\n星际老虎机：每局 50 模拟积分，按中间横线结算。三个图案相同按奖励表到账；两个相同（含首尾）返还 50 积分；三个不同奖励为 0。奖励含投入，理论返还率 97%。\n\n星际矩阵：每局 50 模拟积分，五列三行、十条固定线，每线投入 5 积分。从最左列起连续 3–5 个同图案，按该线最高奖励结算，多线可叠加。跃迁百搭可替代普通图案；任意位置 3/4/5+ 个徽章额外返还 100/250/1,000 积分。奖励含投入，理论返还率约 97.02%。'],about:['关于 PLAYROOM','一个轻量休闲游戏平台 Demo。\n当前可玩：金币扫雷、小火箭、三骰挑战、闪电跑道、星际赛马、星际老虎机、星际矩阵。其他游戏正在筹备中。\n所有奖励均为模拟积分，不涉及真实资产。']};document.getElementById('help-title').textContent=copy[kind][0];document.getElementById('help-text').textContent=copy[kind][1];document.getElementById('help').showModal()}

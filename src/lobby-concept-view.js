'use strict';
// Shared lobby shell for the homepage and design previews; the selected theme overrides its renderer.
const conceptSprite = 'lobby-concept-icons.svg';
gameArt = function(id, extra = '') {
  return `<span class="icon-motion ${extra}" aria-hidden="true"><svg class="concept-symbol" viewBox="0 0 200 180"><use href="${conceptSprite}#${id}"/></svg></span>`;
};
renderLobby = function({filter, preferences}) {
  const available = catalog.filter(game => game.available);
  const featured = available.find(game => game.id === 'matrix');
  const games = available.filter(game => filter === '全部' ? true : filter === '收藏' ? preferences.favorites.includes(game.id) : game.category === filter);
  return `<div class="concept-welcome"><div><p>${concept.eyebrow}</p><h1>今天，玩点什么？</h1></div><span class="welcome-sticker">${stationBuddy()}<i>HELLO!</i></span></div>
  ${filter === '全部' ? `<section class="concept-hero" aria-label="精选游戏：星际矩阵"><div class="hero-copy"><span class="hero-badge">✦ 精选游戏 <b>STAR PICK</b></span><h2>${concept.headline}<br><em>${concept.highlight}</em></h2><p>${concept.detail}</p><div class="hero-cta"><button class="primary" data-play="matrix">玩星际矩阵 ${lobbyGlyph('arrow')}</button><span>50 积分 / 局</span></div></div><div class="hero-world" aria-hidden="true"><i class="world-disc"></i><i class="world-ring"></i><span class="world-confetti confetti-one">✦</span><span class="world-confetti confetti-two">✧</span><span class="hero-main-art">${gameArt('matrix')}</span><span class="hero-rocket">${gameArt('rocket')}</span><span class="world-ticket">LET'S PLAY</span><span class="world-cloud cloud-one"></span><span class="world-cloud cloud-two"></span></div>${favoriteButton(featured,preferences,'hero-favorite')}</section><div class="concept-ribbon"><span>7 个小世界</span><i>✦</i><span>随时来一局</span><i>✦</i><span>模拟积分体验</span></div>` : ''}
  <section class="game-collection" aria-label="探索游戏"><div class="shelf-heading"><h2>${filter === '全部' ? concept.category : filter === '收藏' ? '我的收藏' : filter}</h2><span>${filter === '全部' ? 'FIND YOUR NEXT FAVORITE' : `${games.length} 款游戏`}</span></div><div class="filters" aria-label="游戏分类">${lobbyFilters.map(item=>`<button class="filter" data-filter="${item}" aria-pressed="${filter===item}">${item==='收藏'?lobbyGlyph('star'):''}${item}${item==='收藏'?` <span>${preferences.favorites.length}</span>`:''}</button>`).join('')}</div><div class="catalog">${games.map(game=>renderGameCard(game,preferences)).join('')||`<div class="collection-empty">${lobbyGlyph('star')}<h3>收藏一个喜欢的小世界</h3><p>点亮卡片上的星标，下次更快找到它。</p><button class="secondary-button" data-filter="全部">去发现游戏</button></div>`}</div></section>
  ${filter === '全部' ? renderRecent(preferences) : ''}<p class="catalog-footer">模拟积分仅供体验，刷新后重置。收藏与足迹保存在本机。</p>`;
};
const previewSwitcher = document.getElementById('concept-switcher');
const conceptReviewRoute = concept.family ? 'lobby-a-themes.html' : 'lobby-designs.html';
const relatedConcepts = Object.entries(lobbyConcepts).filter(([,value]) => value.family === concept.family);
previewSwitcher.innerHTML = `<a href="${conceptReviewRoute}">‹ 方案对比</a><span>${concept.letter} · ${concept.name}</span><nav aria-label="切换设计方案">${relatedConcepts.map(([key,value])=>`<a href="lobby-demo.html?look=${key}" ${conceptKey===key?'aria-current="page"':''} aria-label="查看方案 ${value.letter} ${value.name}">${value.letter}</a>`).join('')}</nav>`;

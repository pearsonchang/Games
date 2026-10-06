'use strict';
// The three A-family worlds share all game state with the existing demo shell.
const themeSceneAsset = 'lobby-theme-scenes.svg';
function themeScene(name, extra = '') {
  return `<svg class="theme-scene ${extra}" viewBox="0 0 360 300" aria-hidden="true"><use href="${themeSceneAsset}#${name}"/></svg>`;
}
function renderWorldCard(game, preferences) {
  const index = String(catalog.findIndex(item => item.id === game.id) + 1).padStart(2,'0');
  return `<article class="game-card world-card" data-play="${game.id}">
    <button class="game-open" data-play="${game.id}" aria-label="${game.name}，${game.cost}，进入游戏">
      <span class="cover ${game.cover}"><span class="card-category">${game.tag}</span><span class="world-card-orbit" aria-hidden="true"></span><span class="world-card-floor" aria-hidden="true"></span>${gameArt(game.id)}<span class="world-card-code" aria-hidden="true">${concept.cardLabel} ${index}</span><span class="world-card-sticker" aria-hidden="true">✦</span></span>
      <span class="game-details"><span class="game-title-row"><span class="game-name">${game.name}</span>${lobbyGlyph('arrow')}</span><span class="game-description">${game.description}</span><span class="card-bottom"><span class="entry-cost"><i aria-hidden="true"></i>${game.cost}</span><span class="play-label">${conceptKey === 'depot' ? '出发' : conceptKey === 'portal' ? '传送' : '开玩'}</span></span></span>
    </button>${favoriteButton(game,preferences)}
  </article>`;
}
function renderThemeLobby({filter, preferences}) {
  const available = catalog.filter(game => game.available);
  const featured = available.find(game => game.id === concept.featured);
  const games = available.filter(game => filter === '全部' ? true : filter === '收藏' ? preferences.favorites.includes(game.id) : game.category === filter);
  const companion = conceptKey === 'depot' ? 'minesweeper' : 'rocket';
  return `<div class="theme-welcome"><div><p>${concept.eyebrow}</p><h1>${concept.welcome}</h1></div><span class="theme-greeting" aria-hidden="true">${stationBuddy()}<i>${conceptKey === 'depot' ? 'HEY, CAPTAIN!' : conceptKey === 'portal' ? 'LET’S GO!' : 'HI, PLAYER!'}</i></span></div>
    ${filter === '全部' ? `<section class="theme-hero" aria-label="${concept.featureLabel}">
      <div class="theme-hero-text"><span class="theme-feature-label"><i aria-hidden="true"></i>${concept.featureLabel}</span><h2>${concept.headline}<br><em>${concept.highlight}</em></h2><p>${concept.detail}</p><button class="primary theme-hero-cta" data-play="${featured.id}">${concept.action}${lobbyGlyph('arrow')}</button><small>${featured.cost}</small></div>
      <div class="theme-hero-scene" aria-hidden="true">${themeScene(conceptKey)}<span class="theme-hero-art">${gameArt(featured.id)}</span><span class="theme-companion-art">${gameArt(companion)}</span><span class="scene-buddy">${conceptKey === 'portal' ? themeScene('alien') : stationBuddy()}</span><span class="scene-orb orb-a"></span><span class="scene-orb orb-b"></span><span class="theme-spark spark-a">✦</span><span class="theme-spark spark-b">✧</span><span class="scene-caption">${concept.sceneLabel}</span></div>
      <div class="theme-marquee" aria-hidden="true">${Array.from({length:14},(_,i)=>`<i style="--bulb:${i}"></i>`).join('')}</div>${favoriteButton(featured,preferences,'theme-hero-favorite')}
    </section><div class="theme-ribbon">${concept.ribbon.map((text,index)=>`${index?'<i aria-hidden="true">✦</i>':''}<span>${text}</span>`).join('')}</div>` : ''}
    <section class="game-collection theme-collection" aria-label="探索游戏"><div class="shelf-heading"><h2>${filter === '全部' ? concept.category : filter === '收藏' ? '我的收藏' : filter}</h2><span>${filter === '全部' ? `${available.length} GAMES / LET’S PLAY` : `${games.length} 款游戏`}</span></div><div class="filters" aria-label="游戏分类">${lobbyFilters.map(item=>`<button class="filter" data-filter="${item}" aria-pressed="${filter===item}">${item==='收藏'?lobbyGlyph('star'):''}${item}${item==='收藏'?` <span>${preferences.favorites.length}</span>`:''}</button>`).join('')}</div><div class="catalog">${games.map(game=>renderWorldCard(game,preferences)).join('') || `<div class="collection-empty">${lobbyGlyph('star')}<h3>给喜欢的世界留颗星</h3><p>点亮卡片星标，下次直接出发。</p><button class="secondary-button" data-filter="全部">去发现游戏</button></div>`}</div></section>
    ${filter === '全部' ? renderRecent(preferences) : ''}<p class="catalog-footer">模拟积分仅供体验，刷新后重置。${preferences.persistent ? '收藏与足迹保存在本机。' : '收藏与足迹暂存于本次页面。'}</p>`;
}
if (concept.family === 'aurora') renderLobby = renderThemeLobby;

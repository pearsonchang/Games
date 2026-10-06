'use strict';
// A1 energy-arcade presentation; play and settlement stay in the platform.
const festivalEnergySprite = 'lobby-energy-art.svg';
const festivalArtwork = {rocket:'rocket-icon-orbit.webp',horse:'orbit-horse-icon.webp'};
function festivalArt(id, extra = '') {
  const sprite = ['minesweeper','dice','plinko'].includes(id);
  return `<span class="energy-art ${extra}" aria-hidden="true">${sprite ? `<span class="energy-sprite sprite-${id}"></span>` : festivalArtwork[id] ? `<img src="${festivalArtwork[id]}" alt="" width="200" height="200">` : `<svg viewBox="${id === 'matrix' ? '0 0 520 360' : '0 0 200 180'}"><use href="${festivalEnergySprite}#${id}"/></svg>`}</span>`;
}
const festivalMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let festivalMotionPaused = false;
const festivalMotionOn = () => !festivalMotionPaused && !festivalMotionPreference.matches;

function renderFestivalCard(game, preferences) {
  const index = String(catalog.findIndex(item => item.id === game.id) + 1).padStart(2,'0');
  return `<article class="game-card energy-card" data-play="${game.id}"><button class="game-open" data-play="${game.id}" aria-label="${game.name}，${game.cost}，进入游戏">
    <span class="cover ${game.cover}"><span class="energy-card-grid" aria-hidden="true"></span><span class="card-category">${game.tag}</span>${festivalArt(game.id)}<span class="energy-card-orbit" aria-hidden="true"></span><span class="energy-card-code" aria-hidden="true">${index} / PLAYROOM</span><span class="energy-card-mark" aria-hidden="true">↗</span></span>
    <span class="game-details"><span class="game-title-row"><span class="game-name">${game.name}</span>${lobbyGlyph('arrow')}</span><span class="game-description">${game.description}</span><span class="card-bottom"><span class="entry-cost"><i aria-hidden="true"></i>${game.cost}</span><span class="play-label">进入游戏 ${lobbyGlyph('arrow')}</span></span></span>
    </button>${favoriteButton(game,preferences)}</article>`;
}
function renderFestivalLobby({filter, preferences}) {
  const games = catalog.filter(game => game.available);
  const featured = games.find(game => game.id === 'matrix');
  const collection = games.filter(game => filter === '全部' ? true : filter === '收藏' ? preferences.favorites.includes(game.id) : game.category === filter);
  const filterArt = {'全部':'grid','收藏':'star','主动收取':'orbit','掷骰与转轴':'grid','竞速与弹珠':'arrow'};
  return `<div class="energy-background" aria-hidden="true"><span></span><i></i></div>
    <div class="energy-welcome"><div class="energy-welcome-copy"><p class="energy-welcome-kicker"><span>游戏大厅</span><i aria-hidden="true"></i>ARCADE LOBBY</p><h1>下一局，<span>即刻入场。</span></h1></div><button class="energy-game-count" data-festival-discover aria-label="浏览全部 ${games.length} 款游戏"><span class="energy-count-orbit" aria-hidden="true"></span><strong>${String(games.length).padStart(2,'0')}</strong><span>款游戏</span>${lobbyGlyph('arrow')}</button></div>
    ${filter === '全部' ? `<section class="energy-hero" aria-label="精选游戏：星际矩阵"><div class="energy-hero-copy"><span class="energy-feature-label"><i aria-hidden="true"></i>精选游戏 <b>FEATURED / 07</b></span><span class="energy-hero-word" aria-hidden="true">GO BEYOND.</span><h2>星际矩阵<span>点亮你的<span>高能时刻。</span></span></h2><p>五列三行，十条星轨同时开启。</p><div class="energy-hero-actions"><button class="primary energy-main-cta" data-play="matrix">进入矩阵 ${lobbyGlyph('arrow')}</button><span class="energy-hero-cost">${featured.cost}</span></div></div>
    <div class="energy-hero-scene" aria-hidden="true"><span class="energy-portal portal-back"></span><span class="energy-portal portal-front"></span><span class="energy-hero-speed speed-one"></span><span class="energy-hero-speed speed-two"></span>${festivalArt('matrix','energy-feature-art')}<span class="energy-floating-code"><b>10</b>PAYLINES</span><span class="energy-scene-cross">✦</span></div>
    <div class="energy-hero-foot"><span>ORBIT MATRIX</span><span>5 × 3 阵列 <i>/</i> 10 条奖励线</span><b aria-hidden="true">↗</b></div>${favoriteButton(featured,preferences,'energy-hero-favorite')}</section>
    <div class="energy-rail"><span><b>07</b> 款游戏 · 即点即玩</span><span class="energy-rail-line" aria-hidden="true"></span><button data-festival-discover>探索全部 ${lobbyGlyph('arrow')}</button></div>` : ''}
    <section class="game-collection energy-collection" aria-label="探索游戏"><div class="shelf-heading"><h2>${filter === '全部' ? '选择你的下一场' : filter === '收藏' ? '我的收藏' : filter}</h2><span>${filter === '全部' ? 'CHOOSE YOUR GAME' : `${collection.length} 款游戏`}</span></div>
    <div class="filters" aria-label="游戏分类">${lobbyFilters.map(item=>`<button class="filter" data-filter="${item}" aria-pressed="${filter===item}">${lobbyGlyph(filterArt[item])}<span>${item}</span>${item==='收藏'?`<b>${preferences.favorites.length}</b>`:''}</button>`).join('')}</div>
    <div class="catalog">${collection.map(game=>renderFestivalCard(game,preferences)).join('') || `<div class="collection-empty">${lobbyGlyph('star')}<h3>收藏你的下一场</h3><p>点亮卡片星标，随时回来开玩。</p><button class="secondary-button" data-filter="全部">探索全部游戏 ${lobbyGlyph('arrow')}</button></div>`}</div></section>
    ${filter === '全部' ? renderRecent(preferences) : ''}
    <div class="energy-endcap"><span>PLAY AT YOUR PACE.</span><button class="energy-motion-toggle" data-festival-motion aria-pressed="${festivalMotionOn()}" ${festivalMotionPreference.matches ? 'disabled' : ''}>${festivalMotionPreference.matches ? '跟随系统减少动效' : festivalMotionOn() ? '暂停大厅动效' : '开启大厅动效'}</button></div>
    <p class="catalog-footer">模拟积分仅供体验，刷新后重置。${preferences.persistent ? '收藏与足迹保存在本机。' : '收藏与足迹暂存于本次页面。'}</p>`;
}

if (conceptKey === 'festival') {
  const brandMark = 'playroom-mark.svg';
  document.querySelector('.brand').innerHTML = `<img class="energy-brand-mark" src="${brandMark}" width="36" height="36" alt="" aria-hidden="true"><span class="energy-brand-wordmark">PLAY<span>ROOM</span></span><span class="demo">DEMO</span>`;
  document.querySelector('link[rel="icon"]').href = brandMark;
  const balanceMarkup = document.getElementById('header-points').outerHTML;
  document.querySelector('.header-wallet').innerHTML = `<svg class="energy-credit-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#FFD782" fill-opacity=".12" stroke="#E9C584" stroke-width="1.4"/><circle cx="16" cy="16" r="9.5" stroke="#E9C584" stroke-opacity=".35"/><path d="m16 9 2 4.5 5 .5-3.8 3.2 1.1 4.8-4.3-2.6-4.3 2.6 1.1-4.8L9 14l5-.5L16 9Z" fill="#F4D49A"/></svg><span class="energy-wallet-copy"><span class="energy-wallet-label">模拟积分</span>${balanceMarkup}</span><svg class="energy-wallet-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  document.querySelector('.guest').innerHTML = `<span class="energy-pilot-avatar" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M8 23v-8a10 10 0 0 1 20 0v8l-4 7H12l-4-7Z" fill="#BBC6F6"/><path d="M10 22h16l-2 6H12l-2-6Z" fill="#929FDA"/><rect x="10" y="11" width="16" height="12" rx="5" fill="#273863"/><path d="M13 16c1-2 3-2 5-2" stroke="#97E8FF" stroke-width="2" stroke-linecap="round"/><path d="M6 16v6m24-6v6" stroke="#88A1EB" stroke-width="3" stroke-linecap="round"/><path d="M15 27h6" stroke="#D9E3FF" stroke-width="2" stroke-linecap="round"/></svg></span><span class="energy-guest-copy"><span>游客玩家</span><small>个人中心</small></span>`;
  document.querySelector('.concept-switcher > span').innerHTML = `<i aria-hidden="true"></i>高能街机<span>设计预览</span>`;
  renderLobby = renderFestivalLobby;
  gameArt = festivalArt;
  const syncFestivalMotion = () => {
    document.documentElement.dataset.festivalMotion = festivalMotionOn() ? 'on' : 'off';
    const button = document.querySelector('button[data-festival-motion]');
    if (button) {
      button.disabled = festivalMotionPreference.matches;
      button.setAttribute('aria-pressed',String(festivalMotionOn()));
      button.textContent = festivalMotionPreference.matches ? '跟随系统减少动效' : festivalMotionOn() ? '暂停大厅动效' : '开启大厅动效';
    }
  };
  syncFestivalMotion();
  festivalMotionPreference.addEventListener('change',syncFestivalMotion);
  function festivalBurst(button) {
    if (!festivalMotionOn() || document.hidden) return;
    document.querySelector('.festival-click-burst')?.remove();
    const rect = button.getBoundingClientRect();
    const burst = document.createElement('span');
    burst.className = 'festival-click-burst';
    burst.setAttribute('aria-hidden','true');
    burst.style.left = `${rect.left + rect.width/2}px`;
    burst.style.top = `${rect.top + rect.height/2}px`;
    for(let index=0; index<7; index++) {
      const bit = document.createElement('i');
      const angle = index/7*Math.PI*2;
      bit.textContent = index%2 ? '✦' : '';
      bit.style.setProperty('--dx',`${Math.cos(angle)*37}px`);
      bit.style.setProperty('--dy',`${Math.sin(angle)*32-9}px`);
      bit.style.setProperty('--spin',`${index*41}deg`);
      burst.append(bit);
    }
    document.body.append(burst);
    setTimeout(()=>burst.remove(),850);
  }
  document.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button || document.querySelector('#platform').hidden) return;
    if (button.hasAttribute('data-festival-discover')) {
      if (button.classList.contains('energy-game-count')) document.querySelector('.energy-collection .filter[data-filter="全部"]').click();
      const filter = document.querySelector('.energy-collection .filter[aria-pressed=true]');
      filter.focus({preventScroll:true});
      document.querySelector('.energy-collection').scrollIntoView({behavior:festivalMotionOn()?'smooth':'auto',block:'start'});
    } else if (button.hasAttribute('data-festival-motion')) {
      festivalMotionPaused = !festivalMotionPaused;
      syncFestivalMotion();
    } else if (button.hasAttribute('data-favorite') && button.getAttribute('aria-pressed') === 'false') {
      festivalBurst(button);
    }
  });
}

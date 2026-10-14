'use strict';

const content = document.getElementById('content');
const platform = document.getElementById('platform');
const surface = document.getElementById('play-surface');
const frames = Object.fromEntries(Object.keys(gameRoutes).map(id => [id,
  document.getElementById(id === 'minesweeper' ? 'game-frame' : `${id}-frame`)
]));
const wallet = new PointsWallet();
let preferenceStorage;
try { preferenceStorage = window.localStorage; } catch { /* Private browsing may deny access. */ }
const preferences = new LobbyPreferences(catalog.filter(game => game.available).map(game => game.id), preferenceStorage);
let diceFairness;
try { diceFairness = new Fairness.DemoProvider({storage: preferenceStorage}); } catch { /* Plain demo remains available where Web Crypto is unavailable. */ }
const session = {
  visited: false, activeGame: 'minesweeper', loadedGames: new Set(), rounds: [],
  get points() { return wallet.points; },
  get ledger() { return wallet.ledger; }
};
let page = 'games', filter = '全部';
let statusTimer;
const loadGuard = new GameLoadGuard({change(state, id) {
  const loading = document.getElementById('game-loading');
  loading.hidden = state === 'ready';
  loading.setAttribute('data-state', state);
  if (state === 'ready') frames[id].removeAttribute('inert');
  else frames[id].setAttribute('inert', '');
  document.getElementById('load-title').textContent = state === 'failed' ? '这次连接有点慢' : `正在前往${gameName(id)}`;
  document.getElementById('load-description').textContent = state === 'failed' ? '游戏尚未准备好，可以重试或返回大厅。重试只刷新画面，不会额外扣除积分。' : '正在准备画面与音效。你可以随时返回大厅。';
  document.getElementById('game-retry').hidden = state !== 'failed';
  if (state === 'ready') preferences.visit(id);
}});
const bridge = new GameBridge({
  engines: {minesweeper: MinesRound, rocket: RocketRound, dice: DiceRound, plinko: PlinkoRound, horse: HorseRound, slots: SlotsRound, matrix: MatrixRound, blocks: BlocksRound, '2048': FusionRound},
  frames, loadedGames: session.loadedGames, wallet, origin: location.origin,
  fairnessProviders: {dice: diceFairness},
  onFinish(result) {
    session.rounds.push({...result, time: wallet.clock()});
    if (!platform.hidden) render();
  },
  onReturn() { location.hash = 'games'; showPage('games'); },
  onUpdate() { if (!platform.hidden) render(); }
});

function render() {
  document.getElementById('header-points').textContent = formatPoints(wallet.points);
  content.innerHTML = renderPlatformPage({page, session, filter, preferences});
  window.LobbyShowcase?.mount(content);
}
function pauseFrames(activeGame) {
  for (const id of session.loadedGames) bridge.post(id, {type: 'platform-pause', paused: document.hidden || id !== activeGame});
}
function showPage(next) {
  loadGuard.leave();
  page = ['games', 'rewards', 'me'].includes(next) ? next : 'games';
  platform.hidden = false;
  surface.hidden = true;
  pauseFrames(null);
  document.querySelectorAll('.navigation button').forEach(button => {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}
function play(id = 'minesweeper') {
  if (!Object.hasOwn(frames, id) || !frames[id]) return;
  session.visited = true;
  session.activeGame = id;
  loadGuard.open(id);
  platform.hidden = true;
  window.LobbyShowcase?.suspend();
  surface.hidden = false;
  for (const [key, frame] of Object.entries(frames)) if (frame) frame.hidden = key !== id;
  pauseFrames(id);
  if (!session.loadedGames.has(id) || !loadGuard.readyGames.has(id)) {
    // A navigation attempt is not proof that the game actually initialized.
    // Re-entering a stalled frame retries presentation, keeping its round.
    loadFrame(id, session.loadedGames.has(id));
    session.loadedGames.add(id);
  } else bridge.sync(id, true);
  window.scrollTo(0, 0);
}
function loadFrame(id, retry = false) {
  const route = gameRoutes[id];
  frames[id].src = retry ? route + (route.includes('?') ? '&' : '?') + 'retry=' + Date.now() : route;
}
function retryGame() {
  if (surface.hidden || !Object.hasOwn(gameRoutes, session.activeGame)) return;
  const id = session.activeGame;
  loadGuard.open(id, true);
  // Reload presentation only: the parent keeps the same round and wallet.
  loadFrame(id, true);
}
function announce(message) {
  clearTimeout(statusTimer);
  document.getElementById('lobby-status').textContent = message;
  statusTimer = setTimeout(() => { document.getElementById('lobby-status').textContent = ''; }, 2200);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-favorite')) {
    const id = button.dataset.favorite;
    const saved = preferences.toggle(id);
    render();
    const target = [...document.querySelectorAll('[data-favorite]')].find(item => item.dataset.favorite === id && !item.closest('[inert]')) || document.querySelector('.filter[aria-pressed="true"]');
    target?.focus({preventScroll: true});
    announce(`${saved ? '已收藏' : '已取消收藏'}${gameName(id)}${preferences.persistent ? '' : ' · 本次页面有效'}`);
  }
  else if (button.hasAttribute('data-collection')) { filter = '收藏'; location.hash = 'games'; showPage('games'); }
  else if (button.id === 'game-retry') retryGame();
  else if (button.hasAttribute('data-play')) play(button.dataset.play || 'minesweeper');
  else if (button.dataset.page) { location.hash = button.dataset.page; showPage(button.dataset.page); }
  else if (lobbyFilters.includes(button.dataset.filter)) {
    const scroll = document.querySelector('.filters')?.scrollLeft || 0;
    filter = button.dataset.filter; render();
    document.querySelector('.filters').scrollLeft = scroll;
    document.querySelector('.filter[aria-pressed="true"]')?.focus({preventScroll: true});
  }
  else if (button.dataset.help) help(button.dataset.help);
});
for (const id of ['help-close', 'help-ok']) document.getElementById(id).onclick = () => document.getElementById('help').close();
window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));
window.addEventListener('message', event => {
  bridge.handle(event);
  if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
  const id = Object.keys(frames).find(key => frames[key]?.contentWindow === event.source);
  if (id && session.loadedGames.has(id) && event.data.type === `${bridge.definitions[id].prefix}-ready`) {
    loadGuard.ready(id);
    bridge.post(id, {type: 'platform-pause', paused: surface.hidden || session.activeGame !== id});
  }
});
document.addEventListener('visibilitychange', () => {
  const id = surface.hidden ? null : session.activeGame;
  pauseFrames(id);
  if (!document.hidden && id && loadGuard.readyGames.has(id)) bridge.sync(id, true);
});
setInterval(() => {
  if (!surface.hidden && !document.hidden && session.activeGame === 'minesweeper' && loadGuard.readyGames.has('minesweeper')) bridge.sync('minesweeper');
}, 1000);
setInterval(() => {
  const id = surface.hidden || document.hidden ? null : session.activeGame;
  bridge.pulse(id && loadGuard.readyGames.has(id) ? id : null);
}, 100);
showPage(location.hash.slice(1));

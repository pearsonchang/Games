'use strict';

const content = document.getElementById('content');
const platform = document.getElementById('platform');
const surface = document.getElementById('play-surface');
const frames = Object.fromEntries(Object.keys(gameRoutes).map(id => [id,
  document.getElementById(id === 'minesweeper' ? 'game-frame' : `${id}-frame`)
]));
const session = {visited: false, activeGame: 'minesweeper', loadedGames: new Set(), rounds: [], points: 0, ledger: []};
let page = 'games', filter = '全部';
const api = new PlatformAPI({
  onState(data) {
    const changed = session.points !== data.points || JSON.stringify(session.rounds) !== JSON.stringify(data.rounds) || session.ledger.length !== data.ledger.length;
    session.points = data.points; session.rounds = data.rounds; session.ledger = data.ledger;
    bridge.syncAll();
    if (changed && !platform.hidden) render();
  },
  onStatus(online, message) {
    document.getElementById('connection-status').hidden = online;
    document.getElementById('connection-note').textContent = message || '正在连接游戏服务…';
    if (!online) bridge.offline(message);
  }
});
const bridge = new GameBridge({api, frames, loadedGames: session.loadedGames, origin: location.origin, onReturn() { showPage('games'); }});

function render() {
  document.getElementById('header-points').textContent = api.online ? formatPoints(session.points) : '—';
  content.innerHTML = renderPlatformPage({page, session, filter});
}
function pauseFrames(activeGame) {
  for (const id of session.loadedGames) bridge.post(id, {type: 'platform-pause', paused: id !== activeGame});
}
function showPage(next) {
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
  platform.hidden = true;
  surface.hidden = false;
  for (const [key, frame] of Object.entries(frames)) if (frame) frame.hidden = key !== id;
  pauseFrames(id);
  if (!session.loadedGames.has(id)) {
    frames[id].src = gameRoutes[id];
    session.loadedGames.add(id);
  } else bridge.sync(id, true);
  window.scrollTo(0, 0);
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-play')) play(button.dataset.play || 'minesweeper');
  else if (button.dataset.page) { location.hash = button.dataset.page; showPage(button.dataset.page); }
  else if (button.dataset.filter) { filter = button.dataset.filter; render(); }
  else if (button.dataset.help) help(button.dataset.help);
});
for (const id of ['help-close', 'help-ok']) document.getElementById(id).onclick = () => document.getElementById('help').close();
function followRoute() {
  if (location.hash.startsWith('#play=')) play(location.hash.slice(6));
  else showPage(location.hash.slice(1));
}
window.addEventListener('hashchange', followRoute);
window.addEventListener('message', event => bridge.handle(event));
document.getElementById('connection-retry').onclick = () => api.connect().catch(() => {});
let lastPoll = 0;
setInterval(() => {
  if (api.pending) return;
  const states = Object.values(api.games).map(game => game.state);
  const moving = states.some(state => ['flying', 'racing', 'rolling', 'dropping'].includes(state));
  const interval = document.hidden ? 5000 : moving ? 500 : states.includes('playing') ? 1000 : 5000;
  if (Date.now() - lastPoll < interval) return;
  lastPoll = Date.now();
  api.refresh().catch(() => {});
}, 500);
followRoute();
api.connect().catch(() => {});

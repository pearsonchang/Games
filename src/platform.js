'use strict';

const content = document.getElementById('content');
const platform = document.getElementById('platform');
const surface = document.getElementById('play-surface');
const frames = Object.fromEntries(Object.keys(gameRoutes).map(id => [id,
  document.getElementById(id === 'minesweeper' ? 'game-frame' : `${id}-frame`)
]));
const wallet = new PointsWallet();
const session = {
  visited: false, activeGame: 'minesweeper', loadedGames: new Set(), rounds: [],
  get points() { return wallet.points; },
  get ledger() { return wallet.ledger; }
};
let page = 'games', filter = '全部';
const bridge = new GameBridge({
  engines: {minesweeper: MinesRound, rocket: RocketRound, dice: DiceRound, plinko: PlinkoRound, horse: HorseRound},
  frames, loadedGames: session.loadedGames, wallet, origin: location.origin,
  onFinish(result) {
    session.rounds.push({...result, time: wallet.clock()});
    if (!platform.hidden) render();
  },
  onReturn() { showPage('games'); },
  onUpdate() { if (!platform.hidden) render(); }
});

function render() {
  document.getElementById('header-points').textContent = formatPoints(wallet.points);
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
window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));
window.addEventListener('message', event => bridge.handle(event));
setInterval(() => {
  if (!surface.hidden && session.activeGame === 'minesweeper') bridge.sync('minesweeper');
}, 1000);
setInterval(() => {
  for (const id of ['rocket', 'dice', 'plinko', 'horse']) bridge.sync(id);
}, 100);
showPage(location.hash.slice(1));

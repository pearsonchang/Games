/* Shared viewport measurements only; game state and pointer movement stay local. */
(() => {
  'use strict';
  const root = document.documentElement;
  const body = document.body;
  const game = body.dataset.mobileGame || (body.classList.contains('world-blocks') ? 'blocks' : body.classList.contains('world-fusion') ? '2048' : '');
  root.dataset.uiSurface = game ? 'game' : 'lobby';
  root.dataset.uiEmbedded = String(parent !== window);
  const header = document.querySelector(game ? 'header' : '#platform .topbar');
  const dock = document.querySelector({mines: '.bottom', rocket: '.controls', dice: '.action-bar', plinko: '.launch-dock', horse: '.launch-panel', slots: '.action-panel', matrix: '.action-panel'}[game] || '#platform .navigation');
  const mineContent = game === 'mines' ? document.querySelector('.mobile-mine-content') : null;
  const values = new Map();
  let scheduled = 0;
  function variable(name, value) {
    const next = Math.max(0, Math.round(value * 100) / 100) + 'px';
    if (values.get(name) === next) return;
    values.set(name, next);
    root.style.setProperty(name, next);
  }
  function measure() {
    scheduled = 0;
    const viewport = window.visualViewport;
    const height = viewport && viewport.scale === 1 ? Math.min(innerHeight, viewport.height) : innerHeight;
    variable('--ui-viewport-height', height);
    variable('--ui-header-height', header?.getBoundingClientRect().height || 0);
    const fixed = dock && !dock.hidden && getComputedStyle(dock).position === 'fixed';
    const dockHeight = fixed ? dock.getBoundingClientRect().height : 0;
    const bottom = fixed ? parseFloat(getComputedStyle(dock).bottom) || 0 : 0;
    variable('--ui-dock-height', dockHeight);
    variable('--ui-dock-space', dockHeight ? dockHeight + bottom + 16 : 0);
    root.classList.toggle('ui-fixed-dock', !!dockHeight);
    if (mineContent && innerWidth <= 740 && mineContent.clientHeight) {
      const shell = document.querySelector('.board-shell');
      const style = getComputedStyle(mineContent);
      const start = shell.getBoundingClientRect().top - mineContent.getBoundingClientRect().top + mineContent.scrollTop;
      const available = mineContent.clientHeight - start - (parseFloat(style.paddingBottom) || 0);
      // Keep all nine rows visible when possible; very short windows scroll at 36px.
      variable('--ui-mine-cell-size', Math.max(36, Math.min(44, Math.floor((available - 52) / 9))));
    }
  }
  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(measure);
  }
  if (header && game && !['blocks', '2048'].includes(game)) header.classList.add('ui-game-header');
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  if (header) observer?.observe(header);
  if (dock) observer?.observe(dock);
  if (mineContent) {
    observer?.observe(mineContent);
    for (const node of document.querySelectorAll('#stats,.board-caption,.mobile-board-toolbar')) observer?.observe(node);
  }
  window.addEventListener('resize', schedule, {passive: true});
  window.visualViewport?.addEventListener('resize', schedule, {passive: true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  // i18n and mobile controls mount during DOMContentLoaded.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once: true});
  measure();
})();

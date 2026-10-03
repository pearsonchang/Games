'use strict';
// Independent URLs may show a game, but can never create a local points wallet.
if (window.parent === window) {
  const game = document.currentScript.dataset.game;
  location.replace('./#play=' + encodeURIComponent(game));
}

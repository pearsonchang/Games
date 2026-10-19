# Responsive UI validation

PLAYROOM uses the same web UI in the browser and in the iOS/Android Capacitor apps. Layout must respond to available CSS width, height and safe areas rather than a phone model name. Portrait phones, short landscape windows and tablets require different arrangements of the same controls.

## Shared layout contract

`src/adaptive-ui.css` and the deferred `src/adaptive-ui.js` provide the common outer layout. Shared and game-specific responsive styles follow the page's base styles, while `i18n.css` stays last so English typography and wrapping rules retain their intended priority. The script measures the current header, available viewport and any fixed action dock. It uses resize/visibility observations rather than measuring every pointer movement.

- `--ui-safe-top`, `--ui-safe-right`, `--ui-safe-bottom`, `--ui-safe-left`: system safe areas. The lobby applies them around an embedded game; the child frame resets its own insets to avoid double padding.
- `--ui-viewport-height`: available visual viewport height, updated after a resize.
- `--ui-header-height`: measured header height, including a wrapped balance row.
- `--ui-dock-space`: measured space required by a fixed action panel. In-flow panels do not add a second reservation.
- `--ui-page-gutter`: shared content padding that grows with the viewport.

Compact layout applies to portrait phones and short landscape windows. Important amounts remain readable and can get a separate row; decorative elements can shrink or disappear first. Short screens can scroll instead of reducing interactive targets below their minimum size. A game-specific rule may arrange its board or scene, but it should use these shared measurements and keep every action reachable.

## Repeatable browser checks

Run the UI checker separately from the engine tests:

```sh
npm run check:responsive
npm run check:responsive -- --all
npm run check:responsive -- --games=dice,matrix --viewports=small,phone,tablet --lang=en
npm run check:responsive -- --games=games,rewards,me --text-scale=1.25
```

The default quick run covers 320 × 568, 402 × 874 and 844 × 390 CSS pixels. The complete run additionally covers 360 × 800, 390 × 844, 430 × 932, 768 × 1024 and 820 × 1180. Every run uses Chinese and English unless `--lang=zh` or `--lang=en` selects one language.

The checker starts an ephemeral local server through the existing preview handler and tests `src/` by default. Use `--source=dist` after building to inspect the packaged web output. Screenshots and `report.json` go into a newly created temporary directory, printed at completion. Select a destination with `--output=/absolute/path/to/qa`; generated reports and screenshots should not be committed.

The script loads a normal local `playwright` dependency. If the development environment supplies Playwright elsewhere, set `PLAYROOM_PLAYWRIGHT_PATH` to its module directory. It first uses an installed Chrome or Edge browser, then falls back to Playwright Chromium. Override the executable with `PLAYROOM_BROWSER_PATH` or `--browser=/path/to/browser`.

```sh
PLAYROOM_PLAYWRIGHT_PATH=/path/to/node_modules/playwright \
PLAYROOM_BROWSER_PATH=/path/to/chrome \
node scripts/check-responsive.cjs --all --output=/tmp/playroom-ui-qa
```

Use `node scripts/check-responsive.cjs --help` for all page and viewport names. Two isolated contexts run concurrently by default; use `--jobs=1` on a resource-limited machine. A failure sets a nonzero exit code, while the JSON report retains the other page results. Individual case JSON files are saved as each case finishes.

## What is checked

Each page uses a fresh browser context with isolated storage. The checker visits the games, history and profile lobby pages and all nine standalone game documents. It checks:

- No horizontal document overflow.
- Numeric balance, payout, score and reward text remains inside the viewport and relevant containing panels, including clipping ancestors.
- Header balance, brand and settings controls do not overlap.
- Main action controls can be reached after scrolling and are not covered by another element.
- Static secondary action groups remain inside the viewport; intentional horizontally scrolling carousels are excluded.
- Mapped settings/rules dialogs can open, and their close control remains reachable.
- No uncaught page errors.

Each page is checked in its initial layout and with a large balance (`9,999,999.99`) and applicable large payout (`5,000`). Dice and both slots also use their existing result renderers to show a winning and losing result, including the maximum dice/three-reel reward and a 15-badge matrix result. These are presentation fixtures. They never write to a wallet, persistent storage or backend. Recurring display timers stop after the initial render so amount fixtures stay stable. External network requests are blocked for the audit. Rocket and Plinko normally receive state from the lobby; their standalone checks receive only an idle public snapshot for layout measurement.

`--text-scale=1.25` scales the computed text sizes once, including controls with fixed font sizes. This is a layout stress approximation; actual operating-system text settings still require device checks.

The ordinary `npm test` command imports only the checker configuration for argument validation. It does not load Playwright, launch a browser or require a browser dependency.

## Native acceptance remains necessary

A passing browser report does not establish that a particular iOS or Android WebView draws correctly. Before a mobile release, rebuild/sync the latest web assets and check at least one iOS and one Android simulator, then one real device per platform when available.

For each native platform, check the following with both languages:

1. Status bar, camera cutout and bottom gesture area, including Android three-button navigation.
2. A small phone, a tall phone, landscape and a tablet; resize/rotate without restarting the current game.
3. Default and enlarged system text; large fractional balances and highest advertised payouts.
4. Game idle, active, win, loss and open-dialog states. Sticky/fixed action areas must not hide the last board row or result text.
5. Touch dragging, swiping, repeated taps, returning from the background and switching among Games, History and Profile.
6. The balance and saved round remain intact after a normal app update or restart.

Record the asset version, OS/WebView version, viewport, screenshots and observed result. Keep screenshots and generated reports outside source control. Engine/probability checks and input performance measurements remain separate from layout acceptance.

## Current verification baseline

The 2026-10-19 adaptation uses web assets `44001c44aeebeee6` and mobile assets `1d8d9c76d3f83828`. All 237 ordinary tests and the static resource checks pass. Browser checks covered all 12 pages across eight sizes and both languages; after restoring the required final `i18n.css` ordering, all 96 English cases, 24 narrow/landscape Chinese follow-ups and 18 enlarged-English cases passed. An additional 36 embedded-game checks covered nine games with phone, landscape and tablet safe-area reservations, including reaching the final Coin Sweeper row.

Both native simulator builds succeed. Android's activity supports resizing and follows system orientation; iPhone supports portrait and both landscape directions, and iPad retains all four orientations. On the existing Android 17/API 37 emulator, the lobby's three tabs and Coin Sweeper, Triple Dice and Orbit Matrix were checked at a 411 × 839 game viewport. A real rotation to an 863 × 358 dice viewport retained the balance and reachable action control; returning to portrait and the lobby retained the same balance. The original system rotation settings were restored.

The iOS simulator build contains these assets and orientation settings, but no new iOS simulator visual run or physical-device acceptance was performed in this pass. The native acceptance checklist above remains necessary for additional models and system font settings.

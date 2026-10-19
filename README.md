# PLAYROOM

A mini-game demo for the web, Android and iOS, with nine games, a shared demo-points wallet, sound and visual effects, and a standalone dice-receipt verifier. Built with HTML, CSS and JavaScript; no dependency installation is required to build the website. The optional Capacitor mobile projects have their own pinned dependencies.

## Permitted use

> **This software is intended solely for personal entertainment and software development practice. Commercial use and any unlawful use are prohibited.**

Points, multipliers and rewards demonstrate interaction design, probability algorithms and software development. They are not real money or redeemable assets. This project does not provide real-money deposits, withdrawals or trading, and must not be used for real-money gambling or other unlawful activities.

These restrictions apply to original project content. Third-party code and assets remain subject to their respective licenses; retain their copyright and license notices. For example, the bundled ethers license is available in [ethers-LICENSE.md](src/vendor/ethers-LICENSE.md).

## Games and features

| Game | Route | Gameplay |
| --- | --- | --- |
| Coin Sweeper | `/minesweeper.html` | Reveal tiles and choose when to collect; hitting a mine clears the round's uncollected reward |
| Rocket Run | `/rocket.html` | Rewards grow during flight; collect before the rocket crashes |
| Triple Dice | `/dice.html` | Choose Big / Small, an exact total or triples; results use the dice's top faces |
| Lightning Plinko | `/plinko.html` | Choose a drop entrance and watch the ball bounce into a reward pocket |
| Star Derby | `/horse.html` | Pick a horse, watch the race and receive points based on its finishing position |
| Cosmic Slots | `/slots.html` | Classic three-reel symbols, a payout guide and tiered audiovisual feedback |
| Orbit Matrix | `/matrix.html` | Five reels, three rows, ten paylines, wilds and bonus-symbol rewards |
| Block Flow | `/blocks.html` | An 8×8 board, a 30-placement challenge, row and column clears, and combos |
| Cosmic 2048 | `/2048.html` | Swipe to merge numbers; the spawn pool evolves with progress and rewards use the highest tile |

The default homepage is the A1 Neon Arcade lobby, with a game showcase carousel, categories, favorites, recently played games and exploration history. All nine games are accessible from the lobby. Mobile layouts include safe-area support, larger controls, and rules and settings panels. Block Flow supports dragging, tap-to-place and keyboard controls; Cosmic 2048 supports swipes, arrow keys and optional direction buttons. Sound can be muted, and animations respect the system's reduced-motion preference.

The regular lobby requires no account or blockchain wallet. Entry costs and payouts use demo points. In the **website**, the wallet is shared within the current lobby page session and resets on refresh. Favorites, recent games, some best scores and verification receipts can be saved locally. Standalone game pages have their own demo state, separate from the lobby session.

In the **native mobile app**, the lobby saves its wallet, active rounds, bounded history and preferences through Capacitor Preferences. Reopening restores this device's session; timed rounds still advance according to elapsed real time. A failed or unreadable save is reported, and an unreadable existing save is preserved while temporary play remains available. Uninstalling the app removes the save. Browser progress is not automatically imported, and there is no account or cross-device synchronization.

Block Flow and Cosmic 2048 have capped rewards, but their demo parameters have not been calibrated against player-skill distributions. They do not imply a fixed return rate or guarantee negative long-term returns for skilled players.

## Interface languages

Use the globe control at the top of a page to switch between **Chinese and English (EN)**; on the mobile Coinsweeper screen, the language control is in Settings. Chinese is the default. The selected preference is saved locally, and the lobby, embedded games and same-origin previews synchronize without reloading, restarting a round or changing points. Switching still works within the current page and its embedded games when browser storage is unavailable. Use `?lang=en` or `?lang=zh-CN` to choose the language when opening a page.

English covers the lobby, all nine games, rules and rewards, dynamic results, accessibility labels and standalone verification pages. Mobile layouts accommodate longer English text, and the document's `lang` attribute updates with the selection. Imported JSON, rules hashes, blockchain addresses and raw verification receipts remain unchanged.

Translations live in `src/i18n-en-*.js`; shared terminology belongs in `i18n-en-common.js`. Add an English translation whenever introducing interface copy, and use whole-message matching for sentences with variables. `i18n.js` updates only text and descriptive attributes, not animation styles or game state. Chinese mode does not observe DOM mutations. English mode handles changed text incrementally rather than scanning the page on every drag or animation frame.

## Run locally

Requires **Node.js 22 or later**. From the repository root:

```sh
npm run build
npm run preview
```

Open <http://127.0.0.1:8765/>. Source files are in `src/`; generated files are in `dist/`. Rebuild and refresh after editing the source.

```sh
npm run check                       # Check syntax, resource references and entrypoints
npm test                            # Run frontend logic and regression tests
npm run build                       # Validate, test and generate dist
npm run preview -- --source          # Optional: preview src directly
node scripts/verify-receipt.cjs /path/to/playroom-dice-receipt.json
```

- No preliminary `npm install` is needed. A pinned local copy of ethers is loaded only by the standalone testnet pages.
- The preview server listens only on `127.0.0.1`, using port `8765` by default. Set `PLAYROOM_PREVIEW_PORT` to choose another port.
- Use an HTTP preview rather than opening HTML through `file://`; lobby-to-game communication relies on same-origin pages.
- Preview responses disable caching, and builds add resource version identifiers to reduce stale-page and asset mismatches.
- The build replaces `dist/` only after validation and tests pass. A failed build preserves the last working output. Do not edit or commit `dist/` directly.

Static checks cover 18 entrypoints, JavaScript syntax and local resource references. They do not replace browser interaction testing. Automated tests cover probability and settlement, wallet deduplication, iframe message isolation, block placement and drag boundaries, 2048 input, mobile presentation logic, the lobby carousel, language switching and synchronization, verification receipts, and build and preview behavior. Native integration tests also cover session restoration for all nine engines, interrupted dice preparation, background settlement, preferences, save failures and back-button handling.

## Responsive interface

The lobby and all nine games adapt to available window width, height and safe areas. A shared layout layer measures headers and fixed action panels; short screens can scroll, and supported landscape/tablet layouts put controls alongside the game. Embedded games consume the safe area already reserved by the outer app. Game rules, probabilities and rewards are independent of these layout changes.

Run `npm run check:responsive -- --all` for the explicit browser layout audit, covering eight window sizes in Chinese and English. The checker needs Playwright and a browser; it is separate from the dependency-free website build. See [Responsive UI validation](docs/responsive-ui.md) for setup, enlarged-text checks, screenshots and native-device acceptance.

## Android and iOS

The Capacitor 8 projects in `mobile/` bundle the game files inside the app. They do not load the Vercel website or a development-server URL at startup. The website and native app share game logic and translations; native capabilities are loaded only by the mobile lobby.

```sh
# Node.js 22+ and pnpm 11.25.0; install pnpm/Corepack first if unavailable.
corepack pnpm --dir mobile install --frozen-lockfile
npm run mobile:doctor          # Report installed native build tools
npm run mobile:sync            # Test, build, bundle and sync both projects
npm run mobile:android         # Open Android Studio
npm run mobile:ios             # Open Xcode on macOS
```

Native behavior includes safe-area-aware layouts, device-local saves, Android back navigation, background presentation pausing, external HTTPS links and optional haptic feedback. The app continues to use local demo points; no blockchain transaction or backend connection is required for ordinary games.

**Build status (2026-10-19):** All 237 automated tests and static resource checks pass. The shared responsive layout covers narrow phones, short landscape windows, tablets, large fractional balances and Chinese/English text. Browser checks include all nine games and the three lobby pages, enlarged text and embedded safe-area reservations; see [Responsive UI validation](docs/responsive-ui.md) for the exact verification scope.

Android and iOS simulator builds succeed. The Android debug APK at `mobile/android/app/build/outputs/apk/debug/app-debug.apk` has been updated on an ARM64 Android 17/API 37 emulator. The lobby tabs, Coinsweeper, Triple Dice and Orbit Matrix were checked; a real rotation preserved the balance and usable dice controls. iPhone supports portrait and both landscape directions, and iPad supports all four orientations. The iOS simulator build is `mobile/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`; this latest adaptation was compiled but has not received a new iOS simulator visual run. Physical-device testing, release signing and store distribution remain outstanding. No release Android APK/AAB or signed iOS IPA is included.

See [Mobile app setup](docs/mobile-app.md) for requirements, installable-build steps, identifiers and device testing. Signing keys, SDK caches, generated web bundles and build outputs are excluded from Git.

## Backend and database integration

`src/data-client.js` defines an asynchronous local-store adapter and a separate HTTP game repository. The mobile demo uses local storage; **the HTTP repository is not enabled in gameplay, and no database or API server is deployed**.

The API contract covers profiles, preferences, wallets, rounds and player actions. It reserves idempotency keys and round revisions for safe retries and concurrent requests. In a future online mode, the server must calculate outcomes and rewards and update the wallet in a database transaction. The client may submit player actions, but cannot authoritatively supply a balance, payout or random result. Mobile saves are never imported as trusted balances.

See [Backend API contract](docs/backend-api.md) for endpoints, request fields, suggested database entities and the remaining server integration. Database credentials and server secrets must stay on the backend. Connecting a URL alone does not turn this local demo into server-authoritative gameplay.

## Vercel configuration

The repository's `vercel.json` declares the static build settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | Repository root: `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | Skip installation; configured as an empty string |
| Environment variables | None required for the regular frontend demo |

Do not set Root Directory to `dist` or to the local workspace path `outputs/coinsweeper`; that workspace path is not a subdirectory of the GitHub repository.

Deploy the output built from `src/` into `dist/`. Keep the standalone game pages; do not add a catch-all SPA rewrite that sends every route to the homepage. The current configuration enables `cleanUrls`, including extensionless routes such as `/palettes`.

Automatic builds, the production branch and access settings depend on the connected Vercel project. A successful Git push does not establish that a deployment has finished. Check deployment status, the homepage, all nine game entries and asset loading separately.

## Dice verification and testnet status

### Local verification

The regular dice game includes a verification-receipt panel. At `/fairness.html`, users can load the last 30 locally saved rounds, import a single-round JSON file or paste a receipt. The verifier recalculates the rules hash, commitment, random derivation, three top-face values and reward. Files are processed locally and are not uploaded.

The local commitment and random seeds are still generated in the same browser. A successful verification establishes only internal consistency. **It does not prove that an operator did not select a result, and it is not an onchain fairness certification.** Other games continue to use their own frontend demo logic.

### Sepolia legacy recovery

`/fairness-setup.html` and `/fairness-testnet.html` are separate experimental pages and do not affect regular lobby play. They currently operate in **legacy recovery mode**:

- The web interface disables legacy deployment, consumer registration, free point claims and new rounds.
- Existing contracts can be loaded to check code and immutable parameters and inspect prior rounds. Once randomness has returned, a round can be recalculated and settled.
- A failed funding read does not block recovery of an existing round. Balances, reserve estimates and actual fees are shown separately; a nonzero balance alone does not indicate readiness for a new round.
- Settlement estimation and submission use the same fee parameters. If the wallet changes them, its final confirmation and the onchain receipt take precedence.
- The legacy contract cannot be upgraded or paused by changing the webpage, and it has no timeout-refund function. Disabling new rounds in the interface does not prevent direct external calls to the contract.

The legacy contract has been deployed to Sepolia, but the complete live VRF callback and settlement flow has not yet passed acceptance testing. Deployment success, local simulations and reserve estimates are not evidence of production safety, fairness certification or guaranteed fees. Regular demo points do not automatically become onchain points.

**This release contains the frontend and mobile app projects.** To verify the legacy contract, it includes the original DiceVRF ABI, bytecode and source-verification snapshot in `src/dice-vrf-deployment.js` and `src/dice-vrf-standard-input.json`, including the relevant upstream dependency sources. DiceVRFv2, contract-development tools, deployment records and cost experiments remain local and are not included in this frontend release. Frontend builds and tests do not depend on `contracts/`.

## Repository layout

```text
src/                         Pages, styles, game logic and assets
  platform-*.js              Game catalog, demo wallet, messaging and lobby views
  *-engine.js                Game state, randomness and point settlement
  blocks-input.js            Block dragging, boundaries and placement
  2048-input.js              Swipe and directional input
  lobby-showcase.*           Lobby game carousel
  mobile-games.*             Shared mobile presentation
  i18n.js / i18n.css          Language selection, synchronization and English layout
  i18n-en-*.js                English dictionaries grouped by interface area
  fairness-*.js              Local verification, legacy recovery and fee checks
  vendor/                    Pinned ethers bundle, license and provenance
scripts/                     Build, static checks, preview and receipt verification
tests/                       Automated frontend tests
mobile/                      Capacitor config, pinned dependencies and native projects
  android/                   Android Studio project
  ios/                       Xcode project with Swift Package Manager dependencies
  www/                       Generated mobile assets (not committed)
docs/                        Probability, backend API and mobile setup documentation
vercel.json                  Static build and routing configuration
```

The corresponding engines, rules files and tests define each game's rules and payouts. The Rocket Run probability derivation is documented separately in [rocket-probability.md](docs/rocket-probability.md).

## Current release scope

Updated: **2026-10-19**.

- Nine games in the default lobby, including Block Flow and Cosmic 2048.
- Updated lobby carousel, mobile controls, game scenery and dice layout.
- Chinese and English interfaces, saved language preferences, synchronized embedded games and English mobile layouts.
- Improved block dragging and boundary feedback, with input, settlement and loading regression tests.
- Local dice verification, legacy testnet recovery and fee checks.
- Android and iOS project scaffolds, bundled game assets, native lifecycle integration and device-local session restoration; the latest iOS Simulator build, reinstallation and lobby launch are verified on iPhone 17, with the nine-row Coinsweeper screenshot and full nine-game native interaction acceptance still pending.
- Backend repository interfaces and a documented server-authoritative API contract; no live backend or database is connected.
- Separate frontend and contract-experiment releases, with third-party notices and use restrictions retained.

This remains a personal entertainment and software development practice demo. Client-side round validation and deduplication help prevent accidental duplicate settlement; they cannot prevent users from modifying their own clients. The project does not provide a trusted server-side ledger or real-asset settlement.

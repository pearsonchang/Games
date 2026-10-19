# PLAYROOM mobile app handoff

PLAYROOM has Android and iOS project scaffolds that package the existing nine-game demo with Capacitor. The app loads bundled web assets and saves its demo session on the device. No backend, database, account service, payment service or cloud synchronization is connected. All points remain demo points with no real-world value.

## Current delivery status

Status recorded on **2026-10-19**.

The repository includes native projects, pinned dependencies, bundled-asset preparation, local session recovery, lifecycle handling, Android back-button handling, optional haptics, app icons and an iOS privacy manifest. Automated tests cover the storage adapters, session validation, restoration and native lifecycle logic with test doubles. These checks do not establish behavior on a physical phone.

The handoff machine now has Xcode **27.1** and iOS **27.1/27.0** simulator runtimes. A clean iOS Simulator build completed successfully, producing `mobile/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`. The updated app is installed on the **iPhone 17 simulator running iOS 27.0**; a `simctl` screenshot confirms the updated lobby displays normally and the existing save is retained.

The phone lobby now uses more compact header and showcase proportions, removes repeated copy, retains 44 px primary touch targets and reserves space above the bottom navigation. The adjustment applies only to the default festival layout at widths up to 650 px. Browser checks covered all nine showcase slides, game entry and return, categories, favorites and navigation without horizontal overflow; four cases were rechecked after finalizing stylesheet order. All 224 tests, mobile synchronization and the Xcode build passed. After reinstalling and launching on iPhone 17/iOS 27.0, the native screenshot confirms both first-row game cards are fully visible without bottom-navigation overlap, with the saved wallet retained.

The subsequent navigation and mobile-page layout fixes pass all **228 automated tests** and five browser cases; the rebuilt app has been reinstalled and launched with the lobby proportions and saved wallet confirmed by a native screenshot, and the user confirmed that switching Activity → Profile → Games on the iPhone 17 simulator no longer causes enlargement or misalignment.

Activity and Profile now share `account-pages.css`: Activity shows the current demo balance, exploration progress, nine game icons and five recent ledger entries; Profile shows up to three favorite thumbnails, three recent rounds and grouped help/settings with the native haptics control. Expandable sections retain access to the remaining stored history. This update passes all **234 automated tests**, five browser navigation cases and four additional cases covering empty/populated states, English, history and progress. Xcode reported `BUILD SUCCEEDED`, and the app was installed on iPhone 17/iOS 27.0. Native screenshots confirm normal proportions on both Chinese pages, including the balance, exploration cards, profile summary, empty favorites state and visible round records. The existing 1,237.12 demo-point balance is retained. Native scrolling through the lower settings and physical-device acceptance remain pending.

Triple Dice now has a compact phone layout with an in-flow action section. The dice stage, target selection, payout and roll button fit together in the initial 402 × 778 Chinese and English views, modeling the iPhone 17 content area after native insets. Narrower/shorter screens retain scrolling instead of covering controls with a fixed dock. Language and the local verification receipt move into Settings; they return to their original positions on desktop. Settings and target sheets keep the close control visible while their contents scroll. The game rules, probabilities, artwork renderer and payout calculations are unchanged.

This dice revision passes all **234 automated tests**, six browser cases from 320 to 1280 px, and an embedded native-style lobby case. Checks exercised all three modes, 5,000/1,500-point payout displays, continuous rounds, top-face totals, result wrapping, language/receipt dialogs and phone–desktop–phone relocation. The embedded check verified game entry, settlement, return and reopening without another charge. Web version `457e6c489111a343` and mobile version `ed12ce5656b7db2d` synchronize successfully, and the Xcode simulator build succeeds. The updated app was installed and launched on iPhone 17/iOS 27.0. A native screenshot after the user opened Triple Dice confirms the full idle arena, all three mode choices, selected target, payout and Roll button are visible together without clipping or safe-area overlap. Native rolling/result interaction and physical-device acceptance remain pending.

Star Derby now uses `horse-layout.css` for phones: a compact header, persistent four-horse selector, four visible lanes and an in-flow reward/start panel. The race phase sits beside selection, and lineup/live/final standings remain visible without shifting the track at countdown or launch. Language moves into Settings on phones; desktop controls return to their original positions when resized. Settings and rules keep their close control outside the scrolling body. Short screens scroll normally rather than covering the lanes or prizes with a fixed action dock. Race generation, selection locks, entry cost and payouts are unchanged.

The horse update passes all **234 automated tests**, six Chinese/English browser cases from 320 to 1280 px, and an embedded native-style case. The browser checks exercise all four horses and rank rewards, result wrapping, settings, language changes and phone–desktop–phone relocation. A real-time embedded race also verifies returning mid-race, settlement and reopening without another charge. Web version `9404b38267b2ccd6` and mobile version `401fb85b7b9bcbdd` synchronize successfully; the Xcode simulator build reports `BUILD SUCCEEDED`. The rebuilt app is installed and launched on iPhone 17/iOS 27.0. After the user opened Star Derby, a native screenshot confirms that all four lanes, the final standings, a restored third-place result (14 points credited, −36 net), all four reward amounts and the Race again button are fully visible together, clear of the native safe areas. The current 1,221.12-point saved balance is retained. A new native race and physical-device acceptance remain pending; the complete race interaction was verified in the embedded browser case.

Lucky Orbit and Orbit Matrix now share `slot-layout.css`. On phones, the action panel stays in the page flow so it cannot cover the payout, result details or symbols. Long header balances move onto their own row with all digits and decimals intact; language moves into Settings. Lucky Orbit separates the credited amount from the result description and confines celebration particles to the reels. Its oversized duplicate win amount is hidden. Matrix reward text, amounts and line controls wrap independently. Dialog headers and close controls remain outside the scrollable content. Entry costs, random generation and reward calculations are unchanged.

This slots update passes all **234 automated tests** and twelve Chinese/English browser cases from 320 to 1280 px. Checks cover a 9,876,542,210.12-point balance, misses, stake returns, a 5,000-point triple, combined badge/line rewards, active effects, reward examples, rules and phone–desktop–phone control relocation. Embedded native-style checks complete real-time rounds for both games and verify single charging/settlement, visible payouts/actions and preserved results after returning and reopening. Web version `37c3e72c09dd94d9` and mobile version `a8cb0d7ee3cb1042` synchronize successfully; the Xcode simulator build reports `BUILD SUCCEEDED`. The rebuilt app is installed and launched on iPhone 17/iOS 27.0. Native screenshots confirm Lucky Orbit shows a 1,071.12-point balance, a zero-payout/−50 result, entry cost and enabled spin button together without overlap. Orbit Matrix screenshots captured during the user’s spins confirm the balance, full board, status readout and disabled action button remain separate and clear of native safe areas. A settled Matrix native screenshot and physical-device acceptance remain pending; completed Matrix payouts, including combined rewards and large amounts, were verified in the browser cases.

Coinsweeper's compact mobile layout hides the repeated introduction, combines mode controls with flag/time indicators, and gives the board the remaining screen height above the separate cash-out row. Language and End round are in Settings. Regular phone cells retain a 44 px minimum; layouts up to 700 px high use a 36 px minimum and hide the repeated notice. Very short screens retain content scrolling instead of shrinking cells below that minimum.

Eight browser cases across six viewport sizes passed: 402 and 375 in both languages, 320 and 390 in English, 430 in Chinese, and 1280 in English. In a 402 × 874 viewport with 96 px reserved to model native insets, all nine rows fit without scrolling and cells measured about 47.16 px. The 390 × 844 case with 93 px reserved also fit all rows, with approximately 44.16 px cells; 375 × 667 fit with approximately 36.83 px cells. The 320 × 568 case retained 36 px cells and a scroll fallback. Checks covered last-cell flag/unflag, Settings and End round dialogs, and a 402 → 1280 → 402 resize with controls returning to their correct locations. No console errors were recorded, and all **224 automated tests** pass.

Earlier `simctl` screenshots verified the preceding Coinsweeper layout on iPhone 17 running iOS 27.0. The latest nine-row revision has now completed mobile synchronization with all 224 tests passing, and Xcode reported `BUILD SUCCEEDED`. It has been reinstalled and launched successfully on that simulator; the current screenshot shows the lobby. A native screenshot of the latest nine-row board remains pending because the game has not yet been opened in this verification run. Native game interaction and full acceptance across all nine games remain pending.

An earlier iPhone Duo attempt installed successfully, but simulator initialization reported “Data Migration Failed” in the `simctl bootstatus` log. Its captured screen showed only the Apple logo, not an error message.

Android Studio, the Android SDK and JBR 21 are now available. The first Android debug build completed with `BUILD SUCCESSFUL`, producing `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. It packages web version `37c3e72c09dd94d9` and mobile version `a8cb0d7ee3cb1042`, previously validated by all 234 automated tests. The running ARM64 emulator (`emulator-5554`, Android 17/API 37, 1080 × 2400) initially had no installed PLAYROOM package. Installation now succeeds, and Android reports a successful cold launch of `com.pearsonchang.playroom/.MainActivity`. A screenshot confirms the Chinese lobby and fresh 1,000-point demo balance render. A follow-up Android Coinsweeper investigation verified paid start, cell reveal and a user-completed cash-out. The user confirmed play had resumed. Captured input reached enabled cells with `paused: false` and `busy: false`; some events were delayed by roughly 300–500 ms, but the original non-response was not reproducible and its cause remains unconfirmed. Four targeted test files pass (14 reported tests), covering the mines engine, presentation and platform messaging. No gameplay code was changed during this investigation. Remaining Android games, save recovery, system-bar contrast, screen-size acceptance and physical-device testing remain pending.

Mobile dependencies, bundled assets and both native project directories are present. No release Android APK/AAB or signed iOS IPA has been produced. IPA export, release signing, physical-device testing and store submission remain outstanding. Rerun `mobile:doctor` on the machine that will build the app.

## Requirements

- Node.js 22 or newer and **pnpm 11.25.0**, as pinned in [mobile/package.json](../mobile/package.json). The Capacitor core, CLI, Android and iOS packages are pinned to **8.5.3**; plugin versions are separately pinned in the same file and lockfile.
- Android: Android Studio **2025.2.1 or newer**, its bundled JDK, Android SDK Platform **36**, SDK build tools and platform tools. Set `JAVA_HOME` to the JDK used by Android Studio when the shell cannot find Java, and `ANDROID_HOME` to the SDK directory. The project uses minimum SDK 24, compile/target SDK 36, Android Gradle Plugin 8.13.0 and Gradle 8.14.3.
- iOS: macOS, full **Xcode 26.0 or newer**, the Xcode command-line tools, and the appropriate simulator/device support. Command Line Tools alone cannot compile this project. The deployment target is iOS 15.0. This project uses Swift Package Manager; CocoaPods is not required.

The tool requirements follow the official [Capacitor 8 environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) and [Capacitor 8 migration guide](https://capacitorjs.com/docs/updating/8-0), checked for this handoff. Project-specific versions are in [Android variables](../mobile/android/variables.gradle) and the [iOS project](../mobile/ios/App/App.xcodeproj/project.pbxproj).

## Prepare and synchronize

Run these commands from the repository root. With Corepack available, use the pinned package-manager version explicitly:

```sh
node --version
corepack pnpm@11.25.0 --dir mobile install --frozen-lockfile
npm run mobile:doctor
npm run mobile:sync
```

If pnpm 11.25.0 is already installed directly, the equivalent dependency command is:

```sh
pnpm --dir mobile install --frozen-lockfile
```

Dependency installation and the first Gradle/Swift package resolution require network access. Do not replace the frozen lockfile with an unreviewed dependency upgrade while preparing a release.

| Command | What it actually does |
| --- | --- |
| `npm run mobile:doctor` | Reports Node, installed Capacitor CLI, bundled assets, project directories, Java, SDK-directory presence and Xcode availability. It does not compile or validate signing. |
| `npm run mobile:build` | Runs the web build and automated checks, prepares `mobile/www`, bundles the native bridge and validates the result. It does not compile either native project. |
| `npm run mobile:sync` | Performs `mobile:build`, then runs the installed Capacitor CLI to copy assets and synchronize native plugin dependencies. |
| `npm run mobile:android` | Opens the existing Android project in Android Studio. It does not rebuild or synchronize assets. |
| `npm run mobile:ios` | Opens the existing iOS project in Xcode. It does not rebuild or synchronize assets. |
| `npm run mobile:apk` | Checks for Java and an Android SDK, synchronizes the app, then invokes Gradle `assembleDebug`. |

The doctor only checks basic availability. A reported SDK directory does not prove that SDK Platform 36, every build tool or a working signing identity is installed.

Edit web source in `src/`, native bridge imports in [mobile/entry.js](../mobile/entry.js), and wrapper settings in [mobile/capacitor.config.json](../mobile/capacitor.config.json). Rerun `mobile:sync` after changes and before opening a project for a fresh build. Do not edit generated `mobile/www` or the native copies of bundled web files. After moving the project to another machine, install dependencies and sync again to regenerate local plugin paths used by Swift Package Manager.

The ordinary website build still goes to `dist/`. Native preparation creates a separate `mobile/www/native-bridge.js` and injects it into the parent lobby pages, not the game iframes. `mobile/www/mobile-manifest.json` records the web/mobile content versions and explicitly records `mode: "local-demo"` and `backendConnected: false`. There is no remote `server.url`; the app does not require the Vercel site to load its games.

## Android build and installation

1. Install the required Android tools and accept their setup/license prompts. Check `npm run mobile:doctor`, then run `npm run mobile:sync`.
2. Run `npm run mobile:android`. Let Android Studio finish Gradle synchronization. Select an emulator or connected device with USB debugging enabled and run the `app` configuration.
3. For a debug APK from the command line, run `npm run mobile:apk`. After a successful build, the output is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. The handoff machine has produced and installed this debug APK on an Android 17 emulator.
4. For distribution, configure the final application ID, version and release signing in Android Studio, then produce a signed release artifact. The debug APK command does not produce a signed store release or upload anything to Google Play.

The current Android manifest requests Internet access for optional external pages and future integrations. It disables cleartext traffic and app backup. The activity follows system orientation and supports resizing. Portrait/landscape layouts share the same saved game state; large-screen and newer Android behavior still needs device validation.

## iOS build and installation

1. Install full Xcode and select its developer directory. Run Xcode once to finish setup, then run `npm run mobile:doctor` and `npm run mobile:sync`.
2. Run `npm run mobile:ios`, or open `mobile/ios/App/App.xcodeproj`. Allow Swift packages to resolve.
3. For a simulator, select the `App` scheme and an installed iOS simulator as the run destination, then run. Simulator builds and runs require no signing team or Apple developer account.
4. For a physical device, configure an appropriate signing team, bundle identifier and provisioning in Xcode, then select the connected device and complete its development setup before running. Device installation requires signing configuration; the simulator workflow does not establish that configuration.
5. When physical-device acceptance is complete, use Xcode's Archive workflow to create and validate a distribution build. No signing team, distribution certificate, provisioning profile or App Store upload is supplied by this repository.

The iPhone configuration supports portrait and both landscape directions; the iPad configuration also supports upside-down portrait. The included [PrivacyInfo.xcprivacy](../mobile/ios/App/App/PrivacyInfo.xcprivacy) declares the UserDefaults access used by local preferences and is referenced by the Xcode resource build phase. Validate the final archive and its privacy declarations after adding any SDKs or backend services.

## App identity and release ownership

**`com.pearsonchang.playroom` is a provisional identifier**, not evidence of registration or ownership. Choose an identifier owned by the release publisher before distribution. Keep the Capacitor `appId`, Android namespace/application ID and Java package, and iOS bundle identifier consistent. Changing `appId` in the JSON configuration and running `cap sync` does not rename an already-created native project.

The current release numbers are `0.1.0` / build `1`. Android declares them in [app/build.gradle](../mobile/android/app/build.gradle); iOS declares them in [project.pbxproj](../mobile/ios/App/App.xcodeproj/project.pbxproj). Update the native release numbers when preparing subsequent uploads. Changing an installed app's application/bundle ID creates a different app identity and does not migrate the existing local save automatically.

## Local saves and browser behavior

| Environment | Session behavior |
| --- | --- |
| Ordinary browser website | Refreshing starts a new demo wallet and new active rounds. Existing browser preferences such as language, favorites and game bests may persist through browser storage. |
| Native lobby | Saves a versioned local checkpoint and restores the wallet, ledger, supported round state and result history when reopened. Language, haptics, favorites, recent/explored games and selected Block Flow/2048 settings are included. |
| Standalone game pages | Keep their standalone behavior; the native lobby's shared wallet/session checkpoint is the integrated app boundary. |

The native checkpoint uses Capacitor Preferences under the key `playroom.mobile-session.v1`. It is local application data, not an encrypted vault or a server database. Clearing application data or uninstalling the app removes the usable local save; there is no cloud restore or cross-device transfer service. Keep a stable app identity when testing an update that should retain data.

Saving is asynchronous and event-driven. Writes are ordered, and lifecycle/navigation handlers request a flush. Sudden process termination can still lose changes that have not finished saving. Backgrounding pauses presentation, sound and haptics; elapsed-time games reconcile their deadlines when resumed or restored, so backgrounding is not a promise to freeze a timed round.

An unreadable or invalid checkpoint is retained and the app shows a temporary-session notice instead of overwriting it. Ordinary write failures show a save warning and a retry action when retry is safe. A timed-out native write may still complete later; the session stops issuing further writes after such a timeout to avoid an old write overwriting newer state. Do not treat a successful game action as proof that its checkpoint has reached storage. Device tests must exercise both recovery and these visible failure states.

Android Back is intended to close an open dialog first, return from a game to the lobby next, and minimize from the lobby after a save attempt. External HTTPS links use the native browser plugin. Local links that would normally open a new tab request a checkpoint before navigating inside the wrapper.

## Backend integration boundary

The [backend API contract](backend-api.md) describes the injectable repository interface, HTTP endpoints, authentication, idempotency, revision conflicts and suggested database entities. [data-client.js](../src/data-client.js) supplies the local storage adapter and an optional HTTP adapter; including that file does not activate a backend.

A future remote mode must be selected explicitly and must keep server-authoritative wallet/round state separate from this demo checkpoint. The server calculates balances, rewards and random results. Never upload the local wallet as a trusted balance, put a database credential in the app, or issue local rewards after a remote request fails. Authentication, server deployment, database migrations and a deliberate local-to-remote transition are separate implementation work.

## Physical-device acceptance checklist

Run this checklist on both Android and iOS before distributing a build. Record device model, OS version, app version and the mobile manifest version with results. The items below are pending device verification.

- [ ] Fresh installation opens the bundled lobby, begins with 1,000 demo points and shows all nine games. Relaunch after a completed save restores the same wallet and history instead of granting another initial balance.
- [ ] Play every game in Chinese and English. Switch language during an active round; board state, stake and timer continue. Check rule dialogs, result dialogs, accessibility labels and narrow-screen layouts.
- [ ] Test touch, drag and swipe controls in every game, including scrolling near a board. Test safe areas, system bars, keyboard appearance, phone portrait and supported tablet layouts.
- [ ] Start a round, make progress, leave for the lobby and reopen it. Relaunch after saving and confirm the same board/round and ledger. Repeat with several different game rounds active in the same session.
- [ ] Background a timed round past its deadline, then resume. Repeat after terminating and reopening the app. Settlement must occur once, including for a game whose iframe is not currently open; wallet totals and result history must agree.
- [ ] Interrupt start/result animations and rapidly tap controls or Back. Confirm there are no duplicate charges, rewards or result records. Verify insufficient-balance handling and prepared-round recovery.
- [ ] Change language, favorites, haptics and supported game settings, then relaunch. Turn haptics off; verify the setting persists. Confirm audio, animation work and haptics stop appropriately in the background and resume correctly.
- [ ] On Android, Back closes the current dialog before leaving a game, returns to the lobby before minimizing, and does not reopen hidden game dialogs. Verify repeated Back presses do not create duplicate navigation or lose an acknowledged save.
- [ ] In airplane mode, cold-launch and play bundled demo games. External verification/testnet links may need a connection; their failure must not alter the local wallet. Check external browser return and local verification-page navigation.
- [ ] Exercise corrupt/unsupported save data and storage read/write failures in a development build. Confirm a clear notice, retention of the old checkpoint and no silent claim of successful persistence. Test retryable failure and timeout behavior separately.
- [ ] Update an installed build with the same identity and verify compatible saves survive. Test cleared application data/reinstallation as a fresh session. Check that an immediate forced termination can never duplicate settlement after recovery.
- [ ] Review final icons, launch screen, release numbers, signing, archive contents and privacy declarations. Install the actual release build and repeat essential gameplay and recovery tests before store submission.

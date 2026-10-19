#!/usr/bin/env node
'use strict';

// Browser layout checks run explicitly, never as a side effect of node --test.
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createPreviewHandler} = require('./preview.cjs');

const ROOT = path.resolve(__dirname, '..');
const VIEWPORTS = Object.freeze({
  small: {width: 320, height: 568},
  compact: {width: 360, height: 800},
  phone: {width: 390, height: 844},
  iphone: {width: 402, height: 874},
  large: {width: 430, height: 932},
  landscape: {width: 844, height: 390},
  tablet: {width: 768, height: 1024},
  tabletLarge: {width: 820, height: 1180}
});
const PAGES = Object.freeze({
  games: {url: 'index.html#games', ready: '#content .game-open', action: '.game-open', lobby: true},
  rewards: {url: 'index.html#rewards', ready: '#content', action: '.navigation [data-page="games"]', lobby: true},
  me: {url: 'index.html#me', ready: '#content', action: '.navigation [data-page="games"]', lobby: true},
  minesweeper: {url: 'minesweeper.html', ready: '#board [data-i]', action: '#primary', settings: '.mobile-settings-open,#menu', close: '.mobile-sheet-close,#dismiss'},
  rocket: {url: 'rocket.html', ready: '#action', action: '#action', settings: '.mobile-settings-open,#rules', close: '.mobile-sheet-close,.mobile-native-close,#dialog-actions button'},
  dice: {url: 'dice.html', ready: '#roll:not([disabled])', action: '#roll', settings: '.mobile-settings-open', close: '.mobile-sheet-close'},
  plinko: {url: 'plinko.html', ready: '#slots .slot', action: '#launch', settings: '.mobile-settings-open', close: '.mobile-sheet-close'},
  horse: {url: 'horse.html', ready: '#start:not([disabled])', action: '#start', settings: '.mobile-settings-open', close: '.mobile-sheet-close'},
  slots: {url: 'slots.html', ready: '#spin:not([disabled])', action: '#spin', settings: '#examples-open', close: '#fx-close'},
  matrix: {url: 'matrix.html', ready: '#spin:not([disabled])', action: '#spin', settings: '#rules-open', close: '#rules-close'},
  blocks: {url: 'blocks.html', ready: '#start:not([disabled])', action: '#round-open', settings: '#menu-open', close: '[data-close]'},
  '2048': {url: '2048.html', ready: '#start:not([disabled])', action: '#round-open', settings: '#menu-open', close: '[data-close]'}
});

function parseArguments(argv) {
  const options = {all: false, games: Object.keys(PAGES), viewports: null, languages: ['zh-CN', 'en'], output: null, source: 'src', browser: process.env.PLAYROOM_BROWSER_PATH || null, textScale: 1, jobs: 2};
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    if (argument === '--all') { options.all = true; continue; }
    if (argument === '--quick') { options.all = false; continue; }
    const equals = argument.indexOf('=');
    if (equals < 0) throw Error(`Unknown option ${argument}; use --help.`);
    const key = argument.slice(0, equals), value = argument.slice(equals + 1);
    if (!value) throw Error(`${key} requires a value.`);
    if (key === '--games') options.games = value.split(',');
    else if (key === '--viewports') options.viewports = value.split(',');
    else if (key === '--lang') options.languages = value.split(',').map(lang => lang === 'zh' ? 'zh-CN' : lang);
    else if (key === '--output') options.output = path.resolve(value);
    else if (key === '--source') options.source = value;
    else if (key === '--browser') options.browser = value;
    else if (key === '--text-scale') options.textScale = Number(value);
    else if (key === '--jobs') options.jobs = Number(value);
    else throw Error(`Unknown option ${key}; use --help.`);
  }
  options.viewports ||= options.all ? Object.keys(VIEWPORTS) : ['small', 'iphone', 'landscape'];
  for (const game of options.games) if (!PAGES[game]) throw Error(`Unknown page ${game}. Available: ${Object.keys(PAGES).join(', ')}`);
  for (const viewport of options.viewports) if (!VIEWPORTS[viewport]) throw Error(`Unknown viewport ${viewport}. Available: ${Object.keys(VIEWPORTS).join(', ')}`);
  for (const language of options.languages) if (!['zh-CN', 'en'].includes(language)) throw Error(`Unsupported language ${language}. Use zh or en.`);
  if (!['src', 'dist'].includes(options.source)) throw Error('--source must be src or dist.');
  if (!(options.textScale >= 1 && options.textScale <= 2)) throw Error('--text-scale must be between 1 and 2.');
  if (!Number.isInteger(options.jobs) || options.jobs < 1 || options.jobs > 4) throw Error('--jobs must be an integer between 1 and 4.');
  return options;
}

function loadPlaywright() {
  try { return require(process.env.PLAYROOM_PLAYWRIGHT_PATH || 'playwright'); }
  catch (error) { throw Error('Playwright is unavailable. Install it locally or set PLAYROOM_PLAYWRIGHT_PATH to its module directory.', {cause: error}); }
}

async function findBrowser(explicit) {
  if (explicit) { await fs.access(explicit); return explicit; }
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : process.platform === 'win32'
      ? [path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft/Edge/Application/msedge.exe')]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) { try { await fs.access(candidate); return candidate; } catch {} }
  return undefined; // Fall back to Playwright's installed Chromium.
}

// This function is serialized into the browser; it must stay self-contained.
function inspectLayout() {
  const issues = [], checked = [], tolerance = 2;
  const describe = element => element.id ? `#${element.id}` : element.tagName.toLowerCase() + (typeof element.className === 'string' && element.className ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const box = element => element.getBoundingClientRect();
  const visible = element => {
    if (!element || element.closest('[hidden],dialog:not([open]),[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element), bounds = box(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && bounds.width > 0 && bounds.height > 0;
  };
  const textBox = element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); };
  const intersect = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
  const root = document.documentElement;
  if (root.scrollWidth > innerWidth + tolerance) issues.push({type: 'horizontal-overflow', detail: `Document ${root.scrollWidth}px exceeds viewport ${innerWidth}px.`});
  const selectors = '#balance,#balance-value,#header-points,#prize,#net,#coins,#next-payout,#next-risk,#score,#highest,#reward,#reward-amount,#result-total,.dice-award-value,.slot-result-payout>strong,.action-cost>strong,.score-main>strong';
  for (const element of document.querySelectorAll(selectors)) {
    if (!visible(element)) continue;
    const text = textBox(element);
    if (!text.width || !text.height) continue;
    const name = describe(element); checked.push(name);
    if (text.left < -tolerance || text.right > innerWidth + tolerance) issues.push({type: 'numeric-viewport', selector: name, detail: `Number ${element.textContent.trim()} extends beyond the viewport.`});
    const container = element.closest('.payout,.wallet,.balance,.reward-note,.balance-badge,.header-wallet,.score-panel,.scoreboard,.round-summary,.matrix-result,.reward-heading,.next-step,.slot-result-payout,#stats,.action-cost');
    if (container && container !== element) {
      const bounds = box(container);
      if (text.left < bounds.left - tolerance || text.right > bounds.right + tolerance || text.top < bounds.top - tolerance || text.bottom > bounds.bottom + tolerance) issues.push({type: 'numeric-container', selector: name, detail: `${name} extends beyond ${describe(container)}.`});
    }
    // Check every clipping ancestor: a large outer card cannot hide an inner overflow.
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const parentBox = box(parent), style = getComputedStyle(parent);
      const horizontal = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX);
      const vertical = ['hidden', 'clip'].includes(style.overflowY);
      if (horizontal && (text.left < parentBox.left - tolerance || text.right > parentBox.right + tolerance) || vertical && (text.top < parentBox.top - tolerance || text.bottom > parentBox.bottom + tolerance)) {
        issues.push({type: 'numeric-clipping', selector: name, detail: `${name} is clipped by ${describe(parent)}.`}); break;
      }
    }
  }
  const header = document.querySelector('header');
  if (header && visible(header)) {
    const balance = header.querySelector('.balance,.wallet,.reward-note,.balance-badge,.header-wallet');
    const brand = header.querySelector('.brand,.wordmark,.game-brand');
    const settings = header.querySelector('.mobile-settings-open,#menu-open,#menu,.language-control');
    for (const [left, right] of [[balance, brand], [balance, settings], [brand, settings]]) {
      if (visible(left) && visible(right) && intersect(box(left), box(right))) issues.push({type: 'header-overlap', detail: `${describe(left)} overlaps ${describe(right)}.`});
    }
  }
  for (const [leftSelector, rightSelector] of [
    ['.dice-payout-main>span:first-child', '.dice-payout-main>span:last-child'],
    ['.dice-award>span', '.dice-award>strong'],
    ['.action-cost', '#roll'], ['.stake', '#spin'],
    ['.slot-result-copy', '.slot-result-payout'], ['#result-label', '#result-total']
  ]) {
    const left = document.querySelector(leftSelector), right = document.querySelector(rightSelector);
    if (visible(left) && visible(right) && intersect(box(left), box(right))) issues.push({type: 'content-overlap', detail: `${leftSelector} overlaps ${rightSelector}.`});
  }
  // These are static control groups, not intentional horizontal carousels.
  for (const element of document.querySelectorAll('.cabinet-tools button,.game-actions button,#modes button,.navigation button')) {
    if (!visible(element)) continue;
    const bounds = box(element);
    if (bounds.left < -tolerance || bounds.right > innerWidth + tolerance) issues.push({type: 'control-viewport', selector: describe(element), detail: `${describe(element)} extends beyond the viewport.`});
  }
  return {issues, checkedNumbers: [...new Set(checked)], viewport: {width: innerWidth, height: innerHeight}, document: {width: root.scrollWidth, height: root.scrollHeight}};
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter(image => !image.complete).map(image => image.decode?.().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function hitTarget(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, bounds.left + bounds.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, bounds.top + bounds.height / 2));
    const hit = document.elementFromPoint(x, y);
    return {reachable: !!hit && (hit === element || element.contains(hit)), fullyVisible: bounds.left >= -2 && bounds.right <= innerWidth + 2 && bounds.top >= -2 && bounds.bottom <= innerHeight + 2, disabled: !!element.disabled, bounds: {left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height}, coveringElement: hit?.id || hit?.className || hit?.tagName || null};
  });
}

async function closeInitialDialogs(page, issues) {
  // Puzzle entry sheets are intentionally opened on first entry; close without paying.
  for (const dialog of await page.locator('dialog[open]').all()) {
    const close = dialog.locator('button[data-close],button.dialog-close,button[data-dismiss],#dismiss,.mobile-sheet-close').first();
    if (await close.count()) {
      const target = await hitTarget(close);
      if (target.reachable) await close.click();
      else {
        issues.push({type: 'dialog-close', detail: `Initial dialog close control is covered by ${target.coveringElement}.`});
        await page.keyboard.press('Escape');
      }
    } else await page.keyboard.press('Escape');
  }
}

async function testDialog(page, config, issues) {
  if (!config.settings) return {status: 'not-applicable'};
  const openers = page.locator(config.settings);
  let opener;
  for (const candidate of await openers.all()) if (await candidate.isVisible()) { opener = candidate; break; }
  if (!opener) return {status: 'not-present-at-this-size'};
  await opener.click();
  const dialog = page.locator('dialog[open]').last();
  await dialog.waitFor({state: 'visible'});
  const candidates = dialog.locator(config.close || 'button[aria-label*="关闭"],button[data-close]');
  let closed;
  for (const candidate of await candidates.all()) if (await candidate.isVisible()) { closed = candidate; break; }
  if (!closed) { issues.push({type: 'dialog-close', detail: 'Open dialog has no visible mapped close control.'}); await page.keyboard.press('Escape'); return {status: 'missing-close'}; }
  const target = await hitTarget(closed);
  if (!target.reachable) issues.push({type: 'dialog-close', detail: `Dialog close control is covered by ${target.coveringElement}.`});
  if (!target.fullyVisible) issues.push({type: 'dialog-close', detail: 'Dialog close control extends beyond the viewport.'});
  await closed.click({timeout: 3000});
  if (await dialog.count()) issues.push({type: 'dialog-close', detail: 'Dialog remained open after using its close control.'});
  return {status: 'checked', target};
}

async function preparePresentation(page, game) {
  // Rocket and Plinko are hosted by the lobby in normal play. Their standalone
  // documents receive an idle, public snapshot only, so controls can be measured.
  if (game === 'rocket') await page.evaluate(() => window.postMessage({type: 'rocket-state', state: 'idle', roundId: '', elapsed: 0, multiplier: 1, payout: 0, cost: 50, balance: 1000, thrust: {power: 0, phase: 'off'}}, location.origin));
  if (game === 'plinko') await page.evaluate(() => window.postMessage({type: 'plinko-state', state: 'idle', roundId: '', balance: 1000, lane: 2, elapsed: 0, result: null, path: null}, location.origin));
  // Freeze recurring HUD updates after the initial real render so visual number
  // fixtures stay in place. No fixture is written to localStorage or a wallet.
  await page.evaluate(() => { for (const id of window.__responsiveIntervals || []) clearInterval(id); });
}

async function applyLargeNumbers(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('#balance,#balance-value,#header-points')) element.textContent = '9,999,999.99';
    for (const element of document.querySelectorAll('#prize,#coins,#next-payout,#result-total,.dice-award-value,.slot-result-payout>strong')) {
      if (element.closest('[hidden],dialog:not([open])') || !element.getBoundingClientRect().width) continue;
      // Preserve units and markup in a payout while replacing only its amount.
      const child = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && /\d/.test(node.textContent));
      if (child) child.textContent = child.textContent.replace(/[\d,.]+/, '5,000');
    }
  });
  await settle(page);
}

async function applyRewardPresentation(page, game, won) {
  // Exercise the existing view renderers without starting or settling a paid
  // round. Engine probability and wallet accounting stay in their own tests.
  return page.evaluate(async ({game, won}) => {
    if (game === 'dice') {
      const result = {values: won ? [6, 6, 6] : [1, 2, 3], sum: won ? 18 : 6, mode: 'sum', target: 18, won, amount: won ? 5000 : 0, cost: 50};
      await new Promise(resolve => diceVisual.settle(result.values, () => { showResult(result, won ? 'qa-1' : 'qa-2'); resolve(); }));
      return true;
    }
    if (game === 'slots') {
      const result = {values: won ? [5, 5, 5] : [0, 1, 2], kind: won ? 'triple' : 'miss', multiplier: won ? 100 : 0, amount: won ? 5000 : 0, cost: 50};
      receive({...model, state: 'finished', roundId: won ? 'qa-1' : 'qa-2', stopped: result.values, result, elapsed: 3000});
      return true;
    }
    if (game === 'matrix') {
      const board = won ? Array.from({length: 5}, () => [5, 5, 5]) : Array.from({length: 5}, (_, column) => Array.from({length: 3}, (_, row) => (column + row) % 4));
      const prize = {...matrixPrize(board), board};
      receive({...model, state: 'finished', roundId: won ? 'qa-1' : 'qa-2', stopped: board, result: prize, elapsed: 3500});
      return true;
    }
    return false;
  }, {game, won});
}

async function runCase(browser, base, options, game, viewportName, language, output) {
  const config = PAGES[game], viewport = VIEWPORTS[viewportName];
  const id = `${game}-${viewportName}-${language}`;
  const result = {id, page: game, viewport: viewportName, language, issues: [], states: []};
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: viewport.width <= 430, hasTouch: true, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => result.issues.push({type: 'page-error', detail: error.message}));
  // Keep this audit local. The app is a simulated-points demo; no account, wallet,
  // RPC, authentication, payment or analytics endpoint is exercised by QA.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) return route.abort();
    return route.continue();
  });
  await context.addInitScript(() => {
    const original = window.setInterval;
    window.__responsiveIntervals = [];
    window.setInterval = function (...args) { const id = original.apply(this, args); window.__responsiveIntervals.push(id); return id; };
  });
  try {
    const url = new URL(config.url, base + '/'); url.searchParams.set('lang', language);
    await page.goto(url.href, {waitUntil: 'load'});
    await page.locator(config.ready).first().waitFor({state: 'attached'});
    if (config.lobby) await page.waitForFunction(() => document.querySelector('#content')?.childElementCount > 0);
    await preparePresentation(page, game);
    await closeInitialDialogs(page, result.issues);
    if (options.textScale !== 1) await page.evaluate(scale => {
      // Snapshot sizes before changing any ancestor to avoid multiplying inherited
      // font sizes twice. This approximates larger system text, not browser zoom.
      const sizes = [...document.querySelectorAll('body,body *')].filter(element => element instanceof HTMLElement).map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) if (size > 0) element.style.setProperty('font-size', size * scale + 'px', 'important');
    }, options.textScale);
    await settle(page);
    const capture = async name => {
      const layout = await page.evaluate(inspectLayout);
      result.states.push({name, ...layout});
      result.issues.push(...layout.issues.map(issue => ({...issue, state: name})));
    };
    await capture('initial');
    await page.screenshot({path: path.join(output, id + '-initial.png'), fullPage: true, animations: 'disabled'});
    await applyLargeNumbers(page);
    await capture('large-numbers');
    await page.screenshot({path: path.join(output, id + '-large.png'), fullPage: true, animations: 'disabled'});
    for (const won of [true, false]) if (await applyRewardPresentation(page, game, won)) {
      await settle(page);
      await capture(won ? 'winning-result' : 'losing-result');
      if (won) await page.screenshot({path: path.join(output, id + '-win.png'), fullPage: true, animations: 'disabled'});
    }
    const action = page.locator(config.action).first();
    if (await action.count()) {
      result.action = await hitTarget(action);
      if (!result.action.reachable) result.issues.push({type: 'action-covered', detail: `Main action is covered by ${result.action.coveringElement}.`});
      if (!result.action.fullyVisible) result.issues.push({type: 'action-viewport', detail: 'Main action extends beyond the viewport after scrolling.'});
    } else result.issues.push({type: 'missing-action', detail: `No main action matches ${config.action}.`});
    result.dialog = await testDialog(page, config, result.issues);
    await capture('after-dialog');
  } catch (error) {
    result.issues.push({type: 'check-error', detail: error.message});
    await page.screenshot({path: path.join(output, id + '-error.png'), fullPage: true, animations: 'disabled'}).catch(() => {});
  } finally { await context.close(); }
  result.passed = result.issues.length === 0;
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(`PLAYROOM responsive UI checks\n\nUsage: node scripts/check-responsive.cjs [options]\n  --quick               320px, 402px and short landscape (default)\n  --all                 Eight phone/tablet/landscape viewports\n  --games=dice,matrix    Page names: ${Object.keys(PAGES).join(', ')}\n  --viewports=small,phone,tablet\n                        Available: ${Object.keys(VIEWPORTS).join(', ')}\n  --lang=zh,en          One or both supported languages (default: both)\n  --source=src|dist     Test editable source (default) or built output\n  --text-scale=1.25     Exercise text enlargement (1 to 2)\n  --jobs=2              Parallel isolated contexts (1 to 4)\n  --output=/tmp/qa      Screenshots and report directory (default: new temp directory)\n  --browser=/path       Override browser; also PLAYROOM_BROWSER_PATH\n\nDependencies: install playwright or set PLAYROOM_PLAYWRIGHT_PATH to its module directory.\nThe check starts its own localhost preview and never changes your saved points.\n`);
    return {passed: true};
  }
  const output = options.output || await fs.mkdtemp(path.join(os.tmpdir(), 'playroom-responsive-'));
  await fs.mkdir(output, {recursive: true});
  const {chromium} = loadPlaywright();
  const executablePath = await findBrowser(options.browser);
  const server = http.createServer(createPreviewHandler(path.join(ROOT, options.source)));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  const report = {createdAt: new Date().toISOString(), source: options.source, options, output, cases: [], limitations: ['Browser checks do not replace real iOS/Android WebView, system-font, safe-area or touch-performance checks.', 'Idle snapshots, DOM-only amount fixtures and dice/slot result renderers exercise layout; they do not validate payout mathematics or live animation states.']};
  try {
    browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
    const base = `http://127.0.0.1:${server.address().port}`;
    const cases = options.viewports.flatMap(viewport => options.languages.flatMap(language => options.games.map(game => ({game, viewport, language}))));
    let cursor = 0;
    await Promise.all(Array.from({length: Math.min(options.jobs, cases.length)}, async () => {
      while (cursor < cases.length) {
        const {game, viewport, language} = cases[cursor++];
        const result = await runCase(browser, base, options, game, viewport, language, output);
        report.cases.push(result);
        await fs.writeFile(path.join(output, result.id + '.json'), JSON.stringify(result, null, 2) + '\n');
        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}${result.passed ? '' : ': ' + [...new Set(result.issues.map(issue => issue.type))].join(', ')}`);
        if (!result.passed) for (const issue of result.issues.slice(0, 4)) console.log(`  ${issue.state ? issue.state + ': ' : ''}${issue.detail}`);
      }
    }));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    report.summary = {total: report.cases.length, passed: report.cases.filter(result => result.passed).length, failed: report.cases.filter(result => !result.passed).length};
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`\n${report.summary.passed}/${report.summary.total} cases passed. Report: ${path.join(output, 'report.json')}`);
  if (report.summary.failed) process.exitCode = 1;
  return report;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {VIEWPORTS, PAGES, parseArguments, inspectLayout, main};

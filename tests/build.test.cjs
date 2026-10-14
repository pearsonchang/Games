const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {buildStatic} = require('../scripts/build-static.cjs');

test('build is deterministic, versions HTML/CSS/JS resources, and preserves route parameters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-build-'));
  try {
    const source = path.join(root, 'src'); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'index.html'), '<link href="app.css"><script src="app.js?v=old"></script><iframe src="game.html?theme=mint&amp;compare=1#start"></iframe><a href="#games">Home</a><a href="https://example.com">External</a>');
    fs.writeFileSync(path.join(source, 'game.html'), '<script src="app.js"></script>');
    fs.writeFileSync(path.join(source, 'app.js'), "const sprite = 'sprite.webp'; const entry = 'game.html'; const link = `<a href=\"game.html?theme=${key}\">demo</a>`;");
    fs.writeFileSync(path.join(source, 'app.css'), ".icon{background:url('sprite.webp')} .shape{fill:url(#gradient)}");
    fs.writeFileSync(path.join(source, 'sprite.webp'), 'fixture');
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    const first = buildStatic(source, a), second = buildStatic(source, b);
    assert.deepEqual(first, second);
    for (const name of fs.readdirSync(a)) assert.deepEqual(fs.readFileSync(path.join(a, name)), fs.readFileSync(path.join(b, name)));
    const html = fs.readFileSync(path.join(a, 'index.html'), 'utf8');
    assert.ok(html.includes(`app.js?v=${first.version}`));
    assert.ok(html.includes(`game.html?theme=mint&amp;compare=1&amp;v=${first.version}#start`));
    assert.ok(html.includes('href="#games"')); assert.ok(html.includes('href="https://example.com"'));
    assert.ok(fs.readFileSync(path.join(a, 'app.css'), 'utf8').includes(`sprite.webp?v=${first.version}`));
    assert.ok(fs.readFileSync(path.join(a, 'app.css'), 'utf8').includes('url(#gradient)'));
    assert.ok(fs.readFileSync(path.join(a, 'app.js'), 'utf8').includes(`game.html?v=${first.version}`));
    assert.ok(fs.readFileSync(path.join(a, 'app.js'), 'utf8').includes('game.html?theme=${key}'));
    assert.ok(!fs.readFileSync(path.join(source, 'app.js'), 'utf8').includes('?v='));
    fs.appendFileSync(path.join(source, 'app.css'), '\n/* changed */');
    assert.notEqual(buildStatic(source, path.join(root, 'c')).version, first.version);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('build preserves concatenated contract links while versioning complete static URLs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-build-links-'));
  try {
    const source = path.join(root, 'src'); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'fairness-testnet.html'), '<main>Testnet</main>');
    fs.writeFileSync(path.join(source, 'links.js'), [
      "globalThis.contractLink = 'fairness-testnet.html?contract='+encodeURIComponent(address);",
      "globalThis.splitLink = 'fairness-testnet.html' + '?contract=' + encodeURIComponent(address);",
      "globalThis.prefixedLink = prefix + 'fairness-testnet.html?contract=' + encodeURIComponent(address);",
      "globalThis.staticLink = 'fairness-testnet.html?mode=dice';",
    ].join('\n'));
    const output = path.join(root, 'dist');
    const manifest = buildStatic(source, output);
    const address = '0x1234567890123456789012345678901234567890';
    const context = {address, prefix: './'};
    vm.runInNewContext(fs.readFileSync(path.join(output, 'links.js'), 'utf8'), context);
    for (const key of ['contractLink', 'splitLink', 'prefixedLink']) {
      const url = new URL(context[key], 'https://example.com/');
      assert.equal(url.pathname, '/fairness-testnet.html');
      assert.equal(url.searchParams.get('contract'), address);
      assert.equal(url.searchParams.has('v'), false);
    }
    const staticURL = new URL(context.staticLink, 'https://example.com/');
    assert.equal(staticURL.searchParams.get('mode'), 'dice');
    assert.equal(staticURL.searchParams.get('v'), manifest.version);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

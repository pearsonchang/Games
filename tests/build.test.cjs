const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildStatic} = require('../scripts/build-static.cjs');

test('build is deterministic, versions HTML/CSS/JS resources, and preserves route parameters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-build-'));
  try {
    const source = path.join(root, 'src'); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'index.html'), '<link href="app.css"><script src="app.js?v=old"></script><iframe src="game.html?theme=mint#start"></iframe><a href="#games">Home</a><a href="https://example.com">External</a>');
    fs.writeFileSync(path.join(source, 'game.html'), '<script src="app.js"></script>');
    fs.writeFileSync(path.join(source, 'app.js'), "const sprite = 'sprite.webp'; const entry = 'game.html';");
    fs.writeFileSync(path.join(source, 'app.css'), ".icon{background:url('sprite.webp')} .shape{fill:url(#gradient)}");
    fs.writeFileSync(path.join(source, 'sprite.webp'), 'fixture');
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    const first = buildStatic(source, a), second = buildStatic(source, b);
    assert.deepEqual(first, second);
    for (const name of fs.readdirSync(a)) assert.deepEqual(fs.readFileSync(path.join(a, name)), fs.readFileSync(path.join(b, name)));
    const html = fs.readFileSync(path.join(a, 'index.html'), 'utf8');
    assert.ok(html.includes(`app.js?v=${first.version}`));
    assert.ok(html.includes(`game.html?theme=mint&v=${first.version}#start`));
    assert.ok(html.includes('href="#games"')); assert.ok(html.includes('href="https://example.com"'));
    assert.ok(fs.readFileSync(path.join(a, 'app.css'), 'utf8').includes(`sprite.webp?v=${first.version}`));
    assert.ok(fs.readFileSync(path.join(a, 'app.css'), 'utf8').includes('url(#gradient)'));
    assert.ok(fs.readFileSync(path.join(a, 'app.js'), 'utf8').includes(`game.html?v=${first.version}`));
    assert.ok(!fs.readFileSync(path.join(source, 'app.js'), 'utf8').includes('?v='));
    fs.appendFileSync(path.join(source, 'app.css'), '\n/* changed */');
    assert.notEqual(buildStatic(source, path.join(root, 'c')).version, first.version);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

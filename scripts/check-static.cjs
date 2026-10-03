'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {walk, resourcePath, mapReferences} = require('./static-resources.cjs');
const publicRoot = path.resolve(process.argv[2] || path.join(__dirname, '../src'));
const files = walk(publicRoot);
const names = new Set(files.map(filename => path.relative(publicRoot, filename).split(path.sep).join('/')));
const errors = [];
let references = 0, javascript = 0;
for (const filename of files) {
  const owner = path.relative(publicRoot, filename).split(path.sep).join('/');
  const extension = path.extname(filename);
  if (!['.html', '.css', '.js'].includes(extension)) continue;
  const source = fs.readFileSync(filename, 'utf8');
  if (extension === '.js') {
    javascript++;
    const result = spawnSync(process.execPath, ['--check', filename], {encoding: 'utf8'});
    if (result.status !== 0) errors.push(`${owner}: ${result.error?.message || result.stderr || 'syntax check failed'}`);
  }
  mapReferences(source, extension, value => {
    try {
      const target = resourcePath(owner, value);
      if (target !== null) {
        references++;
        if (!names.has(target)) errors.push(`${owner}: missing resource or incorrect filename case: ${value}`);
      }
    } catch { errors.push(`${owner}: invalid resource URL ${value}`); }
    return value;
  });
}
for (const entry of ['index', 'minesweeper', 'rocket', 'dice', 'plinko', 'horse', 'palettes', 'palette-demo']) {
  if (!names.has(`${entry}.html`)) errors.push(`Missing required entrypoint: ${entry}.html`);
}
// Public builds must never contain the authority or credentials.
for (const name of names) {
  if (/(^|\/)\.|(^|\/)(server|api)(\/|$)|-engine\.js$|platform-wallet\.js$|\.(?:cjs|sqlite|db|pem|key)(?:-|$)/.test(name)) errors.push(`Private file in public assets: ${name}`);
}
if (!process.argv[2]) {
  for (const directory of ['server', 'api']) for (const filename of walk(path.join(__dirname, '..', directory))) {
    if (!/\.(?:cjs|js)$/.test(filename)) continue;
    const result = spawnSync(process.execPath, ['--check', filename], {encoding: 'utf8'});
    if (result.status !== 0) errors.push(`${filename}: ${result.stderr || 'syntax check failed'}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Static checks passed (${path.basename(publicRoot)}): ${javascript} JavaScript files, ${references} local references, 8 entrypoints.`);

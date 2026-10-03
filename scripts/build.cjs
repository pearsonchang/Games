'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {buildStatic} = require('./build-static.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const staging = path.join(root, `.dist-build-${process.pid}`);
function run(args) {
  const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Validation failed: ${args.join(' ')}`);
}
try {
  run(['scripts/check-static.cjs']);
  run(['--test']);
  const manifest = buildStatic(path.join(root, 'src'), staging);
  run(['scripts/check-static.cjs', staging]);
  // A failed check never replaces the last usable preview.
  fs.rmSync(output, {recursive: true, force: true});
  fs.renameSync(staging, output);
  console.log(`Built dist/ (${manifest.files.length} files, version ${manifest.version}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(staging, {recursive: true, force: true});
}

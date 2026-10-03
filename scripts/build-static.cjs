'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {walk, resourcePath, mapReferences} = require('./static-resources.cjs');

// Stable release fingerprint covers every source and the transformation code.
// Version queries preserve existing .html routes, sprites and cleanUrls behavior.
function buildStatic(sourceRoot, outputRoot) {
  const files = walk(sourceRoot);
  const sources = new Map(files.map(filename => [path.relative(sourceRoot, filename).split(path.sep).join('/'), fs.readFileSync(filename)]));
  const hash = crypto.createHash('sha256');
  for (const script of [__filename, require.resolve('./static-resources.cjs')]) hash.update(fs.readFileSync(script));
  for (const [name, buffer] of sources) hash.update(name + '\0' + buffer.length + '\0').update(buffer);
  const version = hash.digest('hex').slice(0, 16);
  fs.mkdirSync(outputRoot, {recursive: true});
  for (const [name, buffer] of sources) {
    let output = buffer;
    const extension = path.extname(name);
    if (['.html', '.css', '.js'].includes(extension)) {
      output = mapReferences(buffer.toString('utf8'), extension, value => {
        const target = resourcePath(name, value);
        if (!target || !sources.has(target) || !path.extname(value.split(/[?#]/)[0])) return value;
        const match = value.match(/^([^?#]+)(?:\?([^#]*))?(#.*)?$/);
        const params = new URLSearchParams(match[2] || '');
        params.set('v', version);
        return `${match[1]}?${params}${match[3] || ''}`;
      });
    }
    const destination = path.join(outputRoot, name);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, output);
  }
  const manifest = {version, files: [...sources.keys()]};
  fs.writeFileSync(path.join(outputRoot, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
module.exports = {buildStatic};

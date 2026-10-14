'use strict';
const fs = require('node:fs');
const path = require('node:path');

function walk(root) {
  return fs.readdirSync(root, {withFileTypes: true}).flatMap(entry => {
    const filename = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not public assets: ${filename}`);
    return entry.isDirectory() ? walk(filename) : [filename];
  }).sort();
}
function resourcePath(owner, value) {
  const resource = value.trim().split(/[?#]/)[0];
  if (!resource || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(resource)) return null;
  const decoded = decodeURIComponent(resource);
  const relative = decoded.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(owner), decoded);
  let target = path.posix.normalize(relative || 'index.html');
  if (decoded.endsWith('/')) target = path.posix.join(target, 'index.html');
  return target;
}
function mapReferences(source, extension, replace) {
  if (extension === '.html') return source.replace(/(\b(?:src|href)\s*=\s*)(["'])(.*?)\2/gs, (_, prefix, quote, value) => prefix + quote + replace(value.replace(/&amp;/g, '&')).replace(/&/g, '&amp;') + quote);
  if (extension === '.css') return source.replace(/url\(\s*(["']?)([^)]+?)\1\s*\)/g, (_, quote, value) => `url(${quote}${replace(value)}${quote})`);
  if (extension === '.js') return source.replace(/(["'])([\w./-]+\.(?:html|css|js|png|jpe?g|webp|svg|avif)(?:\?[^'"\s]*)?)\1/g, (match, quote, value, offset) => {
    // A concatenated string may be only part of a URL. Appending a version here
    // would move a later query value into the version parameter instead.
    const dynamic = /\+\s*$/.test(source.slice(0, offset)) || /^\s*\+/.test(source.slice(offset + match.length));
    return quote + replace(value, {dynamic}) + quote;
  });
  return source;
}
module.exports = {walk, resourcePath, mapReferences};

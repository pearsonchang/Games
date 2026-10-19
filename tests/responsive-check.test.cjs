'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseArguments, PAGES, VIEWPORTS} = require('../scripts/check-responsive.cjs');

test('responsive audit defaults cover every game, both languages and short screens without launching a browser', () => {
  const options = parseArguments([]);
  assert.equal(Object.keys(PAGES).length, 12);
  assert.deepEqual(options.games, Object.keys(PAGES));
  assert.deepEqual(options.languages, ['zh-CN', 'en']);
  assert.deepEqual(options.viewports, ['small', 'iphone', 'landscape']);
  assert.equal(options.source, 'src');
  assert.equal(options.output, null);
});

test('responsive audit supports complete coverage and focused follow-up runs', () => {
  assert.deepEqual(parseArguments(['--all']).viewports, Object.keys(VIEWPORTS));
  const options = parseArguments(['--all', '--games=dice,matrix', '--viewports=compact,tabletLarge', '--lang=en', '--text-scale=1.25', '--source=dist']);
  assert.deepEqual(options.games, ['dice', 'matrix']);
  assert.deepEqual(options.viewports, ['compact', 'tabletLarge']);
  assert.deepEqual(options.languages, ['en']);
  assert.equal(options.textScale, 1.25);
  assert.equal(options.source, 'dist');
  assert.equal(parseArguments(['--jobs=1']).jobs, 1);
  assert.deepEqual(parseArguments(['--lang=zh']).languages, ['zh-CN']);
});

test('responsive audit rejects misspelled coverage rather than silently skipping checks', () => {
  for (const argument of ['--games=unknown', '--viewports=mini', '--lang=fr', '--source=elsewhere', '--text-scale=0', '--text-scale=NaN', '--typo=1', '--quickly', '--jobs=0', '--jobs=1.5', '--jobs=5', '--output=']) assert.throws(() => parseArguments([argument]));
});

'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/i18n.js'), 'utf8');

// A deliberately small DOM harness: mutation delivery, node identity and event
// sources matter here; rendering and layout are covered by browser review.
function page({saved = 'zh-CN', blocked = false, parent = null, origin = 'https://playroom.test'} = {}) {
  const tasks = [], observers = [], events = new Map(), documentEvents = new Map();
  const metrics = {walks:0, callbacks:0, writes:0};
  function emit(record) {
    for (const observer of observers) {
      if (!observer.active || !record.target.isConnected) continue;
      if (record.type === 'attributes' && !observer.options.attributeFilter.includes(record.attributeName)) continue;
      observer.records.push(record);
      if (!observer.scheduled) {
        observer.scheduled = true;
        tasks.push(() => {
          observer.scheduled = false;
          const records = observer.records.splice(0);
          if (records.length && observer.active) { metrics.callbacks++; observer.callback(records); }
        });
      }
    }
  }
  class Node {
    constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get isConnected() { return this.nodeType === 9 || !!this.parentNode?.isConnected; }
    append(...children) {
      for (const child of children) {
        if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
        child.parentNode = this; this.childNodes.push(child);
      }
      emit({type:'childList', target:this, addedNodes:children});
    }
    get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
    set textContent(value) {
      for (const child of this.childNodes) child.parentNode = null;
      this.childNodes = [];
      this.append(new Text(value));
    }
  }
  class Text extends Node {
    constructor(value) { super(3); this._data = String(value); }
    get data() { return this._data; }
    set data(value) { this._data = String(value); emit({type:'characterData', target:this}); }
    get textContent() { return this.data; }
    set textContent(value) { this.data = value; }
  }
  class Element extends Node {
    constructor(tag) { super(1); this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.handlers = new Map(); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); emit({type:'attributes', target:this, attributeName:name}); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    matches(selector) {
      return selector.split(',').some(part => {
        const s = part.trim();
        const notAttribute = s.match(/^([a-z]+):not\(\[([^\]]+)\]\)$/);
        if (notAttribute) return this.tagName.toLowerCase() === notAttribute[1] && !this.hasAttribute(notAttribute[2]);
        if (s.startsWith('.')) return (this.getAttribute('class') || '').split(/\s+/).includes(s.slice(1));
        if (s.startsWith('[')) return this.hasAttribute(s.slice(1, -1));
        return this.tagName.toLowerCase() === s;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return descendants(this).filter(node => node.nodeType === 1 && node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) || []), fn]); }
    fire(type, event = {}) { for (const fn of this.handlers.get(type) || []) fn(event); }
  }
  function descendants(node) { return node.childNodes.flatMap(child => [child, ...descendants(child)]); }
  const doc = new Node(9);
  doc.documentElement = new Element('html'); doc.append(doc.documentElement);
  doc.body = new Element('body'); doc.documentElement.append(doc.body);
  const control = new Element('label'); control.setAttribute('class', 'language-control'); control.setAttribute('data-i18n-skip', '');
  const select = new Element('select'); select.setAttribute('class', 'language-select'); control.append(select); doc.body.append(control);
  doc.readyState = 'loading';
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.querySelector = selector => doc.querySelectorAll(selector)[0] || null;
  doc.addEventListener = (type, fn) => documentEvents.set(type, [...(documentEvents.get(type) || []), fn]);
  doc.dispatchEvent = event => { for (const fn of documentEvents.get(event.type) || []) fn(event); };
  doc.createElement = tag => new Element(tag);
  doc.createTreeWalker = (node, _mask, filter) => {
    metrics.walks++;
    const nodes = [];
    function visit(parent) {
      for (const child of parent.childNodes) {
        const decision = filter.acceptNode(child);
        if (decision === 2) continue;
        if (decision === 1) nodes.push(child);
        visit(child);
      }
    }
    visit(node); let index = -1;
    return {get currentNode() { return nodes[index]; }, nextNode() { return ++index < nodes.length; }};
  };
  const values = new Map([['playroom.language', saved]]);
  const window = {
    document:doc, location:{origin, search:''}, queueMicrotask:fn => tasks.push(fn),
    localStorage:{getItem(key) { if (blocked) throw Error('Storage denied'); return values.get(key); }, setItem(key, value) { if (blocked) throw Error('Storage denied'); metrics.writes++; values.set(key, value); }},
    CustomEvent:class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver:class {
      constructor(callback) { this.callback = callback; this.records = []; this.active = false; this.scheduled = false; observers.push(this); }
      observe(_target, options) { this.options = options; this.active = true; }
      disconnect() { this.active = false; this.records = []; }
    },
    addEventListener(type, fn) { events.set(type, [...(events.get(type) || []), fn]); }
  };
  window.parent = parent || window;
  const context = vm.createContext({window, URLSearchParams, Map, WeakMap});
  vm.runInContext(source, context, {filename:'i18n.js'});
  const api = window.PlayroomI18n;
  api.register({messages:{'准备就绪':'Ready', '正在转动':'Spinning', '关闭音效':'Mute sound', '开启音效':'Enable sound', '游戏大厅':'Game lobby', '奖励已到账':'Reward paid'}});
  return {
    api, window, doc, values, metrics, Element, Text,
    add(tag, text) { const element = new Element(tag); if (text !== undefined) element.append(new Text(text)); doc.body.append(element); return element; },
    boot() { doc.readyState = 'complete'; doc.dispatchEvent({type:'DOMContentLoaded'}); this.drain(); },
    drain() { let steps = 0; while (tasks.length) { assert.ok(++steps < 100, 'mutation delivery must settle'); tasks.shift()(); } return steps; },
    message(event) { for (const fn of events.get('message') || []) fn(event); this.drain(); },
    storage(newValue) { for (const fn of events.get('storage') || []) fn({key:'playroom.language', newValue}); this.drain(); }
  };
}

test('switching languages preserves game node identities, state, handlers and semantic data', () => {
  const p = page(), button = p.add('button', '准备就绪'), originalText = button.childNodes[0];
  button.setAttribute('aria-label', '关闭音效'); button.setAttribute('data-state', 'playing'); button.setAttribute('data-game', 'blocks');
  button.disabled = true; const round = {score:580, moves:12, balance:9950}; button.round = round;
  let clicks = 0; button.addEventListener('click', () => clicks++); p.boot();
  p.api.setLanguage('en'); p.drain();
  assert.equal(button.textContent, 'Ready'); assert.equal(button.getAttribute('aria-label'), 'Mute sound');
  assert.equal(p.api.sourceText(button), '准备就绪'); assert.equal(p.api.sourceAttribute(button, 'aria-label'), '关闭音效');
  assert.equal(button.childNodes[0], originalText); assert.equal(button.round, round); assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('data-state'), 'playing'); assert.equal(button.getAttribute('data-game'), 'blocks');
  p.api.setLanguage('zh-CN'); p.drain(); button.fire('click');
  assert.equal(button.textContent, '准备就绪'); assert.equal(button.getAttribute('aria-label'), '关闭音效');
  assert.equal(button.childNodes[0], originalText); assert.equal(clicks, 1); assert.deepEqual(round, {score:580, moves:12, balance:9950});
});

test('dynamic text, replaced nodes and accessibility attributes restore their latest source', () => {
  const p = page({saved:'en'}), status = p.add('p', '准备就绪'); status.setAttribute('title', '关闭音效'); p.boot();
  status.childNodes[0].data = '正在转动'; status.setAttribute('title', '开启音效'); p.drain();
  assert.equal(status.textContent, 'Spinning'); assert.equal(status.getAttribute('title'), 'Enable sound');
  status.textContent = '奖励已到账';
  const newButton = p.add('button', '游戏大厅'); newButton.setAttribute('aria-label', '游戏大厅'); p.drain();
  assert.equal(status.textContent, 'Reward paid'); assert.equal(newButton.textContent, 'Game lobby');
  assert.equal(p.api.sourceText(status), '奖励已到账'); assert.equal(p.api.sourceAttribute(newButton, 'aria-label'), '游戏大厅');
  p.api.setLanguage('zh-CN'); p.drain();
  assert.equal(status.textContent, '奖励已到账'); assert.equal(status.getAttribute('title'), '开启音效');
  assert.equal(newButton.textContent, '游戏大厅'); assert.equal(newButton.getAttribute('aria-label'), '游戏大厅');
  // English/numeric updates owned by the game must not be overwritten by old source records.
  p.api.setLanguage('en'); status.childNodes[0].data = '580'; status.setAttribute('title', 'score-580'); p.drain();
  p.api.setLanguage('zh-CN'); assert.equal(status.textContent, '580'); assert.equal(status.getAttribute('title'), 'score-580');
});

test('mutations settle without loops and animation-only changes do not scan the page', () => {
  const p = page({saved:'en'}), label = p.add('p', '准备就绪'), score = p.add('b', '580'), piece = p.add('div'); p.boot();
  const baseline = {...p.metrics};
  for (let frame = 0; frame < 60; frame++) {
    piece.setAttribute('style', `transform:translate(${frame}px,0)`); piece.setAttribute('class', 'dragging');
    piece.setAttribute('data-x', frame); score.childNodes[0].data = String(580 + frame);
  }
  p.drain();
  assert.equal(p.metrics.walks, baseline.walks, 'drag styles, classes and score digits should not trigger a tree scan');
  const before = p.metrics.callbacks;
  label.childNodes[0].data = '正在转动'; label.setAttribute('aria-label', '关闭音效');
  assert.ok(p.drain() < 10); assert.equal(label.textContent, 'Spinning');
  assert.ok(p.metrics.callbacks - before <= 3, 'translation observer must reach a fixed point');
});

test('language selection works when storage throws and ignores invalid preferences', () => {
  const p = page({blocked:true}), label = p.add('p', '准备就绪'); p.boot();
  assert.doesNotThrow(() => p.api.setLanguage('en')); p.drain();
  assert.equal(label.textContent, 'Ready'); assert.equal(p.api.language, 'en');
  assert.equal(p.api.setLanguage('invalid'), false); p.storage('invalid'); assert.equal(p.api.language, 'en');
  p.storage('zh-CN'); assert.equal(label.textContent, '准备就绪'); assert.equal(p.metrics.writes, 0);
});

test('iframe sync validates origin and window identity and same-language echoes stop', () => {
  const parentMessages = [], childMessages = [];
  const parent = {postMessage:(...args) => parentMessages.push(args)};
  const child = {postMessage:(...args) => childMessages.push(args)};
  const p = page({parent}), frame = p.add('iframe'); frame.contentWindow = child; p.boot();
  assert.equal(parentMessages[0][0].type, 'playroom-language-request');
  p.message({origin:'https://untrusted.test', source:parent, data:{type:'playroom-language', language:'en'}});
  p.message({origin:p.window.location.origin, source:{}, data:{type:'playroom-language', language:'en'}});
  assert.equal(p.api.language, 'zh-CN');
  p.message({origin:p.window.location.origin, source:parent, data:{type:'playroom-language', language:'en'}});
  assert.equal(p.api.language, 'en'); assert.equal(p.metrics.writes, 0);
  assert.equal(childMessages.at(-1)[0].language, 'en');
  const count = parentMessages.length + childMessages.length;
  p.message({origin:p.window.location.origin, source:child, data:{type:'playroom-language', language:'en'}});
  assert.equal(parentMessages.length + childMessages.length, count, 'echo must not rebroadcast');
  p.message({origin:p.window.location.origin, source:child, data:{type:'playroom-language-request'}});
  assert.equal(childMessages.at(-1)[0].language, 'en'); assert.equal(childMessages.at(-1)[1], p.window.location.origin);
});

test('ignored content and protocol attributes remain unchanged', () => {
  const p = page({saved:'en'}), script = p.add('script', '准备就绪'), custom = p.add('div', '准备就绪');
  custom.setAttribute('data-i18n-skip', ''); custom.setAttribute('aria-label', '关闭音效');
  const button = p.add('button', '准备就绪'); button.setAttribute('data-action', '准备就绪'); p.boot();
  assert.equal(script.textContent, '准备就绪'); assert.equal(custom.textContent, '准备就绪');
  assert.equal(custom.getAttribute('aria-label'), '关闭音效'); assert.equal(button.getAttribute('data-action'), '准备就绪');
  assert.equal(button.textContent, 'Ready');
});

test('textarea and ordinary code keep content while accessible attributes and marked statuses translate', () => {
  const p = page({saved:'en'}), textarea = p.add('textarea', '准备就绪'), code = p.add('code', '准备就绪');
  textarea.setAttribute('placeholder', '游戏大厅'); textarea.setAttribute('aria-label', '准备就绪');
  code.setAttribute('aria-roledescription', '准备就绪');
  const status = p.add('code', '准备就绪'); status.setAttribute('data-i18n-status', ''); p.boot();
  assert.equal(textarea.textContent, '准备就绪'); assert.equal(textarea.getAttribute('placeholder'), 'Game lobby');
  assert.equal(textarea.getAttribute('aria-label'), 'Ready'); assert.equal(code.textContent, '准备就绪');
  assert.equal(code.getAttribute('aria-roledescription'), 'Ready'); assert.equal(status.textContent, 'Ready');
  status.childNodes[0].data = '正在转动'; textarea.setAttribute('placeholder', '开启音效'); p.drain();
  assert.equal(status.textContent, 'Spinning'); assert.equal(textarea.getAttribute('placeholder'), 'Enable sound');
  p.api.setLanguage('zh-CN'); p.drain();
  assert.equal(status.textContent, '正在转动'); assert.equal(textarea.getAttribute('placeholder'), '开启音效');
});

test('shared terminology wins over later page-specific registrations', () => {
  const p = page();
  p.api.register({shared:true, messages:{'模拟积分':'Demo points'}, patterns:[[/^测试 (\d+)$/u, 'Shared $1']]});
  p.api.register({messages:{'模拟积分':'Other copy'}, patterns:[[/^测试 (\d+)$/u, 'Page $1']]});
  assert.equal(p.api.translate('模拟积分', 'en'), 'Demo points');
  assert.equal(p.api.translate('测试 50', 'en'), 'Shared 50');
});

/* Display-only localization. Game IDs, rules, receipts and wallet messages stay unchanged. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'playroom.language';
  const HAN = /[\u3400-\u9fff]/u;
  const attributes = ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'alt'];
  const ignored = 'script,style,noscript,code:not([data-i18n-status]),pre,textarea,[data-i18n-skip]';
  const messages = new Map(), normalized = new Map(), patterns = [], cache = new Map(), sharedKeys = new Set();
  const originals = new WeakMap(), originalAttributes = new WeakMap();
  const doc = root.document;
  let language = 'zh-CN', observer, started = false, queued = false;
  const pending = new Set();
  const valid = value => value === 'en' || value === 'zh-CN';
  try { const saved = root.localStorage?.getItem(STORAGE_KEY); if (valid(saved)) language = saved; } catch { /* Optional storage. */ }
  try { const requested = new URLSearchParams(root.location?.search || '').get('lang'); if (valid(requested)) language = requested; } catch { /* Keep the saved/default language. */ }
  if (doc) doc.documentElement.lang = language;

  function register(bundle) {
    for (const [source, english] of Object.entries(bundle.messages || {})) {
      if (sharedKeys.has(source) && !bundle.shared) continue;
      messages.set(source, english);
      normalized.set(source.trim().replace(/\s+/gu, ' '), english);
      if (bundle.shared) sharedKeys.add(source);
    }
    if (bundle.shared) patterns.unshift(...(bundle.patterns || []));
    else patterns.push(...(bundle.patterns || []));
    cache.clear();
    if (started && language === 'en') refresh();
  }
  function translate(value, locale = language) {
    const text = String(value ?? '');
    if (locale !== 'en' || !HAN.test(text)) return text;
    if (cache.has(text)) return cache.get(text);
    const leading = text.match(/^\s*/u)[0], trailing = text.match(/\s*$/u)[0], key = text.trim();
    let result = messages.get(key) ?? normalized.get(key.replace(/\s+/gu, ' '));
    if (result === undefined) {
      for (const [pattern, replacement] of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(key)) { pattern.lastIndex = 0; result = key.replace(pattern, replacement); break; }
      }
    }
    // Compound status labels remain composable without replacing arbitrary substrings.
    if (result === undefined && /\n| · /u.test(key)) {
      result = key.split(/(\n+| · )/u).map(part => /\n|^ · $/u.test(part) ? part : translate(part, locale)).join('');
    }
    const output = leading + (result ?? key) + trailing;
    if (cache.size >= 512) cache.clear();
    cache.set(text, output);
    return output;
  }
  function sourceText(node) {
    if (!node) return '';
    if (node.nodeType === 3) {
      const record = originals.get(node);
      return record && node.data === record.output ? record.source : node.data;
    }
    return Array.from(node.childNodes || [], sourceText).join('');
  }
  function sourceAttribute(node, name) {
    const current = node?.getAttribute(name), record = originalAttributes.get(node)?.get(name);
    return record && current === record.output ? record.source : current;
  }
  function textNode(node) {
    if (!node.parentElement || node.parentElement.closest(ignored)) return;
    const current = node.data, record = originals.get(node);
    const source = record && current === record.output ? record.source : current;
    if (!HAN.test(source)) return;
    const output = translate(source);
    originals.set(node, { source, output });
    if (output !== current) node.data = output;
  }
  function attribute(node, name) {
    if (!node.hasAttribute(name) || node.closest('[data-i18n-skip]')) return;
    const current = node.getAttribute(name);
    const records = originalAttributes.get(node) || new Map(), record = records.get(name);
    const source = record && current === record.output ? record.source : current;
    if (!HAN.test(source)) return;
    const output = translate(source);
    records.set(name, { source, output }); originalAttributes.set(node, records);
    if (output !== current) node.setAttribute(name, output);
  }
  function element(node) {
    for (const name of attributes) attribute(node, name);
    if (node.tagName === 'META' && node.getAttribute('name') === 'description') attribute(node, 'content');
  }
  function scan(node) {
    if (node.nodeType === 3) { textNode(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.nodeType === 1) element(node);
    if (node.nodeType === 1 && node.matches(ignored)) return;
    const walker = doc.createTreeWalker(node, 1 | 4, { acceptNode(child) {
      if (child.nodeType === 1 && child.matches(ignored)) { element(child); return 2; }
      return 1;
    }});
    while (walker.nextNode()) {
      const child = walker.currentNode;
      if (child.nodeType === 3) textNode(child); else element(child);
    }
  }
  function flush() {
    queued = false;
    const nodes = [...pending]; pending.clear();
    if (language !== 'en') return;
    for (const node of nodes) if (node.isConnected) scan(node);
  }
  function observe() {
    if (!observer || language !== 'en') return;
    observer.observe(doc.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributes});
  }
  function refresh() {
    if (!doc || !started) return;
    observer?.disconnect(); pending.clear();
    scan(doc.documentElement);
    doc.documentElement.lang = language;
    doc.querySelectorAll('.language-select').forEach(select => { select.value = language; select.setAttribute('aria-label', language === 'en' ? 'Language' : '语言'); });
    observe();
  }
  function broadcast() {
    if (!root.location || root.location.origin === 'null') return;
    const message = {type:'playroom-language', language};
    if (root.parent && root.parent !== root) root.parent.postMessage(message, root.location.origin);
    doc?.querySelectorAll('iframe').forEach(frame => frame.contentWindow?.postMessage(message, root.location.origin));
  }
  function setLanguage(next, options = {}) {
    if (!valid(next)) return false;
    const changed = next !== language;
    language = next;
    if (options.persist !== false) try { root.localStorage?.setItem(STORAGE_KEY, language); } catch { /* Current-page selection still works. */ }
    if (changed) {
      refresh();
      if (doc) doc.dispatchEvent(new root.CustomEvent('playroom:languagechange', {detail:{language}}));
    }
    if (options.broadcast !== false && changed) broadcast();
    return true;
  }
  function mountControl() {
    if (doc.querySelector('.language-control')) return;
    const control = doc.createElement('label'); control.className = 'language-control';
    control.setAttribute('data-i18n-skip', '');
    control.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg><select class="language-select" aria-label="语言"><option value="zh-CN">中文</option><option value="en">EN</option></select>';
    const select = control.querySelector('select'); select.value = language;
    select.setAttribute('aria-label', language === 'en' ? 'Language' : '语言');
    select.addEventListener('change', () => setLanguage(select.value));
    const host = doc.querySelector('.header-actions, .header-tools') || doc.querySelector('header');
    if (host) host.append(control);
    else { control.classList.add('language-standalone'); (doc.querySelector('main') || doc.body).prepend(control); }
  }
  function boot() {
    if (started) return;
    started = true; mountControl();
    observer = new root.MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') { attribute(record.target, record.attributeName); continue; }
        if (record.type === 'characterData') {
          if (originals.get(record.target)?.output !== record.target.data && HAN.test(record.target.data)) pending.add(record.target);
        } else {
          for (const node of record.addedNodes) {
            if (node.nodeType === 3 && (!HAN.test(node.data) || originals.get(node)?.output === node.data)) continue;
            pending.add(node);
          }
        }
      }
      if (pending.size && !queued) { queued = true; root.queueMicrotask(flush); }
    });
    refresh();
    if (root.parent && root.parent !== root && root.location.origin !== 'null') root.parent.postMessage({type:'playroom-language-request'}, root.location.origin);
  }
  root.PlayroomI18n = { register, translate, sourceText, sourceAttribute, setLanguage, refresh, get language() { return language; }, STORAGE_KEY };
  if (typeof module !== 'undefined') module.exports = root.PlayroomI18n;
  if (!doc) return;
  root.addEventListener('storage', event => { if (event.key === STORAGE_KEY && valid(event.newValue)) setLanguage(event.newValue, {persist:false}); });
  root.addEventListener('message', event => {
    if (event.origin !== root.location.origin || !event.data) return;
    const child = [...doc.querySelectorAll('iframe')].some(frame => frame.contentWindow === event.source);
    const parent = root.parent !== root && event.source === root.parent;
    if (!child && !parent) return;
    if (child && event.data.type === 'playroom-language-request') event.source.postMessage({type:'playroom-language',language}, root.location.origin);
    if (event.data.type === 'playroom-language' && valid(event.data.language)) setLanguage(event.data.language, {persist:false});
  });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})(typeof window !== 'undefined' ? window : globalThis);

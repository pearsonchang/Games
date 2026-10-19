/* Mobile presentation only. Original controls keep their handlers and IDs. */
(() => {
  'use strict';
  const game = document.body.dataset.mobileGame;
  if (!game) return;
  const phone = matchMedia('(max-width:740px), (max-width:1100px) and (max-height:600px) and (min-aspect-ratio:4/3)');
  const $ = selector => document.querySelector(selector);
  const sourceText = node => window.PlayroomI18n?.sourceText(node) ?? node.textContent;
  const relocations = [];
  const sheets = [];
  function relocate(node, destination) {
    if (!node || !destination) return;
    const marker = document.createComment('desktop control position');
    node.before(marker);
    relocations.push({ node, marker, destination });
  }
  function sheet(title, id) {
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'mobile-sheet';
    dialog.setAttribute('aria-labelledby', id + '-title');
    dialog.innerHTML = `<div class="mobile-sheet-head"><h2 id="${id}-title"></h2><button type="button" class="mobile-sheet-close" aria-label="关闭面板">×</button></div><div class="mobile-sheet-body"></div>`;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    document.body.append(dialog);
    sheets.push(dialog);
    return dialog;
  }
  const open = dialog => { if (!dialog.open) dialog.showModal(); };
  const closeSheets = () => sheets.forEach(dialog => { if (dialog.open) dialog.close(); });
  const settings = sheet('游戏设置', 'mobile-settings');
  const settingsBody = settings.querySelector('.mobile-sheet-body');
  settingsBody.innerHTML = '<div class="mobile-audio-row"><span>游戏音效</span></div><button type="button" class="mobile-help-button">玩法与奖励 <span aria-hidden="true">↗</span></button><button type="button" class="mobile-return-button">返回游戏大厅</button><p class="mobile-settings-note">仅使用模拟积分 · 返回大厅不影响本局进度或结算</p>';
  const soundId = { mines: 'mine-sound', rocket: 'rocket-sound', plinko: 'volt-sound' }[game] || 'sound';
  $('#' + (game === 'mines' ? 'close' : 'back')).setAttribute('aria-label', '返回游戏大厅');
  relocate($('#' + soundId), settingsBody.querySelector('.mobile-audio-row'));
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'mobile-settings-open';
  gear.setAttribute('aria-label', '游戏设置');
  gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 3-.7 2.4-2.2 1-2.3-.6-2 3.5 1.6 1.8v2.7l-1.6 1.8 2 3.5 2.3-.6 2.2 1L9 22h4l.7-2.5 2.2-1 2.3.6 2-3.5-1.6-1.8v-2.7l1.6-1.8-2-3.5-2.3.6-2.2-1L13 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="11" cy="12.5" r="3" stroke="currentColor" stroke-width="1.5"/></svg>';
  gear.onclick = () => open(settings);
  $('header').append(gear);
  settingsBody.querySelector('.mobile-return-button').onclick = () => { closeSheets(); $('#' + (game === 'mines' ? 'close' : 'back')).click(); };
  const nativeRule = $({ mines: '#menu', rocket: '#rules', matrix: '#rules-open' }[game] || '#no-native-rules');
  let help;
  if (nativeRule) {
    settingsBody.querySelector('.mobile-help-button').onclick = () => { settings.close(); nativeRule.click(); };
  } else {
    help = sheet('玩法与奖励', 'mobile-help');
    settingsBody.querySelector('.mobile-help-button').onclick = () => { settings.close(); open(help); };
    if (game === 'dice') {
      help.querySelector('.mobile-sheet-body').innerHTML = '<p>每局消耗 50 模拟积分，三颗骰子独立随机，按落定后的顶面点数结算。</p><p>大 / 小：小为 4–10 点，大为 11–17 点，三同号不计入大小。指定点数：三颗顶面之和等于所选目标。三同号：三颗顶面完全相同。</p><p>切换目标可查看命中到账积分，奖励包含本局投入。未命中则奖励为 0；转动过程中不能改选。返回大厅后仍会自动结算。</p>';
    } else {
      relocate($(game === 'slots' ? '.paytable' : 'aside details'), help.querySelector('.mobile-sheet-body'));
    }
    if (game === 'slots') help.addEventListener('click', event => { if (event.target.closest('#fx-open')) help.close(); }, true);
  }
  // Language is one control, restored to its desktop position after resizing.
  const moveLanguage = () => {
    const control = $('.language-control');
    if (!control) return;
    relocate(control, settingsBody);
    if (phone.matches) settingsBody.append(control);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', moveLanguage, { once: true });
  else moveLanguage();
  if (game === 'mines') {
    document.body.dataset.embedded = String(window.parent !== window);
    const toolbar = document.createElement('div');
    toolbar.className = 'mobile-board-toolbar';
    $('.progress-track').before(toolbar);
    relocate($('#modes'), toolbar);
    relocate($('.board-instruments'), toolbar);
    relocate($('.sub-actions'), settingsBody);
    $('#round-end').addEventListener('click', () => settings.close(), true);
    // The board uses the remaining height; short screens can still scroll.
    // display:contents keeps the existing desktop grid unchanged.
    const content = document.createElement('div');
    content.className = 'mobile-mine-content';
    $('.play-layout').prepend(content);
    content.append($('.intro'), $('.board-panel'));
    // i18n mounts its selector at DOMContentLoaded, after this script.
  }
  if (game === 'dice') {
    // Keep secondary controls out of the phone's play area, using the same
    // elements so receipts, language state and event handlers are preserved.
    const verification = $('.fairness-strip');
    relocate(verification, settingsBody);
    verification?.addEventListener('click', event => {
      if (event.target.closest('button')) settings.close();
    }, true);
    relocate($('.payout'), $('.action-bar'));
    const chooser = sheet('选择目标总点数', 'dice-target-dialog');
    const options = $('#options');
    const origin = document.createComment('inline dice choices');
    options.before(origin);
    const targetButton = document.createElement('button');
    targetButton.type = 'button';
    targetButton.id = 'sum-open';
    targetButton.className = 'mobile-target-open';
    $('#rule').before(targetButton);
    targetButton.onclick = () => open(chooser);
    const syncTarget = () => {
      const useSheet = phone.matches && document.body.dataset.mode === 'sum';
      if (useSheet) chooser.querySelector('.mobile-sheet-body').append(options);
      else { origin.after(options); chooser.close(); }
      targetButton.hidden = !useSheet;
      targetButton.textContent = (sourceText($('#target-label')) || '指定点数') + ' · 改选 ↗';
      targetButton.disabled = !!$('#modes button').disabled;
    };
    new MutationObserver(syncTarget).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
    new MutationObserver(() => { targetButton.disabled = !!$('#modes button').disabled; }).observe($('#modes'), { subtree: true, attributes: true, attributeFilter: ['disabled'] });
    $('#options').addEventListener('click', event => { if (event.target.closest('[data-sum]')) { syncTarget(); chooser.close(); } });
    $('#modes').addEventListener('click', syncTarget);
    phone.addEventListener('change', syncTarget);
    syncTarget();
  }
  if (game === 'horse') {
    const picker = document.createElement('div');
    picker.className = 'mobile-horse-picker';
    $('#circuit').before(picker);
    relocate($('.selection-title'), picker);
    relocate($('#horses'), picker);
    // Keep the header compact without duplicating the language selector.
    relocate($('#phase'), $('.selection-title'));
  }
  if (game === 'slots' || game === 'matrix') {
    const balance = $('header .balance b');
    if (balance) {
      // Keep long balances intact instead of breaking decimals or covering the title.
      const fitBalance = () => document.body.classList.toggle('wide-slot-balance', sourceText(balance).length > 10);
      new MutationObserver(fitBalance).observe(balance, { childList: true, characterData: true, subtree: true });
      fitBalance();
    }
  }
  let syncSlots = () => {};
  if (game === 'plinko') {
    const entrances = document.createElement('div');
    entrances.className = 'mobile-entrances';
    entrances.innerHTML = '<span>选择发射口</span>';
    $('.launch-dock').prepend(entrances);
    relocate($('#lanes'), entrances);
    const slots = $('#slots');
    syncSlots = () => slots.querySelectorAll('[data-slot]').forEach(node => {
      if (phone.matches) {
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
        node.setAttribute('aria-label', '查看第 ' + (Number(node.dataset.slot) + 1) + ' 槽 ' + node.textContent + ' 奖励与概率');
      } else {
        node.removeAttribute('role'); node.removeAttribute('tabindex'); node.removeAttribute('aria-label');
      }
    });
    const explain = event => {
      const slot = event.target.closest('[data-slot]');
      if (!slot || !phone.matches || !help) return;
      let note = $('#mobile-slot-note');
      if (!note) { note = document.createElement('p'); note.id = 'mobile-slot-note'; note.className = 'mobile-slot-note'; help.querySelector('.mobile-sheet-body').prepend(note); }
      const column = $('#probability-chart').children[Number(slot.dataset.slot)];
      const multiplier = Number(slot.textContent.replace('×', ''));
      note.textContent = (window.PlayroomI18n?.sourceAttribute(column, 'aria-label') ?? column.getAttribute('aria-label')) + '。投入 50 积分，到账 ' + (multiplier * 50) + ' 积分，净收益 ' + (multiplier * 50 - 50) + ' 积分。';
      open(help);
    };
    slots.addEventListener('click', explain);
    slots.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); explain(event); } });
  }
  if (game === 'matrix') {
    const lines = $('#winning-lines');
    const details = document.createElement('details');
    details.className = 'mobile-win-details';
    const summary = document.createElement('summary');
    details.append(summary);
    lines.before(details);
    details.append(lines);
    const syncWins = () => {
      details.hidden = !lines.children.length;
      summary.textContent = '本局奖励明细 · ' + lines.children.length + ' 项';
      details.open = !phone.matches;
    };
    new MutationObserver(syncWins).observe(lines, { childList: true });
    phone.addEventListener('change', syncWins);
    syncWins();
  }
  // Existing result/guide dialogs get the same safe-area and close target sizing.
  document.querySelectorAll('dialog').forEach(dialog => dialog.classList.add('mobile-compatible-dialog'));
  if (game === 'rocket') {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mobile-native-close';
    close.setAttribute('aria-label', '关闭弹窗');
    close.textContent = '×';
    close.onclick = () => $('#dialog').close();
    $('#dialog').prepend(close);
  }
  function layout() {
    closeSheets();
    for (const { node, marker, destination } of relocations) {
      if (phone.matches) destination.append(node);
      else marker.after(node);
    }
    if (help) help.querySelectorAll('details').forEach(details => { details.open = phone.matches; });
    syncSlots();
  }
  phone.addEventListener('change', layout);
  layout();
  // A modal must never let a document-level Space shortcut start a paid round.
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && $('dialog[open]') && !event.target.closest('button,a,summary,input,select,textarea')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  let platformPaused = false;
  const pause = () => {
    document.body.classList.toggle('mobile-presentation-paused', document.hidden || platformPaused);
    if (document.hidden || platformPaused) closeSheets();
  };
  document.addEventListener('visibilitychange', pause);
  window.addEventListener('message', event => {
    if (event.source === parent && event.origin === location.origin && event.data?.type === 'platform-pause') { platformPaused = !!event.data.paused; pause(); }
  });
  pause();
})();

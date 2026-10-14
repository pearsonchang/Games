'use strict';

// One cancellable timer, shared by all lobby mounts. No game or wallet state is read.
class ShowcaseRotation {
  constructor({advance, canRun, schedule = (fn, delay) => setTimeout(fn, delay), cancel = id => clearTimeout(id), delay = 6500}) {
    Object.assign(this, {advance, canRun, schedule, cancel, delay});
    this.timer = null;
    this.destroyed = false;
  }
  start() {
    this.stop();
    if (this.destroyed || !this.canRun()) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      if (this.destroyed || !this.canRun()) return;
      this.advance();
      this.start();
    }, this.delay);
  }
  stop() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }
  destroy() { this.stop(); this.destroyed = true; }
}
if (typeof module !== 'undefined' && module.exports) module.exports = {ShowcaseRotation};

if (typeof window !== 'undefined') (() => {
  let currentId = 'matrix', autoplay = true, mounted = null;
  window.LobbyShowcase = {
    get currentId() { return currentId; },
    mount(root) {
      mounted?.destroy();
      mounted = null;
      const region = root.querySelector('[data-lobby-showcase]');
      if (!region) return;
      const track = region.querySelector('.energy-showcase-track');
      const slides = [...track.children];
      const dots = [...region.querySelectorAll('[data-showcase-index]')];
      const toggle = region.querySelector('[data-showcase-toggle]');
      const counter = region.querySelector('[data-showcase-counter]');
      const status = region.querySelector('[data-showcase-status]');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const hover = matchMedia('(hover: hover)');
      const listeners = [];
      let index = Math.max(0, slides.findIndex(slide => slide.dataset.featured === currentId));
      let intersecting = false, hovering = false, touching = false, suspended = false;
      let scrollFrame = 0, resizeFrame = 0, scrollTarget = null, manualScrolling = false;
      const listen = (node, event, fn, options) => { node.addEventListener(event, fn, options); listeners.push(() => node.removeEventListener(event, fn, options)); };
      const motion = () => !reduced.matches && document.documentElement.dataset.festivalMotion !== 'off';
      const canRun = () => autoplay && motion() && intersecting && !hovering && !touching && !suspended && !document.hidden && (!region.contains(document.activeElement) || document.activeElement === toggle);
      const sync = (announce = false) => {
        currentId = slides[index].dataset.featured;
        slides.forEach((slide, i) => {
          slide.inert = i !== index;
          slide.setAttribute('aria-hidden', String(i !== index));
        });
        dots.forEach((dot, i) => {
          if (i === index) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
        counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
        toggle.disabled = !motion();
        toggle.setAttribute('aria-pressed', String(autoplay && motion()));
        toggle.setAttribute('aria-label', !motion() ? '已减少动态效果，手动切换游戏' : autoplay ? '暂停自动轮播' : '开启自动轮播');
        toggle.innerHTML = autoplay && motion() ? '<span aria-hidden="true">Ⅱ</span>' : '<span aria-hidden="true">▶</span>';
        region.classList.toggle('is-rotating', canRun());
        if (announce) status.textContent = `第 ${index + 1} / ${slides.length} 款：${slides[index].dataset.gameName}`;
      };
      const rotation = new ShowcaseRotation({canRun, advance: () => select(index + 1, false)});
      const refresh = () => { sync(); rotation.start(); };
      const stopAutoplay = () => { autoplay = false; refresh(); };
      function select(next, manual = true) {
        if (manual) autoplay = false;
        const previous = index;
        index = (next % slides.length + slides.length) % slides.length;
        manualScrolling = false;
        scrollTarget = index;
        sync(manual);
        track.scrollTo({left: index * track.clientWidth, behavior: motion() && Math.abs(previous - index) === 1 ? 'smooth' : 'auto'});
        rotation.start();
      }
      region.querySelector('[data-showcase-prev]').onclick = () => select(index - 1);
      region.querySelector('[data-showcase-next]').onclick = () => select(index + 1);
      dots.forEach((dot, i) => { dot.onclick = () => select(i); });
      toggle.onclick = () => { autoplay = !autoplay; refresh(); };
      listen(track, 'keydown', event => {
        if (event.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        select(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1));
      });
      listen(track, 'scroll', () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          if (scrollTarget !== null) {
            if (Math.abs(track.scrollLeft - scrollTarget * track.clientWidth) < 1) scrollTarget = null;
            return;
          }
          const nearest = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
          if (nearest !== index) { index = nearest; sync(manualScrolling); }
        });
      }, {passive: true});
      // Native scrolling supplies inertia and cancels a CTA tap when it becomes a swipe.
      listen(track, 'pointerdown', () => { scrollTarget = null; manualScrolling = true; touching = true; stopAutoplay(); }, {passive: true});
      listen(track, 'wheel', event => {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) { scrollTarget = null; manualScrolling = true; stopAutoplay(); }
      }, {passive: true});
      const release = () => { touching = false; refresh(); };
      listen(window, 'pointerup', release, {passive: true});
      listen(window, 'pointercancel', release, {passive: true});
      listen(region, 'pointerenter', () => { if (hover.matches) { hovering = true; refresh(); } });
      listen(region, 'pointerleave', () => { hovering = false; refresh(); });
      listen(region, 'focusin', refresh);
      listen(region, 'focusout', () => queueMicrotask(refresh));
      listen(document, 'visibilitychange', refresh);
      listen(document, 'lobby-motion-change', refresh);
      listen(reduced, 'change', refresh);
      const observer = new IntersectionObserver(entries => { intersecting = entries[0].isIntersecting && entries[0].intersectionRatio >= .5; refresh(); }, {threshold: [0, .5]});
      observer.observe(region);
      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; scrollTarget = null; track.scrollTo({left: index * track.clientWidth, behavior: 'auto'}); });
      });
      resize.observe(track);
      track.scrollTo({left: index * track.clientWidth, behavior: 'auto'});
      sync();
      mounted = {
        suspend() { suspended = true; refresh(); },
        destroy() {
          suspended = true;
          rotation.destroy();
          observer.disconnect(); resize.disconnect();
          cancelAnimationFrame(scrollFrame); cancelAnimationFrame(resizeFrame);
          listeners.forEach(remove => remove());
        }
      };
    },
    suspend() { mounted?.suspend(); }
  };
})();

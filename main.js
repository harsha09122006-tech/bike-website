/**
 * NOCTIS — Main JavaScript (Fixed & Optimized Edition)
 * Fixes: frame-template missing method, preloader tracking, lineup debounce,
 *         reservation dialog, mobile navigation, reduced motion, grain/cursor.
 *
 * Screen reader friendly. Keyboard accessible. No critical JavaScript errors.
 */

import CONFIG from './config.js';

/* ════════════════════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════════════════ */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isMobile = () => window.innerWidth < CONFIG.MOBILE_BREAKPOINT;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPointerFine = window.matchMedia('(pointer: fine)').matches;

function padFrame(n) {
  return String(n).padStart(CONFIG.FRAME_PAD, '0');
}

function frameURL(template, n) {
  return template.replace('{n}', padFrame(n));
}

/* ════════════════════════════════════════════════════════════════════════════
   CANVAS HIGH-DPI SETUP
═══════════════════════════════════════════════════════════════════════════ */
function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  canvas.width = Math.max(rect.width, 1) * dpr;
  canvas.height = Math.max(rect.height, 1) * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { ctx, dpr };
}

/* ════════════════════════════════════════════════════════════════════════════
   CUSTOM CURSOR (headlight — pointer:fine / desktop only)
═══════════════════════════════════════════════════════════════════════════ */
(function initCursor() {
  document.body.classList.add('native-cursor');
})();

/* ════════════════════════════════════════════════════════════════════════════
   FRAME SEQUENCER (Hybrid Loader + Procedural Fallback)
═══════════════════════════════════════════════════════════════════════════ */
class FrameSequencer {
  constructor({ canvas, totalFrames, desktopTemplate, mobileTemplate }) {
    this.canvas   = canvas;
    this.total    = totalFrames;
    this.dTemplate = desktopTemplate;
    this.mTemplate = mobileTemplate;
    this.loadedTemplate = this.template();

    // Frame state with a bounded decoded-image cache.
    this.frames = new Array(totalFrames).fill(null);
    this.available = new Uint8Array(totalFrames); // 0=not loaded, 1=ready, 2=broken
    this.loading = new Array(totalFrames).fill(null);
    this.loadGeneration = 0;
    this.frameCache = new Map();
    this.frameCacheLimit = 48;
    this.protectedFrameRange = null;
    this.prefetchCenter = -Infinity;

    // Animation state
    this.currentF = 0;
    this.targetF  = 0;
    this.lastDrawn = -1;
    this.lastRenderedIndex = -1;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Setup canvas
    const setup = setupCanvas(canvas);
    if (!setup) {
      // No canvas context — use procedural fallback only
      this.ctx = null;
      return;
    }
    this.ctx = setup.ctx;
    this.dpr = setup.dpr;

    // Pre-allocate drawing buffer for procedural fallback
    this._fallbackCanvas = document.createElement('canvas');
    this._fallbackCanvas.width = 1600;
    this._fallbackCanvas.height = 900;
    this._fallbackCtx = this._fallbackCanvas.getContext('2d');

    this._setupListeners();
  }

  /** Select the correct frame template based on viewport */
  template() {
    return isMobile() ? this.mTemplate : this.dTemplate;
  }

  _setupListeners() {
    window.addEventListener('resize', () => {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(rect.width, 1) * this.dpr;
      this.canvas.height = Math.max(rect.height, 1) * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const nextTemplate = this.template();
      if (nextTemplate !== this.loadedTemplate) {
        this.loadedTemplate = nextTemplate;
        this.loadGeneration++;
        this.frames.fill(null);
        this.available.fill(0);
        this.loading.fill(null);
        this.frameCache.clear();
        this.protectedFrameRange = null;
        this.prefetchCenter = -Infinity;
        this.lastDrawn = -1;
        this.lastRenderedIndex = -1;

        const currentFrame = clamp(Math.round(this.currentF) + 1, 1, this.total);
        this.loadFrame(currentFrame);
        this.loadRange(1, Math.min(CONFIG.PRELOAD_FIRST_BATCH, this.total));
      }

      this._drawFrame(Math.round(this.currentF));
    });
  }

  loadFrame(n) {
    if (!Number.isInteger(n) || n < 1 || n > this.total) {
      throw new RangeError(`Frame index out of range: ${n}`);
    }

    const index = n - 1;
    if (this.available[index] === 1) {
      this.frameCache.delete(index);
      this.frameCache.set(index, this.frames[index]);
      return Promise.resolve(true);
    }
    if (this.loading[index]) return this.loading[index];

    const img = new Image();
    const generation = this.loadGeneration;
    const url = frameURL(this.template(), n);
    this.loading[index] = new Promise(resolve => {
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        if (generation === this.loadGeneration) {
          this.available[index] = 2;
          this.loading[index] = null;
          console.error(`Unable to load animation frame ${url}`, error);
        }
        resolve(false);
      };

      img.onload = async () => {
        try {
          await img.decode();
        } catch (error) {
          fail(error);
          return;
        }

        if (settled) return;
        settled = true;
        if (generation === this.loadGeneration) {
          this.frames[index] = img;
          this.available[index] = 1;
          this.frameCache.set(index, img);
          this._trimFrameCache();
          this.loading[index] = null;
        }
        resolve(generation === this.loadGeneration);
      };
      img.onerror = () => fail(new Error('Image request failed'));
      img.src = url;
    });

    return this.loading[index];
  }

  async loadRange(start, end, onProgress = () => {}) {
    const first = clamp(start, 1, this.total);
    const last = clamp(end, first, this.total);
    const total = last - first + 1;
    let results = [];
    let chunkStart = first;
    let generation = this.loadGeneration;

    while (chunkStart <= last) {
      const chunkEnd = Math.min(chunkStart + 11, last);
      const chunk = await Promise.all(
        Array.from({ length: chunkEnd - chunkStart + 1 }, (_, index) =>
          this.loadFrame(chunkStart + index)
        )
      );

      if (generation !== this.loadGeneration) {
        generation = this.loadGeneration;
        results = [];
        chunkStart = first;
        continue;
      }

      results.push(...chunk);
      onProgress(results.length, total, results.filter(Boolean).length);
      chunkStart = chunkEnd + 1;
    }

    return results;
  }

  /** Get nearest loaded frame index for fallback */
  getNearestLoaded(targetIndex) {
    if (this.available[targetIndex] === 1) return targetIndex;
    for (let d = 1; d < this.total; d++) {
      const back = targetIndex - d;
      const forward = targetIndex + d;
      if (back >= 0 && this.available[back] === 1) return back;
      if (forward < this.total && this.available[forward] === 1) return forward;
    }
    return -1;
  }

  isReady(idx) {
    return this.available[idx] === 1;
  }

  _trimFrameCache() {
    while (this.frameCache.size > this.frameCacheLimit) {
      const { protectedFrameRange } = this;
      const evictIndex = Array.from(this.frameCache.keys()).find(index =>
        !protectedFrameRange || index < protectedFrameRange.start || index > protectedFrameRange.end
      );
      if (evictIndex === undefined) return;

      this.frameCache.delete(evictIndex);
      this.frames[evictIndex] = null;
      this.available[evictIndex] = 0;
    }
  }

  _requestNearbyFrames(targetIndex) {
    const radius = 8;
    const start = Math.max(0, targetIndex - radius);
    const end = Math.min(this.total - 1, targetIndex + radius);
    this.protectedFrameRange = { start, end };
    this._trimFrameCache();

    if (Math.abs(targetIndex - this.prefetchCenter) < 4) return;
    this.prefetchCenter = targetIndex;

    for (let index = start; index <= end; index++) {
      if (this.available[index] === 0 && !this.loading[index]) {
        this.loadFrame(index + 1);
      }
    }
  }

  setProgress(p) {
    this.targetF = clamp(p, 0, 1) * (this.total - 1);
  }

  tick() {
    if (!this.ctx) return;
    this.currentF = lerp(this.currentF, this.targetF, CONFIG.CANVAS_LERP);
    const fi = Math.round(this.currentF);
    this._requestNearbyFrames(fi);
    if (fi !== this.lastDrawn ||
        (this.available[fi] === 1 && this.lastRenderedIndex !== fi)) {
      this._drawFrame(fi);
      this.lastDrawn = fi;
    }
  }

  _drawFrame(fi) {
    const ctx = this.ctx;
    if (!ctx) return;

    // Find nearest loaded frame
    const loadedIdx = this.getNearestLoaded(fi);
    const img = loadedIdx >= 0 ? this.frames[loadedIdx] : null;
    const cw = this.canvas.offsetWidth;
    const ch = this.canvas.offsetHeight;

    if (loadedIdx >= 0) {
      this.frameCache.delete(loadedIdx);
      this.frameCache.set(loadedIdx, img);
    }

    if (!img) {
      this._drawProceduralFallback();
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(this._fallbackCanvas, 0, 0, cw, ch);
      this.lastRenderedIndex = -1;
      return;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#07080A';
    ctx.fillRect(0, 0, cw, ch);

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    if (iw === 0 || ih === 0) {
      this._drawProceduralFallback();
      ctx.drawImage(this._fallbackCanvas, 0, 0, cw, ch);
      this.lastRenderedIndex = -1;
      return;
    }

    const scale = window.innerHeight > window.innerWidth
      ? Math.min(cw / iw, ch / ih)
      : Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    this.lastRenderedIndex = loadedIdx;
  }

  /** Draw procedural fallback: matte silhouette with xenon/taillight */
  _drawProceduralFallback() {
    const canvas = this._fallbackCanvas;
    const ctx = this._fallbackCtx;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = '#07080A';
    ctx.fillRect(0, 0, W, H);

    ctx.save();

    // Bike body
    const bodyX = W * 0.25;
    const bodyY = H * 0.32;
    const bodyW = W * 0.5;
    const bodyH = H * 0.32;
    ctx.fillStyle = '#121418';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

    // Wheels
    ctx.fillStyle = '#0A0A0A';
    const wheelY = H * 0.68;
    ctx.fillRect(W * 0.15, wheelY - 8, 20, 40);
    ctx.fillRect(W * 0.70, wheelY - 8, 20, 40);

    // Front wheel spokes (subtle)
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.25, wheelY);
      ctx.lineTo(W * 0.25 + Math.cos(angle) * 12, wheelY + Math.sin(angle) * 12);
      ctx.stroke();
    }

    // Headlight (xenon)
    ctx.fillStyle = '#CFE3FF';
    ctx.fillRect(W * 0.28, H * 0.30, 12, 7);

    // Tail light (red)
    ctx.fillStyle = '#E1251B';
    ctx.fillRect(W * 0.68, H * 0.68, 6, 14);

    // Ground reflection
    ctx.fillStyle = 'rgba(207, 227, 255, 0.06)';
    ctx.fillRect(W * 0.20, H * 0.88, W * 0.6, 5);

    ctx.restore();
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   PRELOADER
═══════════════════════════════════════════════════════════════════════════ */
const preloader     = document.getElementById('preloader');
const lineFill      = document.getElementById('preloader-line-fill');
const counter       = document.getElementById('preloader-counter');
const preloaderStatus = document.getElementById('preloader-status');

let preloadPercent = 0;
let pageRevealed = false;
const preloaderStartedAt = performance.now();
const PRELOADER_MIN_DURATION = 850;

function updatePreloader(pct) {
  preloadPercent = Math.min(pct, 100);
  lineFill.style.width = preloadPercent + '%';
  counter.textContent = String(Math.floor(preloadPercent)).padStart(3, '0');
}

/** Reveal the page after minimum assets are available */
function revealPage() {
  if (pageRevealed) return;
  pageRevealed = true;
  lineFill.classList.add('bright');
  const remaining = Math.max(
    0,
    PRELOADER_MIN_DURATION - (performance.now() - preloaderStartedAt)
  );
  setTimeout(() => {
    preloader.classList.add('hidden');
    setTimeout(startMainLoop, 600);
  }, remaining);
}

/* ════════════════════════════════════════════════════════════════════════════
   HERO SEQUENCER & PRELOADER
═══════════════════════════════════════════════════════════════════════════ */
const heroCanvas = document.getElementById('hero-canvas');
const heroSeq = new FrameSequencer({
  canvas: heroCanvas,
  totalFrames: CONFIG.HERO_FRAME_COUNT,
  desktopTemplate: CONFIG.HERO_FRAMES_DESKTOP,
  mobileTemplate: CONFIG.HERO_FRAMES_MOBILE,
});

/* ════════════════════════════════════════════════════════════════════════════
   DISMANTLE SEQUENCER
═══════════════════════════════════════════════════════════════════════════ */
const dismantleCanvas = document.getElementById('dismantle-canvas');
const dismantleLoader = new FrameSequencer({
  canvas: dismantleCanvas,
  totalFrames: CONFIG.DISMANTLE_FRAME_COUNT,
  desktopTemplate: CONFIG.DISMANTLE_FRAMES_DESKTOP,
  mobileTemplate: CONFIG.DISMANTLE_FRAMES_MOBILE,
});

async function preloadStoryboardFrames() {
  const firstBatchEnd = Math.min(CONFIG.PRELOAD_FIRST_BATCH, heroSeq.total);
  const initialFrameCount = prefersReducedMotion ? 1 : firstBatchEnd;
  const firstBatch = await heroSeq.loadRange(1, initialFrameCount, (loaded, total, ready) => {
    updatePreloader((loaded / total) * 100);
    preloaderStatus.textContent = ready === loaded
      ? 'Loading hero frames…'
      : `Loading hero frames · ${loaded - ready} unavailable`;
  });
  const initialFailures = firstBatch.filter(loaded => !loaded).length;

  updatePreloader(100);
  if (initialFailures) {
    preloaderStatus.textContent = `${initialFailures} frames unavailable · continuing`;
  }
  revealPage();
}

preloadStoryboardFrames().catch(error => {
  console.error('Unable to preload the NOCTIS animation frames.', error);
  preloaderStatus.textContent = 'Frame loading error · continuing';
  updatePreloader(100);
  revealPage();
});

/* ════════════════════════════════════════════════════════════════════════════
   NAV — hide on scroll down, show on scroll up
═══════════════════════════════════════════════════════════════════════════ */
(function initMeteorExplodedView() {
  const stage = document.getElementById('meteor-stage');
  const artwork = document.getElementById('meteor-exploded-view');
  const toggle = document.getElementById('meteor-toggle');
  const toggleLabel = toggle?.querySelector('.meteor-toggle-label');
  const toggleState = toggle?.querySelector('.meteor-toggle-state');
  if (!stage || !artwork || !toggle || !toggleLabel || !toggleState) return;

  const parts = Array.from(artwork.querySelectorAll('.meteor-part'));
  let hovered = false;
  let dragging = false;
  let pinned = false;
  let pointerX = 0;
  let pointerY = 0;

  function render() {
    const active = hovered || dragging || pinned;
    const rect = artwork.getBoundingClientRect();
    const scale = Math.max(rect.width / 1010, 0.48);
    const intensity = active ? 0.82 : 0;

    stage.classList.toggle('is-exploded', active);
    stage.classList.toggle('is-dragging', dragging);

    parts.forEach(part => {
      const x = Number(part.dataset.dx) + pointerX * 10;
      const y = Number(part.dataset.dy) + pointerY * 10;
      part.style.transform = `translate3d(${x * scale * intensity}px, ${y * scale * intensity}px, 0)`;
    });
  }

  function updatePointer(event) {
    const rect = artwork.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    render();
  }

  artwork.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    updatePointer(event);
  });

  artwork.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && !dragging) return;
    if (event.pointerType !== 'touch') hovered = true;
    updatePointer(event);
  });

  artwork.addEventListener('pointerleave', event => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    render();
  });

  artwork.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    dragging = true;
    artwork.setPointerCapture(event.pointerId);
    updatePointer(event);
  });

  function releaseTouch(event) {
    if (event.pointerType !== 'touch') return;
    dragging = false;
    if (artwork.hasPointerCapture(event.pointerId)) {
      artwork.releasePointerCapture(event.pointerId);
    }
    render();
  }

  artwork.addEventListener('pointerup', releaseTouch);
  artwork.addEventListener('pointercancel', releaseTouch);

  toggle.addEventListener('click', () => {
    pinned = !pinned;
    toggle.setAttribute('aria-pressed', String(pinned));
    toggleLabel.textContent = pinned ? 'RETURN TO ASSEMBLY' : 'EXPLODED VIEW';
    toggleState.textContent = pinned ? '−' : '+';
    render();
  });

  window.addEventListener('blur', () => {
    hovered = false;
    dragging = false;
    render();
  });
  window.addEventListener('resize', render, { passive: true });

  render();
})();

(function initNav() {
  const nav = document.getElementById('nav');
  const navLinks = document.getElementById('nav-links');
  const hamburger = document.getElementById('nav-hamburger');
  const navClose = document.getElementById('nav-close');
  const mobileNav = window.matchMedia('(max-width: 767px)');

  let lastY = 0;
  let ticking = false;

  function setMobileMenuOpen(open) {
    navLinks.classList.toggle('visible', open);
    navLinks.inert = mobileNav.matches && !open;
    nav.classList.toggle('mobile-open', open);
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navClose.inert = !open;
  }

  // Hamburger menu
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      setMobileMenuOpen(!navLinks.classList.contains('visible'));
    });
  }

  if (navClose) {
    navClose.addEventListener('click', () => setMobileMenuOpen(false));
  }

  setMobileMenuOpen(false);
  mobileNav.addEventListener('change', () => setMobileMenuOpen(false));

  // Close menu on link click
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      setMobileMenuOpen(false);
    });
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('mobile-open')) {
      setMobileMenuOpen(false);
      hamburger.focus();
    }
  });

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y > lastY && y > CONFIG.NAV_SCROLL_THRESHOLD) {
        nav.classList.add('hidden');
      } else {
        nav.classList.remove('hidden');
      }
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
})();

/* ════════════════════════════════════════════════════════════════════════════
   LINE REVEAL — IntersectionObserver
═══════════════════════════════════════════════════════════════════════════ */
function revealLines(container, stagger = 0.08) {
  const inners = container.querySelectorAll('.line-reveal-inner');
  inners.forEach((el, i) => {
    setTimeout(() => el.classList.add('revealed'), i * stagger * 1000);
  });
}

const lineObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      revealLines(entry.target);
      lineObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.2 });

['#section-statement',
  '#section-lineup .lineup-header',
  '#section-reserve',
  '#section-dismantle .section-title'
].forEach(selector => {
  const el = document.querySelector(selector);
  if (el) lineObserver.observe(el);
});

/* ════════════════════════════════════════════════════════════════════════════
   STATEMENT SECTION — word-by-word scroll reveal
═══════════════════════════════════════════════════════════════════════════ */
(function initStatement() {
  const container = document.getElementById('statement-words');
  const sentence = 'Every part was designed to disappear into one line of light.';
  const words = sentence.split(' ');

  words.forEach(w => {
    const span = document.createElement('span');
    span.className = 'statement-word';
    span.textContent = w;
    container.appendChild(span);
  });

  const allWords = container.querySelectorAll('.statement-word');

  function updateStatementProgress() {
    const rect = document.getElementById('section-statement').getBoundingClientRect();
    const progress = clamp(1 - (rect.bottom / (window.innerHeight + rect.height)), 0, 1);
    allWords.forEach((w, i) => {
      const threshold = (i + 1) / allWords.length;
      if (progress > threshold) w.classList.add('lit');
      else w.classList.remove('lit');
    });
  }

  window.addEventListener('scroll', updateStatementProgress, { passive: true });
  updateStatementProgress();
})();

/* ════════════════════════════════════════════════════════════════════════════
   LINEUP SECTION — hover accordion (fixed debounce)
═══════════════════════════════════════════════════════════════════════════ */
(function initLineup() {
  const container = document.getElementById('lineup-slides');
  const colorNames = ['Yellow', 'Blue', 'Red', 'Green', 'Orange'];
  let openIdx = 0;  // Meteor 350 open by default

  // Working debounce with setTimeout
  let debounceTimeout = null;
  let debouncePending = -1;
  const DEBOUNCE_MS = 80;

  function scheduleOpen(idx) {
    debouncePending = idx;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      if (debouncePending !== -1 && debouncePending !== openIdx) {
        openSlide(debouncePending);
      }
    }, DEBOUNCE_MS);
  }

  function cancelDebounce() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    debouncePending = -1;
  }

  CONFIG.LINEUP_MODELS.forEach((model, idx) => {
    const slide = document.createElement('div');
    slide.className = 'lineup-slide' + (model.isDefault ? ' open' : '');
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `${model.num} ${model.name}`);
    slide.dataset.idx = idx;
    slide.dataset.color = model.activeColor;
    slide.dataset.cursor = model.isDefault ? 'CONFIGURE' : 'OPEN';
    slide.dataset.cursorLabel = model.isDefault ? 'CONFIGURE' : 'OPEN';

    const closed = document.createElement('button');
    closed.type = 'button';
    closed.className = 'slide-closed';
    closed.setAttribute('aria-expanded', model.isDefault ? 'true' : 'false');
    closed.setAttribute('aria-label', `${model.isDefault ? 'Configure' : 'Open'} ${model.name}`);
    closed.setAttribute('aria-hidden', model.isDefault ? 'true' : 'false');
    closed.inert = model.isDefault;
    closed.innerHTML = `
      <span class="slide-num">${model.num}</span>
      <span class="slide-name-rotated">${model.name}</span>
      <img class="slide-thumb"
           src="${model.img}"
           alt=""
           aria-hidden="true"
           loading="lazy"
           width="300" height="300" />
    `;

    const swatchHTML = model.swatches.map((c, si) =>
      `<button type="button" class="swatch${si === model.activeColor ? ' active' : ''}"
             style="background:${c}"
             data-swatch="${si}"
             role="radio"
             aria-label="${colorNames[si]} paint"
             aria-checked="${si === model.activeColor}"
             tabindex="${si === model.activeColor ? '0' : '-1'}"></button>`
    ).join('');

    const open = document.createElement('div');
    open.className = 'slide-open';
    open.setAttribute('aria-hidden', String(!model.isDefault));
    open.inert = !model.isDefault;
    open.innerHTML = `
      <div class="floor-line" aria-hidden="true"></div>
      <img class="slide-bike-img"
           src="${model.img}"
           alt="${model.name} — ${model.desc}; temporary reference image"
           loading="lazy"
           width="900" height="506" />
      <div class="slide-content">
        <h3 class="slide-model-name">
          <button type="button" class="slide-open-toggle"
                  aria-expanded="${model.isDefault}"
                  aria-label="Configure ${model.name}"
                  data-cursor-label="${model.isDefault ? 'CONFIGURE' : 'OPEN'}">
            <span class="line-reveal"><span class="line-reveal-inner">${model.name}</span></span>
          </button>
        </h3>
        <p class="slide-desc">${model.desc}</p>
        <div class="slide-specs">
          <div class="slide-spec">
            <span class="slide-spec-key">Range</span>
            <span class="slide-spec-val">${model.range}</span>
          </div>
          <div class="slide-spec">
            <span class="slide-spec-key">0–100 KM/H</span>
            <span class="slide-spec-val">${model.sprint}</span>
          </div>
          <div class="slide-spec">
            <span class="slide-spec-key">Power</span>
            <span class="slide-spec-val">${model.power}</span>
          </div>
        </div>
        <div class="slide-swatches" role="radiogroup" aria-label="Colour options">${swatchHTML}</div>
        <a href="#section-reserve" class="slide-cta" data-cursor-label="RESERVE">Configure →</a>
      </div>
    `;

    slide.appendChild(closed);
    slide.appendChild(open);
    container.appendChild(slide);

    closed.addEventListener('click', () => openSlide(idx, true));
    open.querySelector('.slide-open-toggle').addEventListener('click', () => openSlide(idx, true));

    // Swatch keyboard accessibility
    const swatches = open.querySelectorAll('.swatch');
    swatches.forEach((sw, si) => {
      sw.addEventListener('click', e => {
        e.stopPropagation();
        swatches.forEach(s => {
          s.classList.remove('active');
          s.setAttribute('aria-checked', 'false');
          s.tabIndex = -1;
        });
        sw.classList.add('active');
        sw.setAttribute('aria-checked', 'true');
        sw.tabIndex = 0;
        CONFIG.LINEUP_MODELS[idx].activeColor = si;
        slide.dataset.color = si;
      });

      sw.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = Math.min(si + 1, swatches.length - 1);
          swatches[nextIdx].focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIdx = Math.max(si - 1, 0);
          swatches[prevIdx].focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          swatches[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          swatches[swatches.length - 1].focus();
        } else if (e.key === ' ') {
          e.preventDefault();
          sw.click();
        }
      });
    });
  });

  const slides = Array.from(container.querySelectorAll('.lineup-slide'));

  function openSlide(idx, focus = false) {
    if (idx === openIdx) return;
    const prev = slides[openIdx];
    const next = slides[idx];

    if (prev) {
      prev.classList.remove('open');
      prev.querySelector('.slide-closed').inert = false;
      prev.querySelector('.slide-closed').setAttribute('aria-hidden', 'false');
      prev.querySelector('.slide-closed').setAttribute('aria-expanded', 'false');
      prev.querySelector('.slide-open').inert = true;
      prev.querySelector('.slide-open').setAttribute('aria-hidden', 'true');
      prev.querySelector('.slide-open-toggle').setAttribute('aria-expanded', 'false');
      prev.querySelector('.slide-open-toggle').setAttribute('aria-label', `Open ${CONFIG.LINEUP_MODELS[openIdx].name}`);
      prev.dataset.cursorLabel = 'OPEN';
    }

    openIdx = idx;

    next.classList.add('open');
    next.querySelector('.slide-closed').inert = true;
    next.querySelector('.slide-closed').setAttribute('aria-hidden', 'true');
    next.querySelector('.slide-closed').setAttribute('aria-expanded', 'true');
    next.querySelector('.slide-open').inert = false;
    next.querySelector('.slide-open').setAttribute('aria-hidden', 'false');
    next.querySelector('.slide-open-toggle').setAttribute('aria-expanded', 'true');
    next.querySelector('.slide-open-toggle').setAttribute('aria-label', `Configure ${CONFIG.LINEUP_MODELS[idx].name}`);
    next.dataset.cursorLabel = 'CONFIGURE';
    if (focus) next.querySelector('.slide-open-toggle').focus();

    requestAnimationFrame(() => {
      const inner = next.querySelector('.slide-open');
      if (!inner) return;
      inner.querySelectorAll('.line-reveal-inner').forEach((l, i) => {
        l.classList.remove('revealed');
        setTimeout(() => l.classList.add('revealed'), i * 60);
      });
    });
  }

  slides.forEach((slide, i) => {
    slide.addEventListener('mouseenter', () => {
      if (!isMobile() && isPointerFine) scheduleOpen(i);
    });
    slide.addEventListener('mouseleave', e => {
      if (!e.relatedTarget || !e.relatedTarget.closest('#lineup-slides')) {
        cancelDebounce();
      }
    });
    slide.addEventListener('keydown', e => {
      if (e.target.closest('.swatch')) return;

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const n = Math.min(i + 1, slides.length - 1);
          openSlide(n, true);
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const p = Math.max(i - 1, 0);
          openSlide(p, true);
          break;
        }
        case 'Home': {
          e.preventDefault();
          openSlide(0, true);
          break;
        }
        case 'End': {
          e.preventDefault();
          openSlide(slides.length - 1, true);
          break;
        }
      }
    });
  });

  // Entrance animation
  const lineupObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      slides.forEach((slide, i) => {
        setTimeout(() => slide.classList.add('entered'), i * 80);
      });
      lineupObserver.disconnect();
    });
  }, { threshold: 0.1 });
  lineupObserver.observe(container);

  // Reveal default slide text
  requestAnimationFrame(() => {
    const inner = slides[0]?.querySelector('.slide-open');
    if (!inner) return;
    inner.querySelectorAll('.line-reveal-inner').forEach((l, i) => {
      setTimeout(() => l.classList.add('revealed'), i * 60);
    });
  });
})();

/* ════════════════════════════════════════════════════════════════════════════
   RESERVED DIALOG — Reservation inquiry form
═══════════════════════════════════════════════════════════════════════════ */
(function initReservation() {
  const reserveBtn = document.getElementById('reserve-btn');
  const reserveOverlay = document.getElementById('reserve-overlay');
  const reserveForm = document.getElementById('reserve-form');
  const reserveClose = document.getElementById('reserve-close');
  const reserveCancel = document.getElementById('reserve-cancel');
  const reserveSubmit = document.getElementById('reserve-submit');
  const reserveStatus = document.getElementById('reserve-endpoint-status');
  const reserveFields = reserveForm.querySelectorAll('input, textarea, select');
  const endpointValue = reserveForm.dataset.endpoint.trim();
  let endpoint = '';
  try {
    const parsedEndpoint = new URL(endpointValue);
    if (parsedEndpoint.protocol === 'https:' ||
        (parsedEndpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedEndpoint.hostname))) {
      endpoint = parsedEndpoint.href;
    }
  } catch {
    endpoint = '';
  }
  const endpointConfigured = Boolean(endpoint);
  if (endpointValue && !endpointConfigured) {
    console.error('Reservation endpoint must be a valid HTTPS URL or a localhost development URL.');
  }
  let previouslyFocused = null;
  const endpointUnavailableMessage = endpointValue && !endpointConfigured
    ? 'The booking service URL is invalid. Please contact the site administrator.'
    : 'Reservations are unavailable until the booking service is configured.';

  reserveOverlay.inert = true;
  reserveSubmit.disabled = !endpointConfigured;
  reserveStatus.textContent = endpointConfigured
    ? ''
    : endpointUnavailableMessage;

  function openDialog() {
    previouslyFocused = document.activeElement;
    reserveOverlay.inert = false;
    reserveOverlay.setAttribute('aria-hidden', 'false');
    reserveOverlay.classList.add('visible');
    reserveForm.classList.add('visible');
    reserveFields[0].focus();
    reserveSubmit.disabled = !endpointConfigured;
    reserveSubmit.textContent = 'Send inquiry';
  }

  function closeDialog() {
    reserveOverlay.classList.remove('visible');
    reserveForm.classList.remove('visible');
    reserveForm.reset();
    reserveOverlay.setAttribute('aria-hidden', 'true');
    reserveOverlay.inert = true;
    reserveFields.forEach(el => {
      el.classList.remove('invalid');
      el.removeAttribute('aria-invalid');
    });
    reserveSubmit.disabled = !endpointConfigured;
    reserveSubmit.textContent = 'Send inquiry';
    reserveStatus.textContent = endpointConfigured ? '' : endpointUnavailableMessage;
    reserveForm.removeAttribute('aria-busy');
    previouslyFocused?.focus();
  }

  reserveFields.forEach(field => {
    field.addEventListener('invalid', event => {
      event.preventDefault();
      field.classList.add('invalid');
      field.setAttribute('aria-invalid', 'true');
    });
    field.addEventListener('input', () => {
      if (field.validity.valid) {
        field.classList.remove('invalid');
        field.removeAttribute('aria-invalid');
      }
    });
    field.addEventListener('change', () => {
      if (field.validity.valid) {
        field.classList.remove('invalid');
        field.removeAttribute('aria-invalid');
      }
    });
  });

  if (reserveBtn) {
    reserveBtn.addEventListener('click', openDialog);
  }
  if (reserveClose) {
    reserveClose.addEventListener('click', closeDialog);
  }
  if (reserveCancel) {
    reserveCancel.addEventListener('click', closeDialog);
  }
  if (reserveOverlay) {
    reserveOverlay.addEventListener('click', e => {
      if (e.target === reserveOverlay) closeDialog();
    });
  }

  document.addEventListener('keydown', event => {
    if (!reserveOverlay.classList.contains('visible')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(reserveOverlay.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
    )).filter(element => !element.inert && element.getClientRects().length);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  reserveForm.addEventListener('submit', async event => {
    event.preventDefault();
    reserveStatus.textContent = '';

    if (!reserveForm.checkValidity()) {
      reserveForm.querySelector(':invalid')?.focus();
      return;
    }
    if (!endpointConfigured) {
      reserveStatus.textContent = endpointUnavailableMessage;
      return;
    }

    reserveSubmit.disabled = true;
    reserveSubmit.textContent = 'Sending…';
    reserveForm.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(reserveForm)))
      });

      if (!response.ok) {
        throw new Error(`Reservation service returned HTTP ${response.status}`);
      }

      reserveForm.reset();
      reserveFields.forEach(field => {
        field.classList.remove('invalid');
        field.removeAttribute('aria-invalid');
      });
      reserveStatus.textContent = 'Thank you. Your inquiry has been submitted.';
      reserveSubmit.textContent = 'Inquiry sent';
      return;
    } catch (error) {
      console.error('Unable to submit reservation inquiry.', error);
      reserveStatus.textContent = 'We could not submit your inquiry. Please try again later.';
    } finally {
      reserveForm.removeAttribute('aria-busy');
      if (reserveStatus.textContent !== 'Thank you. Your inquiry has been submitted.') {
        reserveSubmit.disabled = false;
        reserveSubmit.textContent = 'Send inquiry';
      }
    }
  });
})();

/* ════════════════════════════════════════════════════════════════════════════
   DISMANTLE CALLOUTS
═══════════════════════════════════════════════════════════════════════════ */
function positionCallouts() {
  const stage = document.getElementById('dismantle-stage');
  CONFIG.DISMANTLE_CALLOUTS.forEach(co => {
    const el = document.getElementById(co.id);
    if (!el) return;
    el.style.left = co.x + '%';
    el.style.top  = co.y + '%';
  });
}
positionCallouts();
window.addEventListener('resize', positionCallouts);

/* ════════════════════════════════════════════════════════════════════════════
   HERO TEXT CHAPTERS
═══════════════════════════════════════════════════════════════════════════ */
let lastHeroChapter = -1;

function updateHeroChapters(progress) {
  const chapters = CONFIG.HERO_CHAPTERS;
  let activeChapter = -1;

  chapters.forEach((ch, i) => {
    const el = document.getElementById(ch.id);
    if (!el) return;
    const visible = progress >= ch.start && progress <= ch.end;
    if (visible) {
      activeChapter = i;
      if (!el.classList.contains('visible')) {
        el.classList.add('visible');
        el.querySelectorAll('.line-reveal-inner')
          .forEach((l, li) => {
            l.classList.remove('revealed');
            setTimeout(() => l.classList.add('revealed'), li * 80);
          });
      }
    } else {
      el.classList.remove('visible');
    }
  });

  if (activeChapter !== lastHeroChapter) {
    lastHeroChapter = activeChapter;
    const num = activeChapter >= 0 ? (activeChapter + 1) : 1;
    const hudEl = document.getElementById('hud-ch-num');
    if (hudEl) hudEl.textContent = `0${num} / 04`;
    const hudCh = document.getElementById('hud-ch');
    if (hudCh) {
      hudCh.classList.add('active');
      if (activeChapter < 0) hudCh.classList.remove('active');
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   HUD COUNTERS
═══════════════════════════════════════════════════════════════════════════ */
function updateHUD(progress) {
  const speed = Math.round(progress * CONFIG.HUD_SPEED_MAX);
  const dist = (progress * CONFIG.HUD_DISTANCE_MAX).toFixed(1);

  const speedEl = document.getElementById('hud-speed');
  const distEl  = document.getElementById('hud-dist');
  if (speedEl) speedEl.textContent = String(speed).padStart(3, '0');
  if (distEl)  distEl.textContent  = dist;
}

/* ════════════════════════════════════════════════════════════════════════════
   PROGRESS LINE
═══════════════════════════════════════════════════════════════════════════ */
function updateProgressLine(id, progress) {
  const el = document.getElementById(id);
  if (el) el.style.width = (progress * 100) + '%';
}

function applySectionHeights() {
  document.getElementById('hero-pin-wrap').style.height = `${CONFIG.HERO_HEIGHT_VH}vh`;
  document.getElementById('dismantle-pin-wrap').style.height = `${CONFIG.DISMANTLE_HEIGHT_VH}vh`;
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL → PROGRESS CALCULATION
═══════════════════════════════════════════════════════════════════════════ */
function getPinProgress(pinWrap) {
  const rect = pinWrap.getBoundingClientRect();
  const denom = pinWrap.offsetHeight - window.innerHeight;
  if (denom <= 0) return 0;
  return clamp(-rect.top / denom, 0, 1);
}

/* ════════════════════════════════════════════════════════════════════════════
   REDUCED MOTION — static frames, no scrolling animation
═══════════════════════════════════════════════════════════════════════════ */
function initReducedMotion() {
  const heroPin = document.getElementById('hero-pin-wrap');
  heroPin.style.height = 'auto';
  document.getElementById('hero-stage').hidden = true;

  const heroStory = document.createElement('div');
  heroStory.className = 'reduced-story';
  CONFIG.HERO_STATIC_FRAMES.forEach((progress, index) => {
    const chapter = document.getElementById(CONFIG.HERO_CHAPTERS[index].id);
    const panel = document.createElement('article');
    panel.className = 'reduced-chapter';
    panel.dataset.chapter = CONFIG.HERO_CHAPTERS[index].id;
    const description = `NOCTIS hero chapter ${index + 1}`;
    panel.appendChild(index === 0
      ? createHeroPoster(description)
      : createStaticFrame(
        heroSeq,
        Math.round(progress * (CONFIG.HERO_FRAME_COUNT - 1)),
        description
      ));

    const copy = chapter.cloneNode(true);
    copy.removeAttribute('id');
    copy.removeAttribute('aria-hidden');
    copy.classList.remove('hero-chapter', 'visible');
    copy.classList.add('reduced-copy');
    copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    copy.querySelectorAll('.line-reveal-inner').forEach(line => line.classList.add('revealed'));
    const scrollHint = copy.querySelector('.scroll-hint-label');
    if (scrollHint) scrollHint.textContent = 'Move pointer across image to explore';
    panel.appendChild(copy);
    heroStory.appendChild(panel);
  });
  heroPin.appendChild(heroStory);

  const interactiveImage = heroStory.querySelector('.reduced-frame');
  if (interactiveImage instanceof HTMLImageElement) {
    let requestedFrame = -1;
    let drawGeneration = 0;

    heroStory.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse' || event.buttons > 0) {
        const rect = interactiveImage.getBoundingClientRect();
        const progress = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const frameIndex = Math.round(progress * (heroSeq.total - 1));
        if (frameIndex === requestedFrame) return;
        requestedFrame = frameIndex;
        const generation = ++drawGeneration;

        heroSeq._requestNearbyFrames(frameIndex);
        heroSeq.loadFrame(frameIndex + 1).then(loaded => {
          if (!loaded || generation !== drawGeneration) return;
          const image = heroSeq.frames[frameIndex];
          if (!image) return;

          interactiveImage.src = image.src;
        });
      }
    });
  }

  const dismPin = document.getElementById('dismantle-pin-wrap');
  dismPin.style.height = 'auto';
  document.getElementById('dismantle-stage').hidden = true;
  const dismantleStory = document.createElement('div');
  dismantleStory.className = 'reduced-story dismantle-story';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = 'Look closer.';
  dismantleStory.appendChild(title);

  [0, CONFIG.DISMANTLE_FRAME_COUNT - 1].forEach((frameIndex, index) => {
    dismantleStory.appendChild(createStaticFrame(
      dismantleLoader,
      frameIndex,
      index === 0 ? 'NOCTIS motorcycle assembled' : 'NOCTIS motorcycle dismantled'
    ));
  });

  const calloutList = document.createElement('ul');
  calloutList.className = 'reduced-callouts';
  CONFIG.DISMANTLE_CALLOUTS.forEach(callout => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'callout-label';
    label.textContent = callout.label;
    const description = document.createElement('span');
    description.className = 'callout-desc';
    description.textContent = callout.desc;
    item.append(label, description);
    calloutList.appendChild(item);
  });
  dismantleStory.appendChild(calloutList);
  dismPin.appendChild(dismantleStory);

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.15 });
  heroStory.querySelectorAll('.reduced-chapter').forEach(panel => observer.observe(panel));
  dismantleStory.querySelectorAll('.reduced-frame').forEach(frame => observer.observe(frame));
}

function createHeroPoster(description) {
  const image = document.createElement('img');
  image.className = 'reduced-frame';
  image.src = 'bike%20image.png';
  image.alt = description;
  image.fetchPriority = 'high';
  image.decoding = 'async';
  return image;
}

function createStaticFrame(sequence, frameIndex, description) {
  const canvas = document.createElement('canvas');
  canvas.className = 'reduced-frame';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const logicalWidth = 1600;
  const logicalHeight = 900;
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', description);
  const context = canvas.getContext('2d');
  context?.scale(dpr, dpr);

  sequence.loadFrame(frameIndex + 1).then(loaded => {
    if (!loaded || !context) return;

    const image = sequence.frames[frameIndex];
    const scale = Math.min(logicalWidth / image.naturalWidth, logicalHeight / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.fillStyle = '#07080A';
    context.fillRect(0, 0, logicalWidth, logicalHeight);
    context.drawImage(
      image,
      (logicalWidth - drawWidth) / 2,
      (logicalHeight - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  });

  return canvas;
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN ANIMATION LOOP
═══════════════════════════════════════════════════════════════════════════ */
function startMainLoop() {
  const heroPW     = document.getElementById('hero-pin-wrap');
  const dismantlePW = document.getElementById('dismantle-pin-wrap');

  if (prefersReducedMotion) {
    initReducedMotion();
    return;
  }

  heroSeq._drawFrame(0);
  const heroStage = document.getElementById('hero-stage');
  let pointerProgress = null;

  heroStage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' && event.buttons === 0) return;
    const rect = heroStage.getBoundingClientRect();
    pointerProgress = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    heroSeq._requestNearbyFrames(Math.round(pointerProgress * (heroSeq.total - 1)));
  });

  heroStage.addEventListener('pointerleave', () => {
    pointerProgress = null;
  });

  window.addEventListener('scroll', () => {
    pointerProgress = null;
  }, { passive: true });

  function loop() {
    // ── HERO ────────────────────────────────────────────────────
    const heroProgress = pointerProgress ?? getPinProgress(heroPW);
    heroSeq.setProgress(heroProgress);
    heroSeq.tick();

    heroCanvas.style.opacity = heroProgress > CONFIG.HERO_FADE_START
      ? String(clamp(
        1 - (heroProgress - CONFIG.HERO_FADE_START) / (1 - CONFIG.HERO_FADE_START),
        0, 1
      ))
      : '1';

    updateHeroChapters(heroProgress);
    updateHUD(heroProgress);
    updateProgressLine('hero-progress-line', heroProgress);

    // ── DISMANTLE ────────────────────────────────────────────────
    const dismProgress = getPinProgress(dismantlePW);
    const dismantleRect = dismantlePW.getBoundingClientRect();
    if (dismantleRect.top < window.innerHeight && dismantleRect.bottom > 0) {
      dismantleLoader.setProgress(dismProgress);
      dismantleLoader.tick();
    }
    updateProgressLine('dismantle-progress-line', dismProgress);

    CONFIG.DISMANTLE_CALLOUTS.forEach((co, i) => {
      const threshold = CONFIG.DISMANTLE_CALLOUT_START + i * CONFIG.DISMANTLE_CALLOUT_STAGGER;
      const el = document.getElementById(co.id);
      if (!el) return;
      if (dismProgress >= threshold) el.classList.add('visible');
      else el.classList.remove('visible');
    });

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

/* ════════════════════════════════════════════════════════════════════════════
   DISMANTLE SECTION TITLE
═══════════════════════════════════════════════════════════════════════════ */
(function() {
  const titleEl = document.querySelector('#section-dismantle .section-title');
  if (!titleEl) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        titleEl.querySelectorAll('.line-reveal-inner').forEach(l => l.classList.add('revealed'));
        obs.disconnect();
      }
    });
  }, { threshold: 0.3 });
  obs.observe(titleEl);
})();

/* ════════════════════════════════════════════════════════════════════════════
   HASH-LINK SCROLL INTERCEPTOR
═══════════════════════════════════════════════════════════════════════════ */
(function initHashScrollInterceptor() {
  let scrollFrame = 0;

  function lerpScrollTo(targetY) {
    cancelAnimationFrame(scrollFrame);
    if (prefersReducedMotion) {
      window.scrollTo(0, targetY);
      return;
    }

    let currentY = window.scrollY;
    const LERP_T = 0.15;
    const CONVERGE_THRESHOLD = 1.0;

    function step() {
      const delta = targetY - currentY;
      if (Math.abs(delta) < CONVERGE_THRESHOLD) {
        window.scrollTo(0, targetY);
        scrollFrame = 0;
        return;
      }
      currentY = currentY + delta * LERP_T;
      window.scrollTo(0, currentY);
      scrollFrame = requestAnimationFrame(step);
    }
    step();
  }

  document.addEventListener('click', e => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    const hash = anchor.getAttribute('href');
    if (!hash || hash === '#') return;
    const target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    history.pushState(null, '', hash);
    const targetY = clamp(
      target.getBoundingClientRect().top + window.scrollY,
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    lerpScrollTo(targetY);
  }, { passive: false });

  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      requestAnimationFrame(() => {
        const targetY = clamp(
          target.getBoundingClientRect().top + window.scrollY,
          0,
          document.documentElement.scrollHeight - window.innerHeight
        );
        lerpScrollTo(targetY);
      });
    }
  }
})();

/* ════════════════════════════════════════════════════════════════════════════
   FILM GRAIN — reinitialize on resize
═══════════════════════════════════════════════════════════════════════════ */
(function initGrain() {
  const canvas = document.getElementById('grain');
  if (!canvas || prefersReducedMotion) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const SIZE = CONFIG.GRAIN_TILE_SIZE;
  const INTERVAL = 1000 / CONFIG.GRAIN_FPS;

  // Build tile once
  const tile = document.createElement('canvas');
  tile.width = tile.height = SIZE;
  const tc = tile.getContext('2d');
  const imgData = tc.createImageData(SIZE, SIZE);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  tc.putImageData(imgData, 0, 0);

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function tick() {
    const ox = (Math.random() * SIZE) | 0;
    const oy = (Math.random() * SIZE) | 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let x = -SIZE; x < canvas.width + SIZE; x += SIZE) {
      for (let y = -SIZE; y < canvas.height + SIZE; y += SIZE) {
        ctx.drawImage(tile, x - ox, y - oy);
      }
    }
  }
  setInterval(tick, INTERVAL);
  tick();
})();

/* ════════════════════════════════════════════════════════════════════════════
   RESERVE BUTTON — initial state check for API endpoint
═══════════════════════════════════════════════════════════════════════════ */
(function initReservationCheck() {
  const btn = document.getElementById('reserve-btn');
  if (!btn) return;
  // The reservation form handles API configuration internally
  // No additional setup needed — the form will show setup message if no backend is configured.
})();

/* ════════════════════════════════════════════════════════════════════════════
   START — bootstrap all sections
═══════════════════════════════════════════════════════════════════════════ */
applySectionHeights();

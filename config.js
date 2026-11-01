/**
 * NOCTIS — Global Configuration
 * All tuneable values live here. Edit this file to adjust timings,
 * chapter ranges, frame counts, callout positions and more.
 *
 * Motorcycle / e-bike edition: all automotive references have been
 * replaced with motorcycle / e-bike terminology.
 */

const CONFIG = {

  // ── Frame counts (auto-written by convert_frames.py) ──────────────────
  HERO_FRAME_COUNT:      622,   // clip1(208) + clip2(207 skip first) + clip3(207 skip first)
  DISMANTLE_FRAME_COUNT: 208,

  // ── Frame paths ──────────────────────────────────────────────────────
  HERO_FRAMES_DESKTOP:   'assets/frames/hero/frame_{n}.webp',
  HERO_FRAMES_MOBILE:    'assets/frames/hero-mobile/frame_{n}.webp',
  DISMANTLE_FRAMES_DESKTOP: 'assets/frames/dismantle/frame_{n}.webp',
  DISMANTLE_FRAMES_MOBILE:  'assets/frames/dismantle-mobile/frame_{n}.webp',

  // Pad to 4 digits: frame_0001.webp
  FRAME_PAD: 4,

  // ── Section heights (in vh units) ────────────────────────────────────
  HERO_HEIGHT_VH:      600,
  DISMANTLE_HEIGHT_VH: 350,

  // ── Hero text chapters (as progress 0–1) ─────────────────────────────
  // Each chapter: { start, end, id }
  HERO_CHAPTERS: [
    { start: 0.00, end: 0.12, id: 'ch-1' },
    { start: 0.22, end: 0.40, id: 'ch-2' },
    { start: 0.50, end: 0.68, id: 'ch-3' },
    { start: 0.80, end: 1.00, id: 'ch-4' },
  ],

  // Progress at which hero canvas starts fading to black (last 5%)
  HERO_FADE_START: 0.95,

  // ── Hero reduced-motion static frame progress (0–1) ───────────────────
  HERO_STATIC_FRAMES: [0, 0.35, 0.65, 1.0], // as progress values

  // ── HUD speed/distance counters ──────────────────────────────────────
  HUD_SPEED_MAX: 118,      // KM/H
  HUD_DISTANCE_MAX: 4.2,   // KM

  // ── Dismantle callouts ───────────────────────────────────────────────
  // Each: { id, label, desc, x (%), y (%) } — coordinates on the canvas
  DISMANTLE_CALLOUTS: [
    { id: 'co-frame',   label: 'FRAME',   desc: 'Carbon composite trellis frame', x: 50, y: 28 },
    { id: 'co-battery', label: 'BATTERY', desc: '24 kWh structural battery pack', x: 42, y: 55 },
    { id: 'co-drive',   label: 'DRIVE',   desc: 'High-torque axial-flux motor, 160 kW', x: 60, y: 62 },
    { id: 'co-light',   label: 'LIGHT',   desc: 'Single-line LED signature',   x: 72, y: 38 },
  ],

  // Progress at which callouts start appearing (staggered)
  DISMANTLE_CALLOUT_START: 0.70,
  DISMANTLE_CALLOUT_STAGGER: 0.06, // 6% progress between each callout

  // ── Lineup models ────────────────────────────────────────────────────
  // Each model: id, num (01–05), name, desc, range (km), sprint (0–100 km/h),
  // power (kW), img, swatches (5 flat colours), activeColor, isDefault
  LINEUP_MODELS: [
    {
      id:    'meteor-350',
      num:   '01',
      name:  'Meteor 350',
      desc:  'The electric grand tourer superbike.',
      range: '380 km',
      sprint:'2.8 s',
      power: '160 kW',
      img:   'assets/frames/dismantle/frame_0001.webp',
      swatches: ['#F2C94C', '#3978D4', '#D63B32', '#58A66A', '#E88332'],
      activeColor: 0,
      isDefault: true,
    },
    {
      id:    's',
      num:   '02',
      name:  'S',
      desc:  'Pure urban performance.',
      range: '320 km',
      sprint:'3.1 s',
      power: '120 kW',
      img:   'assets/frames/dismantle/frame_0001.webp',
      swatches: ['#F2C94C', '#3978D4', '#D63B32', '#58A66A', '#E88332'],
      activeColor: 0,
      isDefault: false,
    },
    {
      id:    'x',
      num:   '03',
      name:  'X',
      desc:  'Uncharted terrain.',
      range: '290 km',
      sprint:'3.5 s',
      power: '110 kW',
      img:   'assets/frames/dismantle/frame_0001.webp',
      swatches: ['#F2C94C', '#3978D4', '#D63B32', '#58A66A', '#E88332'],
      activeColor: 0,
      isDefault: false,
    },
    {
      id:    'r',
      num:   '04',
      name:  'R',
      desc:  'Built for the circuit.',
      range: '220 km',
      sprint:'2.1 s',
      power: '210 kW',
      img:   'assets/frames/dismantle/frame_0001.webp',
      swatches: ['#F2C94C', '#3978D4', '#D63B32', '#58A66A', '#E88332'],
      activeColor: 0,
      isDefault: false,
    },
    {
      id:    'one',
      num:   '05',
      name:  'ONE',
      desc:  'The future of riding.',
      range: 'Concept',
      sprint:'—',
      power: '—',
      img:   'assets/frames/dismantle/frame_0001.webp',
      swatches: ['#F2C94C', '#3978D4', '#D63B32', '#58A66A', '#E88332'],
      activeColor: 0,
      isDefault: false,
    },
  ],

  // ── Preloader ─────────────────────────────────────────────────────────
  // Number of hero frames to load before revealing the page
  PRELOAD_FIRST_BATCH: 40,

  // ── Film grain ────────────────────────────────────────────────────────
  GRAIN_OPACITY:     0.035,  // 3.5%
  GRAIN_FPS:         8,      // shifts per second
  GRAIN_TILE_SIZE:   256,    // offscreen canvas size

  // ── Custom cursor lerp ────────────────────────────────────────────────
  CURSOR_LERP:       0.18,

  // ── Scroll lerp for canvas animation ─────────────────────────────────
  CANVAS_LERP:       0.15,

  // ── Mobile breakpoint ─────────────────────────────────────────────────
  MOBILE_BREAKPOINT: 768,

  // ── Nav hide threshold (px of scroll) ─────────────────────────────────
  NAV_SCROLL_THRESHOLD: 50,
};

// Utility: build a frame path from template and 1-based index
CONFIG.framePath = function(template, n) {
  const padded = String(n).padStart(CONFIG.FRAME_PAD, '0');
  return template.replace('{n}', padded);
};

export default CONFIG;

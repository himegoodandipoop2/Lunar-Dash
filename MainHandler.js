// MainHandler.js
// Loaded last — depends on Data.js, Levels.js, SheetHandler.js, IconHandler.js
// and PlayerController.js.
//
// index.html is the whole game, so this file is a small screen machine over a
// single canvas:
//
//   loading -> menu -> icons | levels -> playing <-> paused
//
// Every screen draws itself and registers its clickable rectangles as it draws,
// so a button's hit area can never drift out of sync with the artwork.

const AppConfig = {
  menuViewHeight: 720,          // menus keep the original layout scale
  playViewHeight: LEVEL_VIEW_HEIGHT, // gameplay view — LEVEL_VIEW_HEIGHT (600) for the bigger GD-like view
  viewHeight: 720,              // active logical height; setScreen() swaps it per screen
  cameraOffsetX: 120,            // GD: icon sits ~120 units (25%) from the left of the 480-unit screen
  iconScale: 1.15,               // gameplay icon is drawn slightly larger than the hitbox
  deathPause: 1000,               // ms spent on the death burst before restarting
  finishPause: 2000,             // ms spent on the "Level Complete" banner
  menuMusicVolume: 0.35,
  hoverScale: 1.06,              // buttons grow by this much under the pointer
  backgroundParallax: 0.05,      // background scrolls this fraction of the camera
  backgroundScale: 2.65,            // uniformly scale each bg tile 2× (keeps aspect ratio, no squish) so the image reads as closer / larger
  backgroundOffsetY: -110,        // px shift applied after auto-centering; negative moves the bg tile UP on screen, positive moves it down
  groundTile: 140,               // px square the ground texture tiles at
  progressInset: 7,              // px of progress-bar frame kept around the fill
};

const app = {
  canvas: null,
  ctx: null,
  scale: 1,                 // device px per logical px
  viewWidth: 1280,          // logical width, follows the window's aspect ratio
  viewHeight: AppConfig.viewHeight,

  screen: 'loading',
  levelIndex: 0,
  clock: 0,

  pointer: { x: -1, y: -1 },
  buttons: [],              // rebuilt by each screen as it draws

  resources: { fonts: {}, sheets: {}, images: {} },
  levelSong: null,
  menuMusic: null,
  audioUnlocked: false,

  game: null,               // live gameplay state, created when a level starts
};

// -------------------- Small helpers --------------------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function circleRectOverlap(cx, cy, r, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.w);
  const nearestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// -------------------- Buttons --------------------
// Screens register a button as they draw it; the list is emptied at the top of
// every render, so hit-testing always reflects exactly what is on screen.
function isHovered(rect) {
  const p = app.pointer;
  return p.x >= rect.x && p.x <= rect.x + rect.w &&
         p.y >= rect.y && p.y <= rect.y + rect.h;
}

function addButton(id, x, y, w, h, action) {
  const rect = { id, x, y, w, h, action };
  app.buttons.push(rect);
  return rect;
}

/** Registers and draws a sprite button, keeping the hit area in step with the art. */
function spriteButton(id, frameName, cx, cy, targetWidth, action, sheetKey = 'game') {
  const sheet = app.resources.sheets[sheetKey];
  if (!sheet || typeof sheet.has === 'function' && !sheet.has(frameName)) {
    const w = targetWidth;
    const h = Math.max(48, targetWidth * 0.52);
    const rect = addButton(id, cx - w / 2, cy - h / 2, w, h, action);
    drawPlaceholderButton(rect, id);
    return rect;
  }
  const base = sheet.size(frameName, 1);
  const k = targetWidth / base.w;

  const rect = addButton(id, cx - base.w * k / 2, cy - base.h * k / 2,
    base.w * k, base.h * k, action);

  const hovered = isHovered(rect);
  sheet.draw(ctx, frameName, cx, cy, { width: rect.w * (hovered ? AppConfig.hoverScale : 1) });
  return rect;
}

/** A text-only button drawn on a rounded pill, for things with no artwork. */
function drawPlaceholderButton(rect, label) {
  const hovered = isHovered(rect);
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
  ctx.fillStyle = hovered ? 'rgba(0, 255, 204, 0.30)' : 'rgba(255, 255, 255, 0.14)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#00ffcc';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(label || '').toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

/** A text-only button drawn on a rounded pill, for things with no artwork. */
function textButton(id, label, cx, cy, w, h, action) {
  const rect = addButton(id, cx - w / 2, cy - h / 2, w, h, action);
  const hovered = isHovered(rect);

  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(h / 2, 16));
  ctx.fillStyle = hovered ? 'rgba(0, 255, 204, 0.22)' : 'rgba(255, 255, 255, 0.10)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = hovered ? '#00ffcc' : 'rgba(255, 255, 255, 0.32)';
  ctx.stroke();
  ctx.restore();

  const font = app.resources.fonts.big;
  font.draw(ctx, label, cx, cy, {
    scale: font.scaleForCap(h * 0.44),
    align: 'center',
    anchor: 'center',
  });
  return rect;
}

/** Lays a row of text buttons out evenly, shrinking them to fit narrow windows. */
function createToolbar(items, y, h) {
  const left = 96;                 // clear of the back button
  const right = app.viewWidth - 16;
  const gap = 10;
  const ideal = items.reduce((sum, it) => sum + (it.w || 96), 0) + (items.length - 1) * gap;
  const k = Math.min(1, (right - left) / Math.max(1, ideal));

  let x = left;
  for (const item of items) {
    const w = Math.max(44, Math.round((item.w || 96) * k));
    const rect = textButton(item.id, item.label, x + w / 2, y + h / 2, w, h, item.action);
    if (item.active) {
      ctx.save();
      roundRect(ctx, rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 16);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#00ffcc';
      ctx.stroke();
      ctx.restore();
    }
    x += w + gap;
  }
}

// -------------------- Resource loading --------------------
async function loadResources() {
  const { fonts, sheets } = app.resources;

  // Phase 1: bitmap fonts (needed for any text rendering)
  app.loadPhase = LoadPhase.FONTS;

  // The menus can't draw a word without these, so they are required.
  const [big, gold, gameSheet, launchSheet] = await Promise.all([
    getFont(uiAssets.fonts.big),
    getFont(uiAssets.fonts.gold),
    getSheet(uiAssets.sheets.game.png, uiAssets.sheets.game.plist),
    getSheet(uiAssets.sheets.launch.png, uiAssets.sheets.launch.plist),
  ]);

  fonts.big = big;
  fonts.gold = gold;
  sheets.game = gameSheet;
  sheets.launch = launchSheet;

  // Phase 2: sprite sheets for blocks/spikes/portals
  app.loadPhase = LoadPhase.SHEETS;

  // Level block/spike/portal art (GD GameSheet). Optional: gameplay falls
  // back to vector shapes if these fail, so never let them reject boot.
  try {
    sheets.blocks = await getSheet(uiAssets.sheets.blocks.png, uiAssets.sheets.blocks.plist);
  } catch (err) { console.warn('Optional sheet unavailable (blocks):', err); }
  try {
    sheets.blocks2 = await getSheet(uiAssets.sheets.blocks2.png, uiAssets.sheets.blocks2.plist);
  } catch (err) { console.warn('Optional sheet unavailable (blocks2):', err); }

  // BlockDefinitions classifies every frame of those two atlases (blocks,
  // spikes, portals, rings…), and Levels.js resolves each level part through
  // it. It asks SheetHandler for the same two sheets, which are already cached
  // above, so this adds no download. Also optional: without it the parts fall
  // back to the frame names in the LEVEL_PARTS catalog.
  try {
    await loadBlockDefinitions();
    // The catalog calls GJ_GameSheet02 the 'objects' atlas; keep both names
    // pointing at the same Sheet so either key resolves at draw time.
    sheets.objects = BlockDefinitions.sheetObjects.objects || sheets.blocks2;
  } catch (err) {
    console.warn('Optional block/object definitions unavailable:', err);
  }

  // Phase 3: standalone images
  app.loadPhase = LoadPhase.IMAGES;

  // Level art is optional — gameplay falls back to drawn shapes without it.
  await Promise.all(Object.entries(uiAssets.images).map(async ([key, src]) => {
    try {
      app.resources.images[key] = await getImage(src);
    } catch (err) {
      console.warn(`Optional image unavailable (${key}):`, err);
    }
  }));
}

// -------------------- Audio --------------------
// Two separate tracks: looping menu music, and the current level's song. Keeping
// them explicit is what lets handleLeaveApp() silence everything reliably.
function initAudio() {
  app.menuMusic = new Audio(menuMusic);
  app.menuMusic.loop = true;
  app.menuMusic.volume = AppConfig.menuMusicVolume;
}

function playMenuMusic() {
  if (!app.menuMusic || !app.audioUnlocked) return;
  if (app.menuMusic.paused) app.menuMusic.play().catch(() => {});
}

// GD restarts its menu loop whenever you come back to a menu screen.
function restartMenuMusic() {
  if (!app.menuMusic || !app.audioUnlocked) return;
  app.menuMusic.currentTime = 0;
  app.menuMusic.play().catch(() => {});
}

function pauseLevelSong() {
  if (app.levelSong && !app.levelSong.paused) app.levelSong.pause();
}

function resumeLevelSong() {
  if (app.levelSong && app.levelSong.paused && app.audioUnlocked) {
    app.levelSong.play().catch(() => {});
  }
}

function pauseMenuMusic() {
  if (app.menuMusic) app.menuMusic.pause();
}

function startLevelSong(level) {
  stopLevelSong();
  if (!level.song || !app.audioUnlocked) return;

  const song = new Audio(level.song);
  song.volume = 0.6;
  song.addEventListener('error', () => {}); // a missing song simply plays nothing
  song.play().catch(() => {});
  app.levelSong = song;
}

function stopLevelSong() {
  if (!app.levelSong) return;
  app.levelSong.pause();
  app.levelSong = null;
}

function pauseAllAudio() {
  pauseMenuMusic();
  stopLevelSong();
}

function isMenuScreen(screen) {
  return screen === 'menu' || screen === 'icons' || screen === 'levels' ||
         screen === 'create';
}

// Browsers block playback until a real user gesture, so audio waits for one.
function unlockAudio() {
  if (app.audioUnlocked) return;
  app.audioUnlocked = true;
  if (isMenuScreen(app.screen)) playMenuMusic();
}

// -------------------- Leaving the tab --------------------
// requestAnimationFrame stops when a tab is hidden, but <audio> does not — that
// is exactly why a level's song used to keep playing after switching away.
// Leaving now silences everything and drops the player into the pause menu.
// Coming back deliberately does NOT auto-resume: the music only restarts on an
// explicit press, so nothing can ever play at a hidden tab.
function handleLeaveApp() {
  pauseAllAudio();
  if (app.screen === 'playing') enterPause();
}

function handleReturnToApp() {
  if (isMenuScreen(app.screen)) playMenuMusic();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) handleLeaveApp();
  else handleReturnToApp();
});

window.addEventListener('blur', handleLeaveApp);
window.addEventListener('pagehide', pauseAllAudio);
window.addEventListener('beforeunload', pauseAllAudio);

// -------------------- Screen switching --------------------
function setScreen(screen) {
  // Track the previous screen so we know whether we're coming from a level
  // (restart menu music) or another menu (just resume music).
  app.previousScreen = app.screen;
  app.screen = screen;
  app.buttons = [];
  app.pointer = { x: -1, y: -1 };

  // Menus were authored at 720 logical px; gameplay zooms to LEVEL_VIEW_HEIGHT
  // (480) for the GD-close camera. Swap the active height then re-fit.
  const wantHeight = (screen === 'playing' || screen === 'paused')
    ? AppConfig.playViewHeight : AppConfig.menuViewHeight;
  if (app.viewHeight !== wantHeight) {
    app.viewHeight = wantHeight;
    AppConfig.viewHeight = wantHeight;
    resize();
  }

  // The GD colour grid is drawn on-canvas (see renderIcons); the legacy DOM
  // panel stays hidden so there is exactly one picker.
  const panel = document.getElementById('colour-panel');
  if (panel) panel.hidden = true;

  if (isMenuScreen(screen)) {
    // When coming back to a menu from a level, restart the menu music.
    // When moving between menu screens, just ensure it's playing without resetting.
    if (app.previousScreen && !isMenuScreen(app.previousScreen)) {
      restartMenuMusic();
    } else {
      playMenuMusic();
    }
  } else {
    pauseMenuMusic();
  }
}

// -------------------- Shared menu chrome --------------------
function drawMenuBackdrop() {
  const bg = app.resources.images.background;

  if (bg) {
    // Cover the whole view, then dim so the text stays readable
    const k = Math.max(app.viewWidth / bg.width, app.viewHeight / bg.height);
    ctx.drawImage(bg,
      (app.viewWidth - bg.width * k) / 2,
      (app.viewHeight - bg.height * k) / 2,
      bg.width * k, bg.height * k);

    ctx.fillStyle = 'rgba(5, 6, 15, 0.6)';
    ctx.fillRect(0, 0, app.viewWidth, app.viewHeight);
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, app.viewHeight);
  gradient.addColorStop(0, '#0b1026');
  gradient.addColorStop(1, '#241a4d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, app.viewWidth, app.viewHeight);
}

// -------------------- Menu screen --------------------
function renderMenu() {
  drawMenuBackdrop();

  const cx = app.viewWidth / 2;

  // Logo lives in its own small sheet, so it can appear before the big UI atlas.
  // If the sheet failed to load, fall back to text so the menu still reads.
  const launch = app.resources.sheets.launch;
  const logoWidth = Math.min(app.viewWidth * 0.66, 640);
  if (launch && launch.has(uiAssets.frames.logo)) {
    launch.draw(ctx, uiAssets.frames.logo, cx, app.viewHeight * 0.26, { width: logoWidth });
  } else {
    const big = app.resources.fonts.big;
    big.draw(ctx, 'LUNAR DASH', cx, app.viewHeight * 0.26, {
      scale: big.scaleForCap(72), align: 'center', anchor: 'middle',
    });
  }

  spriteButton('play', uiAssets.frames.play, cx, app.viewHeight * 0.56, 190, () => {
    setScreen('levels');
  });

  textButton('icons', 'ICONS', cx - 120, app.viewHeight * 0.80, 220, 58, () => {
    openIconsScreen();
  });

  textButton('create', 'CREATE', cx + 120, app.viewHeight * 0.80, 220, 58, () => {
    openCreateScreen();
  });

  // Current icon preview, bottom-left, so the menu reflects your loadout
  const preview = iconScreen.preview;
  if (preview && preview.width > 0) {
    const size = 64;
    ctx.drawImage(preview, 24, app.viewHeight - size - 24, size, size);
  }
}

// -------------------- Icons screen --------------------
// Icon art is composited by IconHandler into offscreen canvases; this screen
// just blits them, so all the layer/tint logic stays in one place.
const iconScreen = {
  mode: null,
  selected: null,
  preview: null,
  thumbs: [],     // [{ number, canvas }]
  note: '',
  requestId: 0,   // guards against an older async render finishing last
  colorTarget: 'primary', // which channel the swatch grid edits
};

// GD 2.1 icon-kit palette (row-major). 24 swatches is plenty for the web build
// and matches GD's own limited kit instead of a free RGB picker.
const GD_PALETTE = [
  '#ffffff', '#c0c0c0', '#7f7f7f', '#000000', '#ff0000', '#ff7f00',
  '#ffff00', '#7fff00', '#00ff00', '#00ff7f', '#00ffff', '#007fff',
  '#0000ff', '#7f00ff', '#ff00ff', '#ff007f', '#8b4513', '#ffd700',
  '#98fb98', '#40e0d0', '#ff69b4', '#f5deb3', '#4b0082', '#2f4f4f',
];

function availableIconModes() {
  return Object.values(EntityTypes).filter((mode) => getAvailableIcons(mode).length > 0);
}

async function openIconsScreen() {
  const modes = availableIconModes();
  const preferred = modes.includes(iconScreen.mode)
    ? iconScreen.mode
    : (modes.includes(EntityTypes.CUBE) ? EntityTypes.CUBE : modes[0]);

  setScreen('icons');
  if (preferred) await buildIconScreen(preferred);
}

async function buildIconScreen(mode) {
  const myId = ++iconScreen.requestId;
  iconScreen.mode = mode;
  iconScreen.note = '';

  const numbers = getAvailableIcons(mode);
  if (numbers.length === 0) {
    iconScreen.preview = null;
    iconScreen.thumbs = [];
    iconScreen.note = 'No icons for this mode yet.';
    return;
  }

  const saved = playerData.selectedIcons[mode];
  const selected = numbers.includes(saved) ? saved : getStarterIcon(mode);

  const preview = document.createElement('canvas');
  const thumbs = [];

  try {
    await renderIcon(preview, mode, selected, playerData.colors);
    for (const number of numbers) {
      const canvas = document.createElement('canvas');
      await renderIcon(canvas, mode, number, playerData.colors);
      thumbs.push({ number, canvas });
    }
  } catch (err) {
    console.warn(`Could not render ${mode} icons:`, err);
    if (myId !== iconScreen.requestId) return;
    iconScreen.preview = null;
    iconScreen.thumbs = [];
    iconScreen.note = 'Icon art could not be loaded.';
    return;
  }

  if (myId !== iconScreen.requestId) return; // a newer request already landed

  iconScreen.preview = preview;
  iconScreen.thumbs = thumbs;
  iconScreen.selected = selected;
}

function renderIcons() {
  drawMenuBackdrop();

  const cx = app.viewWidth / 2;
  const big = app.resources.fonts.big;

  big.draw(ctx, 'ICONS', cx, 44, {
    scale: big.scaleForCap(46), align: 'center', anchor: 'top',
  });

  // One tab per mode that actually has art on disk
  const modes = availableIconModes();
  const tabW = 132;
  const tabH = 48;
  const tabGap = 12;
  const rowW = modes.length * tabW + Math.max(0, modes.length - 1) * tabGap;
  let tx = cx - rowW / 2;

  for (const mode of modes) {
    const rect = addButton(`mode-${mode}`, tx, 124, tabW, tabH, () => {
      buildIconScreen(mode);
    });

    const active = mode === iconScreen.mode;
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fillStyle = active ? 'rgba(0, 255, 204, 0.25)' : 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = active ? '#00ffcc' : 'rgba(255, 255, 255, 0.28)';
    ctx.stroke();
    ctx.restore();

    big.draw(ctx, mode.toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h / 2, {
      scale: big.scaleForCap(tabH * 0.42), align: 'center', anchor: 'center',
    });

    tx += tabW + tabGap;
  }

  // Big preview of the selected icon
  if (iconScreen.preview && iconScreen.preview.width > 0) {
    const size = 148;
    ctx.drawImage(iconScreen.preview, cx - size / 2, 192, size, size);
  }

  // Thumbnail strip
  const thumbs = iconScreen.thumbs;
  const thumbSize = 64;
  const thumbGap = 16;
  const thumbsW = thumbs.length * thumbSize + Math.max(0, thumbs.length - 1) * thumbGap;
  let hx = cx - thumbsW / 2;
  const hy = 372;

  for (const thumb of thumbs) {
    const rect = addButton(`icon-${thumb.number}`, hx, hy, thumbSize, thumbSize, () => {
      selectIcon(thumb.number);
    });

    const chosen = thumb.number === iconScreen.selected;
    ctx.save();
    roundRect(ctx, rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.lineWidth = chosen ? 4 : 2;
    ctx.strokeStyle = chosen ? '#00ffcc' : 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();
    ctx.restore();

    ctx.drawImage(thumb.canvas, rect.x, rect.y, rect.w, rect.h);
    hx += thumbSize + thumbGap;
  }

  if (iconScreen.note) {
    big.draw(ctx, iconScreen.note, cx, hy + 78, {
      scale: big.scaleForCap(16), align: 'center', anchor: 'center', alpha: 0.75,
    });
  }

  // GD-style colour kit: three channel tabs + a fixed swatch grid (2.1 palette).
  // No free RGB picker — matches GD's limited kit.
  const channels = ['primary', 'secondary', 'glow'];
  const tabW2 = 128, tabH2 = 34, tabGap2 = 10;
  const tabsW = channels.length * tabW2 + (channels.length - 1) * tabGap2;
  let tx2 = cx - tabsW / 2;
  const tabsY = 468;
  for (const ch of channels) {
    const rect = addButton(`color-tab-${ch}`, tx2, tabsY, tabW2, tabH2, () => {
      iconScreen.colorTarget = ch;
    });
    const active = iconScreen.colorTarget === ch;
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fillStyle = active ? playerData.colors[ch] : 'rgba(255,255,255,0.08)';
    ctx.globalAlpha = active ? 1 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = active ? 4 : 2;
    ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.30)';
    ctx.stroke();
    ctx.restore();
    big.draw(ctx, ch.toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h / 2, {
      scale: big.scaleForCap(15), align: 'center', anchor: 'center',
      color: active ? '#0b1026' : '#ffffff',
    });
    tx2 += tabW2 + tabGap2;
  }

  // Swatch grid: 12 cols x 2 rows under the tabs.
  const cols = 12, sw = 40, gap = 8;
  const gridW = cols * sw + (cols - 1) * gap;
  let gx = cx - gridW / 2;
  let gy = tabsY + tabH2 + 12;
  for (let i = 0; i < GD_PALETTE.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (sw + gap);
    const y = gy + row * (sw + gap);
    const hex = GD_PALETTE[i];
    const rect = addButton(`swatch-${i}`, x, y, sw, sw, () => {
      setPlayerColors({ [iconScreen.colorTarget]: hex });
      syncColourInputs();
      if (iconScreen.mode) buildIconScreen(iconScreen.mode);
    });
    const isCurrent = playerData.colors[iconScreen.colorTarget].toLowerCase() === hex.toLowerCase();
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.lineWidth = isCurrent ? 4 : 2;
    ctx.strokeStyle = isCurrent ? '#00ffcc' : 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.restore();
  }

  spriteButton('back', uiAssets.frames.menu, 74, app.viewHeight - 58, 86, () => {
    setScreen('menu');
  });
}

async function selectIcon(number) {
  const mode = iconScreen.mode;
  if (!mode) return;

  setSelectedIcon(mode, number);
  iconScreen.selected = number;

  // Only the preview needs re-compositing; the thumbnails are already right
  const preview = document.createElement('canvas');
  try {
    await renderIcon(preview, mode, number, playerData.colors);
    iconScreen.preview = preview;
  } catch (err) {
    console.warn('Could not render the selected icon:', err);
  }
}

function syncColourInputs() {
  const ids = { primary: 'color-primary', secondary: 'color-secondary', glow: 'color-glow' };
  for (const [key, id] of Object.entries(ids)) {
    const input = document.getElementById(id);
    if (input) input.value = playerData.colors[key];
  }
}

function initColourPanel() {
  const ids = { primary: 'color-primary', secondary: 'color-secondary', glow: 'color-glow' };

  for (const [key, id] of Object.entries(ids)) {
    const input = document.getElementById(id);
    if (!input) continue;

    input.value = playerData.colors[key];
    input.addEventListener('input', () => {
      setPlayerColors({ [key]: input.value });
      if (iconScreen.mode) buildIconScreen(iconScreen.mode);
    });
  }
}

// -------------------- Level select --------------------
function levelProgress(levelId) {
  const record = playerData.levelsCompleted[levelId];
  return {
    completed: !!(record && record.completed),
    bestPercent: Math.floor((record && record.bestPercent) || 0),
    attempts: (record && record.attempts) || 0,
  };
}

function renderLevels() {
  drawMenuBackdrop();

  const cx = app.viewWidth / 2;
  const big = app.resources.fonts.big;
  const gold = app.resources.fonts.gold;
  const sheet = app.resources.sheets.game;

  const ids = getLevelIds();
  app.levelIndex = clamp(app.levelIndex, 0, ids.length - 1);

  const levelId = ids[app.levelIndex];
  const level = getMainLevel(levelId);
  const progress = levelProgress(levelId);

  big.draw(ctx, 'SELECT LEVEL', cx, 40, {
    scale: big.scaleForCap(46), align: 'center', anchor: 'top',
  });

  // Card
  const cardW = Math.max(320, Math.min(app.viewWidth - 240, 780));
  const cardH = 250;
  const cardX = cx - cardW / 2;
  const cardY = 138;

  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fillStyle = 'rgba(10, 12, 32, 0.8)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = progress.completed ? '#00ffcc' : 'rgba(255, 255, 255, 0.3)';
  ctx.stroke();
  ctx.restore();

  // Difficulty face, left side of the card. Falls back to text if the
  // frame is missing so the card never renders empty.
  const face = uiAssets.frames ? difficultyFrame(level.difficulty) : null;
  if (face && sheet && sheet.has(face)) {
    sheet.draw(ctx, face, cardX + 106, cardY + cardH / 2, { height: 150 });
  } else {
    big.draw(ctx, `${level.difficulty}`, cardX + 106, cardY + cardH / 2, {
      scale: big.scaleForCap(72), align: 'center', anchor: 'middle',
    });
  }

  // Name and stats
  const textX = cardX + 200;
  gold.draw(ctx, level.name, textX, cardY + 34, {
    scale: gold.scaleForCap(42), anchor: 'top',
  });

  big.draw(ctx, `BEST ${progress.bestPercent}%`, textX, cardY + 116, {
    scale: big.scaleForCap(19), anchor: 'top', alpha: 0.75,
  });

  big.draw(ctx, `ATTEMPTS ${progress.attempts}`, textX, cardY + 148, {
    scale: big.scaleForCap(19), anchor: 'top', alpha: 0.75,
  });

  big.draw(ctx, progress.completed ? 'COMPLETE' : 'NOT COMPLETE', textX, cardY + 186, {
    scale: big.scaleForCap(21), anchor: 'top', alpha: 0.95,
  });

  big.draw(ctx, `${app.levelIndex + 1} / ${ids.length}`, cardX + cardW - 26, cardY + 22, {
    scale: big.scaleForCap(22), align: 'right', anchor: 'top', alpha: 0.7,
  });

  // Arrows flank the card
  const midY = cardY + cardH / 2;

  spriteButton('prev', uiAssets.frames.arrowPrev, cardX - 68, midY, 72, () => {
    app.levelIndex = (app.levelIndex - 1 + ids.length) % ids.length;
  });

  spriteButton('next', uiAssets.frames.arrowNext, cardX + cardW + 68, midY, 72, () => {
    app.levelIndex = (app.levelIndex + 1) % ids.length;
  });

  spriteButton('level-play', uiAssets.frames.play, cx, cardY + cardH + 108, 168, () => {
    playSFX('play');
    startLevel(levelId);
  });

  textButton('level-icons', 'ICONS', 130, app.viewHeight - 56, 170, 52, () => {
    openIconsScreen();
  });

  spriteButton('back', uiAssets.frames.menu, 62, 58, 68, () => {
    setScreen('menu');
  });
}

// -------------------- Gameplay --------------------
async function startLevel(levelId) {
  const level = await getLevelLayout(levelId); // async: MainLevelSetup JSON is fetched
  beginGameplay(level);
}

// Everything gameplay needs to run a level layout — shared by the main levels
// and the editor's TEST button (which builds its layout from the create grid).
function beginGameplay(level) {
  app.game = {
    level,
    // NOTE: must use the *gameplay* height, not app.viewHeight — at this point
    // setScreen('playing') hasn't run yet so app.viewHeight is still 720.
    world: { groundY: AppConfig.playViewHeight - GROUND_LIFT, ceilingY: 0 },
    player: new Player(EntityTypes.CUBE),
    // Icons are composited into their own canvas and blitted where the player
    // is, so rotation and scale stay independent of the hitbox that collides
    iconCanvas: document.createElement('canvas'),
    cameraX: 0,
    percent: 0,
    alive: true,
    finished: false,
    orbReady: null,
    padCooldown: 0,
    elapsed: 0,
    lastY: 0,
    particles: [],
    restartTimer: null,
    bannerTimer: 0,
    // Solid objects (blocks + platforms) for Spider teleport targets.
    // The spider can cling to any solid surface, not just world bounds.
    solidObjects: level.objects.filter((o) => o.type === 'block' || o.type === 'platform'),
  };

  app.game.player.setWorld(app.game.world);
  app.game.triggerIndex = 0;   // triggers fire left-to-right as the camera passes

  // Initial tint from the level's base colors — these persist until a color
  // trigger replaces them, if/when triggers are added to the level later.
  // `settled: true` keeps the tint at full strength (drawTint checks it).
  app.game.bgTint = { color: level.backgroundCol, from: null, t: 1, duration: 1, settled: true };
  app.game.groundTint = { color: level.ground1Col, from: null, t: 1, duration: 1, settled: true };
  setScreen('playing');
  resetLevel();
}

// -------------------- Triggers --------------------
// Invisible during gameplay (the future creation tab will draw them). Color
// triggers tween their channel's tint over `duration`; move/pulse are parsed
// and stored but inert until the editor lands.
function updateTriggers(game, dt) {
  const triggers = game.level.triggers || [];
  while (game.triggerIndex < triggers.length &&
         triggers[game.triggerIndex].x <= game.cameraX + AppConfig.cameraOffsetX) {
    const trigger = triggers[game.triggerIndex++];
    if (trigger.triggerType !== 'color') continue; // move/pulse: editor-only for now
    const channel = trigger.channel === 'ground' ? 'groundTint' : 'bgTint';
    game[channel] = { color: trigger.color, from: null, t: 0, duration: Math.max(0.01, trigger.duration) };
  }

  for (const key of ['bgTint', 'groundTint']) {
    const tint = game[key];
    if (!tint) continue;
    tint.t = Math.min(tint.duration, tint.t + dt);
    if (tint.t >= tint.duration) game[key] = { ...tint, settled: true };
  }
}

function drawTint(channel) {
  const game = app.game;
  const tint = game && game[channel];
  if (!tint || !tint.color) return;
  ctx.save();
  // A settled tint IS the level's actual color and should read at full
  // strength — but painting it on top at alpha 1 in normal blend mode just
  // erases the background art underneath with a flat rectangle. 'multiply'
  // recolors what's already drawn (the bg image's shapes/texture) instead of
  // replacing it, so the art stays visible, tinted to the level's color.
  // A trigger still mid-fade uses a partial normal-blend overlay, so the
  // color visibly eases in rather than snapping straight to a full recolor.
  if (tint.settled) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1.1;
  } else {
    ctx.globalAlpha = Math.min(1.1, tint.t / tint.duration);
  }
  ctx.fillStyle = tint.color;
  if (channel === 'bgTint') {
    ctx.fillRect(0, 0, app.viewWidth, game.world.groundY);
  } else {
    ctx.fillRect(0, game.world.groundY, app.viewWidth, app.viewHeight - game.world.groundY);
  }
  ctx.restore();
}

function resetLevel() {
  const game = app.game;
  if (!game) return;

  clearTimeout(game.restartTimer);
  game.restartTimer = null;

  // Editor playtests run under the throwaway 'draft' id — don't pollute the
  // save file with attempt records for a level that doesn't exist yet.
  if (!game.level.draft) recordLevelAttempt(game.level.id);

  game.player.reset(EntityTypes.CUBE);
  game.player.setWorld(game.world);
  game.player.x = 60;
  game.player.y = game.world.groundY - game.player.height / 2;
  game.player.onGround = true; // so a press on frame 0 is never dropped
  game.player.onSolid = false;

  game.cameraX = 0;
  game.percent = 0;
  game.alive = true;
  game.finished = false;
  game.orbReady = null;
  game.padCooldown = 0;
  game.elapsed = 0;
  game.particles = [];
  game.bannerTimer = 0;
  game.lastY = game.player.y;

  applyGameIcon(EntityTypes.CUBE);
  startLevelSong(game.level);
}

async function applyGameIcon(mode) {
  const game = app.game;
  if (!game) return;

  // Modes with no art yet borrow the Cube icon, so the player is never invisible
  const numbers = getAvailableIcons(mode);
  const useMode = numbers.length ? mode : EntityTypes.CUBE;
  const usable = getAvailableIcons(useMode);
  if (usable.length === 0) return;

  const saved = playerData.selectedIcons[useMode];
  const number = usable.includes(saved) ? saved : Math.min(...usable);

  try {
    await renderIcon(game.iconCanvas, useMode, number, playerData.colors);
  } catch (err) {
    console.warn(`Could not render the ${useMode} icon:`, err);
  }
}

function spawnBurst(game, x, y, color, count = 16) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 60 + Math.random() * 220;
    game.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      color,
    });
  }
}

function updateParticles(game, dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function updateGame(dt) {
  const game = app.game;
  if (!game) return;

  updateParticles(game, dt);
  if (game.padCooldown > 0) game.padCooldown -= dt;
  if (game.bannerTimer > 0) game.bannerTimer -= dt;

  if (!game.alive || game.finished) return;

  game.elapsed += dt;

  // Remember where we were so landOn() can tell a landing from a side hit
  game.lastY = game.player.y;

  updateTriggers(game, dt);
  game.player.update(dt, game.world);

  game.cameraX = Math.max(0, game.player.x - AppConfig.cameraOffsetX);
  game.percent = clamp((game.player.x / game.level.length) * 100, 0, 100);

  resolveGameCollisions(game);
}

// -------------------- Gameplay collisions --------------------
// Levels author y as height-above-ground; convert to canvas space here.
function objectBox(obj, world) {
  const bottom = world.groundY - obj.y;
  return { left: obj.x, right: obj.x + obj.w, top: bottom - obj.h, bottom };
}

function playerOverlaps(player, box) {
  return player.left < box.right && player.right > box.left &&
         player.top < box.bottom && player.bottom > box.top;
}

// GD-style forgiving hitboxes: both the player and the spike are shrunk before
// testing, so grazing a spike's edge (or landing juust beside it) survives the
// way it does in real Geometry Dash. Visuals stay full-size; only the lethal
// box is smaller and bottom-anchored (spikes kill at their core, not their air).
function spikeHitbox(box) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const insetX = w * 0.30;   // keep the middle ~40% horizontally
  const cutTop = h * 0.45;   // ignore the empty air above the tip
  const cutBottom = h * 0.08; // forgive the very base where it meets the ground
  return {
    left: box.left + insetX,
    right: box.right - insetX,
    top: box.top + cutTop,
    bottom: box.bottom - cutBottom,
  };
}

// True when the player lands safely on top of (or underneath, when gravity is
// flipped) a solid object. Any other way of touching it is fatal.
//
// Support and snapping use the ROTATION hitbox (full-size, never resizes), so
// the sprite rests ON the block instead of sinking into it. The tolerance for
// "was I above the surface last frame" includes this frame's travel, so a fast
// fall that crosses the block top in one step still lands instead of dying.
function landOn(game, box) {
  const player = game.player;
  const rot = player.boxRotation;
  const rotH = (player.config.rotationHitbox || player.hitbox).h;
  const lastRotBottom = game.lastY + rotH / 2;
  const lastRotTop = game.lastY - rotH / 2;
  // Shave 2px off the block's horizontal edges: grazing the seam between two
  // adjacent blocks is not a side hit, and landing on a corner is a landing.
  const hOverlap = rot.left < box.right - 2 && rot.right > box.left + 2;

  if (player.gravityDir === 1) {
    const fall = Math.max(0, player.y - game.lastY);        // px moved down
    const wasAbove = lastRotBottom - box.top <= 6 + fall;    // covers tunneling
    const onSurface = rot.bottom >= box.top - 2 &&
                      rot.bottom <= box.top + Math.max(10, fall + 2);

    if (!hOverlap || !wasAbove || !onSurface || player.velocityY < 0) return false;

    player.y = box.top - rotH / 2;
    player.velocityY = 0;
    player.onGround = true;
    player.onSolid = true;
    return true;
  }

  const rise = Math.max(0, game.lastY - player.y);          // px moved up
  const wasBelow = box.bottom - lastRotTop <= 6 + rise;
  const onSurface = rot.top <= box.bottom + 2 &&
                    rot.top >= box.bottom - Math.max(10, rise + 2);

  if (!hOverlap || !wasBelow || !onSurface || player.velocityY > 0) return false;

  player.y = box.bottom + rotH / 2;
  player.velocityY = 0;
  player.onCeiling = true;
  player.onSolid = true;
  return true;
}

// Flying modes (Ship/UFO/Wave) bump and SLIDE along a block's underside
// instead of dying — GD ship corridors are built out of ceilings you ride.
// The ship in particular gets a more generous tolerance so it can hold to
// a ceiling and slide sideways without falling off, matching GD's ship feel.
function bumpCeiling(game, box) {
  const player = game.player;
  const rot = player.boxRotation;
  const rotH = (player.config.rotationHitbox || player.hitbox).h;
  const lastRotTop = game.lastY - rotH / 2;
  const rise = Math.max(0, game.lastY - player.y);
  // Wider horizontal tolerance for ship so it can ride narrow ceilings
  const hMargin = player.type === EntityTypes.SHIP ? 4 : 2;
  const hOverlap = rot.left < box.right - hMargin && rot.right > box.left + hMargin;
  // More generous vertical tolerance — allow the ship to catch the ceiling
  // even if it's coming in a bit hot
  const wasBelow = box.bottom - lastRotTop <= 8 + rise;
  const tolerance = player.type === EntityTypes.SHIP
    ? Math.max(14, rise + 4)   // ship can slide along, so give it a bigger window
    : Math.max(10, rise + 2);
  const onSurface = rot.top <= box.bottom + 4 &&
                    rot.top >= box.bottom - tolerance;

  if (!hOverlap || !wasBelow || !onSurface) return false;
  // Ship can hold to a ceiling even when drifting down slightly — in GD the
  // ship sticks to ceilings as long as you're holding, so a small downward
  // velocity does not immediately break the ride.
  if (player.type !== EntityTypes.SHIP && player.velocityY > 0) return false;
  if (player.type === EntityTypes.SHIP && player.velocityY > 60) return false;

  player.y = box.bottom + rotH / 2;
  player.velocityY = 0;
  player.onCeiling = true;
  player.onSolid = true;
  return true;
}

// The object list is sorted by x and short, so a window filter is plenty
function activeObjects(game) {
  const from = game.cameraX - TILE * 4;
  const to = game.cameraX + app.viewWidth + TILE * 4;
  return game.level.objects.filter((obj) => obj.x + obj.w >= from && obj.x <= to);
}

function resolveGameCollisions(game) {
  const player = game.player;
  game.orbReady = null;
  player.onSolid = false; // re-proved every frame by landOn()

  for (const obj of activeObjects(game)) {
    const box = objectBox(obj, game.world);
    if (!playerOverlaps(player, box)) continue;

    switch (obj.type) {
      case BlockType.PORTAL:
        if (player.type !== obj.mode) enterPortal(game, obj.mode);
        break;

      case BlockType.PAD: {
        // 2.1 transporters (per the wiki): yellow medium jump, pink small,
        // red big, blue flips gravity. Pads fire on contact, no click needed.
        const kind = PAD_KINDS[obj.kind] || PAD_KINDS.yellow;
        if (game.padCooldown <= 0) {
          if (kind.flip) player.applyGravityPad();
          else player.velocityY = -kind.boost * player.gravityDir;
          game.padCooldown = 0.25;
          spawnBurst(game, player.x, player.y, kind.color, 12);
        }
        break;
      }

      case BlockType.ORB:
        game.orbReady = obj; // consumed by the next tap, exactly like GD
        break;

      case BlockType.FINISH:
        completeLevel();
        return;

      case BlockType.SPIKE: {
        // GD hazard test: the spike's small core vs the player's RED hitbox.
        // The RED box (config.hazardHitbox) is the small centered inner box —
        // grazing a spike's corner survives, exactly like GD.
        const lethal = spikeHitbox(box);
        const red = player.boxRed;
        if (red.left < lethal.right && red.right > lethal.left &&
            red.top < lethal.bottom && red.bottom > lethal.top) {
          killPlayer();
          return;
        }
        break;
      }

      case BlockType.PLATFORM:
        landOn(game, box); // never lethal — you pass through from any other side
        break;

      default: { // BLOCK
        const rot = player.boxRotation;
        const touching = rot.left < box.right && rot.right > box.left &&
                         rot.top < box.bottom && rot.bottom > box.top;
        if (!touching) break;          // rotation box missed it entirely
        if (landOn(game, box)) break;  // safe landing on the gravity side
        if (CEILING_SLIDE.has(player.type) && bumpCeiling(game, box)) break;

        // Only fatal when the BLUE hitbox touches the block in a way that
        // isn't a safe landing or ceiling slide. The player can walk off the
        // top edge of a block without dying — only touching the side or the
        // "wrong" face (bottom when gravity pulls down, top when gravity pulls
        // up) is lethal.
        if (player.left < box.right && player.right > box.left &&
            player.top < box.bottom && player.bottom > box.top) {
          const blueH = player.bottom - player.top;

          // How far past the block's top/bottom edge is the player's blue box?
          // Positive = player is on the correct side (gravity side) of the block.
          // Negative = player has crossed to the wrong side.
          const overTop    = player.bottom - box.top;    // +ve = player bottom is below block top
          const underBottom = box.bottom - player.top;   // +ve = player top is above block bottom

          // The player is "above" the block (on the gravity side) if their
          // blue box is mostly on the correct side. If they've crossed the
          // halfway point into the block, they're hitting the side or wrong face.
          const onGravitySide = player.gravityDir === 1
            ? overTop > -2 && player.bottom <= box.top + blueH * 0.55
            : underBottom > -2 && player.top >= box.bottom - blueH * 0.55;

          // Ceiling-siding modes (Ship/UFO/Wave) can also survive on the
          // underside of a block when sliding along it. The player's blue box
          // top is at or just below the block's bottom edge (clinging to the
          // ceiling), and the player isn't falling away fast.
          const ceilingGlide = CEILING_SLIDE.has(player.type) &&
            player.top >= box.bottom - 8 &&
            player.top <= box.bottom + 4 &&
            player.velocityY <= 80;

          // Side or wrong-face hit: the player has penetrated into the block
          // beyond the safe edge zone. Kill unless they're ceiling-gliding.
          const wrongSide = !onGravitySide && !ceilingGlide;

          if (wrongSide) {
            killPlayer();
            return;
          }
          break;
        }
        break;
      }
    }
  }
}

function enterPortal(game, mode) {
  // Yellow gravity portal = upside-down (pull up); blue = back to normal pull.
  // These change the pull without touching the current gamemode.
  if (GRAVITY_PORTALS.has(mode)) {
    const wantDir = mode === 'GravityUp' ? -1 : 1;
    if (game.player.gravityDir !== wantDir) {
      game.player.gravityDir = wantDir;
      game.player.velocityY = 0;
    }
    spawnBurst(game, game.player.x, game.player.y, PORTAL_COLORS[mode] || '#ffe66d', 14);
    return;
  }

  game.player.changeMode(mode);
  applyGameIcon(mode);
  spawnBurst(game, game.player.x, game.player.y, PORTAL_COLORS[mode] || '#b388ff', 14);
}

function killPlayer() {
  const game = app.game;
  if (!game || !game.alive) return;

  game.alive = false;
  game.player.alive = false;
  stopLevelSong();
  playSFX('death');
  spawnBurst(game, game.player.x, game.player.y, playerData.colors.primary, 28);

  game.restartTimer = setTimeout(() => {
    if (app.screen === 'playing') resetLevel();
  }, AppConfig.deathPause);
}

function completeLevel() {
  const game = app.game;
  if (!game || game.finished) return;

  game.finished = true;
  game.percent = 100;
  game.bannerTimer = AppConfig.finishPause / 1000;

  stopLevelSong();
  markLevelComplete(game.level.id, { percent: 100 });
  playSFX('complete');
  spawnBurst(game, game.player.x, game.player.y, playerData.colors.glow, 40);

  game.restartTimer = setTimeout(() => {
    if (app.screen !== 'playing') return;
    // A draft playtest hands control back to the editor, not the level select.
    if (game.level.draft) quitToCreate();
    else quitToLevels(); // hand the player back to the level select
  }, AppConfig.finishPause);
}

// -------------------- Pause and exit --------------------
// Every route out of a run goes through here, so audio can never be left on.
function enterPause() {
  if (app.screen !== 'playing' || !app.game) return;
  pauseLevelSong(); // freeze the track where it is — resuming picks it back up
  pauseMenuMusic();
  setScreen('paused');
}

function resumeFromPause() {
  if (app.screen !== 'paused' || !app.game) return;
  setScreen('playing');
  resumeLevelSong(); // continue exactly where the pause left the track
}

function restartFromPause() {
  if (!app.game) return;
  setScreen('playing');
  resetLevel();
}

function quitToMenu() {
  stopLevelSong();
  app.game = null;
  setScreen('menu');
}

function quitToLevels() {
  stopLevelSong();
  app.game = null;
  setScreen('levels');
}

function quitToCreate() {
  stopLevelSong();
  app.game = null;
  setScreen('create');
}

// Quitting a run goes back where it came from: a draft playtest returns to the
// editor, a main level returns to the level select.
function quitFromRun() {
  if (app.game && app.game.level && app.game.level.draft) quitToCreate();
  else quitToLevels();
}

// -------------------- Create (level editor) --------------------
// A GD-style tile-grid editor over the same parts catalog the gameplay renderer
// uses. Everything is authored in TILE coordinates (Levels.js' JSON schema), so
// the exported file drops straight into MainLevelSetup/ and plays.
//
// The shipped files build up to 14 tiles above the ground line (StereoMadness
// reaches y = 13), so the grid has to be that tall to hold them.
const CREATE_ROWS = 14;
// An imported file can't grow the grid forever — past this the cells would be
// smaller than the artwork.
const CREATE_MAX_ROWS = 20;

// Header fields an imported MainLevelSetup file carries over into the export.
const CREATE_HEADER_KEYS = [
  'name', 'difficulty', 'song', 'lengthPx', 'backgroundCol', 'ground1Col',
  'ground2Col', 'lineCol', 'partTheme',
];

// Only these types read w/h in Levels.js, so only these accept the SIZE setting.
const CREATE_SIZED_TYPES = new Set(['block', 'spike', 'platform']);

// The footprints the hand-authored levels actually use (they build big slabs
// out of 2x1 .. 3x3 blocks), offered as one cycling SIZE button.
const CREATE_SIZES = [
  [1, 1], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 2], [3, 3],
];

const createScreen = {
  tool: BlockType.BLOCK,
  kind: null,        // catalog kind (block texture / spike style / orb colour / portal mode)
  camX: 0,           // horizontal camera in tiles
  rows: CREATE_ROWS, // grid height in tiles (y = 0 is the ground row)
  cols: 32,          // visible grid width in tiles
  cells: new Map(),  // "tx,ty" -> { t, kind?, mode?, flip? }
  dragging: false,
  eraseMode: false,
  message: '',
  messageTimer: 0,
  lastKey: null,     // suppress double-paint from down+move on the same cell
  name: 'My Level',  // written into the exported JSON
  header: null,      // header of the file this draft was imported from, if any
  sizeW: 1,          // footprint stamped on new blocks / spikes / platforms
  sizeH: 1,
  undo: [],          // snapshots of `cells`, newest last
  saveTimer: null,   // debounce handle for the localStorage autosave
  restored: false,   // draft restored once per page load
};

// Palette entry label + preview sprite resolution. kind doubles as the portal
// mode, which is exactly how LEVEL_PARTS keys its portal kinds.
//
// Reads `type` (a palette entry) or `tool` (createScreen's active selection), so
// the same id is produced for "the chip that is selected" and "the part about to
// be placed" — the highlight and the active part can't disagree.
function createEntryId(entry) {
  if (!entry) return '';
  const type = entry.type || entry.tool || '';
  return `${type}|${entry.kind || ''}`;
}

// Chips are only ~70px wide, so labels are kept to a handful of characters.
// The sprite preview is what actually identifies a part; the label is a backup
// for whenever the atlases are missing and the previews fall back to colour.
const CREATE_KIND_ABBR = {
  yellow: 'YEL', pink: 'PNK', red: 'RED', blue: 'BLU', green: 'GRN',
  brick: 'BRICK', plank: 'PLANK', outline: 'OUTLINE', design: 'DESIGN',
  color: 'COLOR', ice: 'ICE', fake: 'FAKE',
};

const CREATE_MODE_ABBR = {
  [EntityTypes.CUBE]: 'CUBE',
  [EntityTypes.SHIP]: 'SHIP',
  [EntityTypes.BALL]: 'BALL',
  [EntityTypes.UFO]: 'UFO',
  [EntityTypes.WAVE]: 'WAVE',
  [EntityTypes.ROBOT]: 'ROBOT',
  [EntityTypes.SPIDER]: 'SPIDER',
  GravityUp: 'GRAV+',     // + = gravity flipped UP (pull towards the ceiling)
  GravityDown: 'GRAV-',   // - = back to normal
};

function createAbbr(kind, table) {
  const key = String(kind || '');
  return table[key] || key.slice(0, 7).toUpperCase();
}

// Every part the game can place, in the order the palette shows them. Built
// from the same LEVEL_PARTS catalog the renderer reads, so a new catalog kind
// appears here automatically — with the collision the catalog gives it.
function createPalette() {
  const palette = [];
  const part = (type) => (typeof LEVEL_PARTS === 'undefined') ? null : LEVEL_PARTS[type];

  const withKinds = (type, label, abbr, includeBase = true) => {
    const definition = part(type);
    if (!definition) return;
    // The type default first (no kind), then one chip per catalog kind.
    // `includeBase: false` is for types whose kinds already enumerate every
    // option — a portal's default frame IS the Cube portal, so listing both
    // would put two identical CUBE chips in the palette.
    if (includeBase) palette.push({ type, kind: null, label });
    for (const kind of Object.keys(definition.kind || {})) {
      palette.push({ type, kind, label: abbr ? abbr(kind) : kind.toUpperCase() });
    }
  };

  withKinds(BlockType.BLOCK, 'BLOCK', (k) => createAbbr(k, CREATE_KIND_ABBR));
  withKinds(BlockType.SPIKE, 'SPIKE', (k) => createAbbr(k, CREATE_KIND_ABBR));

  if (part(BlockType.PLATFORM)) {
    palette.push({ type: BlockType.PLATFORM, kind: null, label: 'PLATFORM' });
  }

  // Pads and orbs pick their kind from the physics tables, because their kind IS
  // their behaviour (boost strength / gravity flip) rather than a texture.
  for (const kind of Object.keys(PAD_KINDS || {})) {
    palette.push({ type: BlockType.PAD, kind, label: `PAD ${createAbbr(kind, CREATE_KIND_ABBR)}` });
  }
  for (const kind of Object.keys(ORB_KINDS || {})) {
    palette.push({ type: BlockType.ORB, kind, label: `ORB ${createAbbr(kind, CREATE_KIND_ABBR)}` });
  }

  // Portals: one chip per mode the catalog has art for, including the two
  // gravity portals (which flip the pull without changing the mode). No separate
  // default chip — every portal is one of these modes.
  withKinds(BlockType.PORTAL, null, (k) => createAbbr(k, CREATE_MODE_ABBR), false);

  palette.push({ type: BlockType.FINISH, kind: null, label: 'FINISH' });
  return palette;
}

function createActiveEntry() {
  const palette = createPalette();
  return palette.find((e) => createEntryId(e) === createEntryId(createScreen)) || palette[0];
}

// The catalog sprite one palette entry / placed cell should draw with. Cached:
// it resolves through the same partFor -> objectSprite path gameplay uses, so
// the palette always shows the real art. Returns null for vector-only parts
// (pads, finish) and when the atlases never loaded.
//
// Takes the entry/cell itself rather than loose args, because a portal keys its
// sprite off `mode` while every other part keys off `kind` — passing the object
// through means partFor applies the same rule here as it does in gameplay.
const createPreviewCache = new Map();

function createPreviewSprite(cell) {
  if (!cell) return null;
  const key = `${cell.type || cell.t}|${cell.kind || cell.mode || ''}`;
  if (createPreviewCache.has(key)) return createPreviewCache.get(key);

  let sprite = null;
  try {
    const fake = {
      type: cell.type || cell.t,
      kind: cell.kind ?? null,
      mode: cell.mode ?? null,
    };
    sprite = objectSprite({ ...fake, part: partFor(fake) });
  } catch (err) {
    sprite = null;
  }
  createPreviewCache.set(key, sprite || null);
  return sprite || null;
}

// -------------------- Create undo --------------------
// One snapshot per stroke (a press, or a whole drag while the button is held),
// so a mis-drag is one undo instead of forty. Snapshots are shallow clones of
// the cell objects — they're never mutated after being stored.
const CREATE_UNDO_LIMIT = 48;

function createPushUndo() {
  createScreen.undo.push([...createScreen.cells].map(([key, cell]) => [key, { ...cell }]));
  if (createScreen.undo.length > CREATE_UNDO_LIMIT) createScreen.undo.shift();
}

function createUndo() {
  const snapshot = createScreen.undo.pop();
  if (!snapshot) {
    createStatus('Nothing to undo', 1.5);
    return;
  }
  createScreen.cells = new Map(snapshot);
  createScreen.lastKey = null;
  createSaveSoon();
  createStatus('Undo', 1.5);
}

function createStatus(text, seconds = 2.5) {
  createScreen.message = text;
  createScreen.messageTimer = seconds;
}

// The editor has no moving parts except its status message, so this is the whole
// per-frame update: expire the message instead of leaving it on screen until the
// next action overwrites it.
function updateCreate(dt) {
  if (createScreen.messageTimer <= 0) return;
  createScreen.messageTimer = Math.max(0, createScreen.messageTimer - dt);
  if (createScreen.messageTimer === 0) createScreen.message = '';
}

// -------------------- Create persistence --------------------
// The grid autosaves to localStorage, so a refresh (or a trip into a playtest
// that goes wrong) never costs you a level you were half way through building.
// Every call is wrapped: storage throws in private mode / when the quota is
// full, and losing an autosave must never break the editor.
const CREATE_STORAGE_KEY = 'lunardash.create.draft.v1';

function createSaveSoon() {
  clearTimeout(createScreen.saveTimer);
  // Coalesce a drag stroke into one write instead of one per painted tile.
  createScreen.saveTimer = setTimeout(createSaveDraft, 400);
}

function createSaveDraft() {
  try {
    const payload = {
      version: 1,
      camX: createScreen.camX,
      name: createScreen.name,
      header: createScreen.header,
      size: [createScreen.sizeW, createScreen.sizeH],
      cells: [...createScreen.cells].map(([key, cell]) => [key, cell]),
    };
    localStorage.setItem(CREATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Not fatal: the editor simply won't survive a refresh.
  }
}

function createLoadDraft() {
  let raw;
  try {
    raw = localStorage.getItem(CREATE_STORAGE_KEY);
  } catch (err) {
    return false;
  }
  if (!raw) return false;

  try {
    const payload = JSON.parse(raw);
    const cells = Array.isArray(payload.cells) ? payload.cells : [];
    createScreen.cells = new Map(cells.filter(
      (pair) => Array.isArray(pair) && typeof pair[0] === 'string' && pair[1] && pair[1].t));
    if (Number.isFinite(payload.camX)) createScreen.camX = Math.max(0, payload.camX);
    if (typeof payload.name === 'string' && payload.name.trim()) createScreen.name = payload.name;
    if (payload.header && typeof payload.header === 'object') createScreen.header = payload.header;
    if (Array.isArray(payload.size) && payload.size.length === 2) {
      const [w, h] = payload.size.map(Number);
      if (Number.isFinite(w) && Number.isFinite(h) && w >= 1 && h >= 1) {
        createScreen.sizeW = w;
        createScreen.sizeH = h;
      }
    }
    return createScreen.cells.size > 0;
  } catch (err) {
    return false;
  }
}

function createClearDraft() {
  try { localStorage.removeItem(CREATE_STORAGE_KEY); } catch (err) { /* ignore */ }
}

// -------------------- Create import --------------------
// Reads a MainLevelSetup JSON (the shape createExportData writes, and the shape
// the main levels ship in) back onto the grid, so you can open a shipped level,
// edit it, and re-export. Uses a throwaway <input type="file"> because a page
// can't read MainLevelSetup/ off disk on its own.
function createImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) createImportJsonFile(file);
    else createStatus('No file chosen', 2);
  });
  input.click();
}

async function createImportJsonFile(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch (err) {
    createStatus('That file is not valid JSON', 3);
    return;
  }

  const objects = Array.isArray(raw && raw.objects) ? raw.objects : null;
  if (!objects) {
    createStatus('No "objects" array in that file', 3);
    return;
  }

  const cells = new Map();
  let skipped = 0;
  let topRow = createScreen.rows - 1;
  for (const obj of objects) {
    // The tile schema is the only one the editor grid can represent; a level
    // authored in px (lengthPx without tiles) still lines up because x/y are
    // already in tiles here.
    const tx = Math.round(Number(obj.x) || 0);
    const ty = Math.round(Number(obj.y) || 0);
    const type = String(obj.t || obj.type || '').toLowerCase();
    if (!type || tx < 0 || ty < 0 || ty >= CREATE_MAX_ROWS) {
      skipped++;
      continue;
    }
    topRow = Math.max(topRow, ty);
    const cell = { t: type };
    if (obj.mode) cell.mode = obj.mode;
    else if (obj.kind) cell.kind = obj.kind;
    if (obj.flip) cell.flip = true;
    // Footprints are copied verbatim — the shipped levels are built from 2x1 ..
    // 3x3 blocks, so dropping them would shrink half a level on re-export.
    if (Number.isFinite(Number(obj.w)) && obj.w !== null) cell.w = Number(obj.w);
    if (Number.isFinite(Number(obj.h)) && obj.h !== null) cell.h = Number(obj.h);
    cells.set(createCellKey(tx, ty), cell);
  }

  if (cells.size === 0) {
    createStatus('Nothing in that file fits the grid', 3);
    return;
  }

  // Grow the grid so the import isn't silently clipped at the top.
  createScreen.rows = clamp(topRow + 1, CREATE_ROWS, CREATE_MAX_ROWS);
  createScreen.cells = cells;

  // Adopt the file's own header, so a re-export is a faithful copy.
  const header = {};
  for (const k of CREATE_HEADER_KEYS) {
    if (raw[k] !== undefined) header[k] = raw[k];
  }
  if (typeof header.name === 'string' && header.name.trim()) createScreen.name = header.name.trim();
  createScreen.header = Object.keys(header).length > 0 ? header : null;
  createScreen.camX = 0;
  createScreen.lastKey = null;
  createSaveSoon();

  const note = skipped > 0 ? ` (${skipped} outside the grid)` : '';
  createStatus(`Imported ${cells.size} parts from ${file.name}${note}`, 4);
}

// Exposes the import to the tester/debug console, and gives index.html a hook.
window.importLevelJson = createImportJsonFile;

function openCreateScreen() {
  setScreen('create');
  createScreen.dragging = false;
  createScreen.lastKey = null;
  // Restore once per page load — coming back from a playtest must NOT wipe the
  // grid that's still sitting in memory.
  if (!createScreen.restored) {
    createScreen.restored = true;
    if (createLoadDraft()) createStatus('Restored your saved draft', 2.5);
  }
}

// -------------------- Create grid geometry --------------------
const CREATE_TOP = 170;             // title + toolbar + hint row above the grid
const CREATE_CHIP_W = 66;           // palette chip size
const CREATE_CHIP_H = 56;
const CREATE_CHIP_GAP = 8;
const CREATE_PALETTE_PAD = 12;
const CREATE_PALETTE_GAP = 12;      // vertical gap between the grid and the palette
const CREATE_MAX_CHIP_ROWS = 4;     // beyond this a window is simply too narrow

// The palette grows with LEVEL_PARTS (every block texture, spike style, orb
// colour, portal mode...), so its height is derived from how many rows the
// current window needs — the grid then takes whatever is left over.
function createPaletteLayout() {
  const count = createPalette().length;
  const perRow = Math.max(1, Math.floor(
    (app.viewWidth - CREATE_PALETTE_PAD * 2) / (CREATE_CHIP_W + CREATE_CHIP_GAP)));
  const needed = Math.ceil(count / perRow);
  const rows = Math.min(CREATE_MAX_CHIP_ROWS, Math.max(1, needed));
  return {
    count, perRow, rows, needed,
    chipW: CREATE_CHIP_W, chipH: CREATE_CHIP_H, gap: CREATE_CHIP_GAP,
    capacity: rows * perRow,
    height: rows * CREATE_CHIP_H + (rows - 1) * CREATE_CHIP_GAP + CREATE_PALETTE_PAD * 2,
  };
}

function createGridOrigin() {
  // Grid + gap + palette must sum to what's left of the view, so the bottom
  // chip row is never clipped off-screen.
  const paletteH = createPaletteLayout().height + CREATE_PALETTE_GAP;
  const availH = app.viewHeight - CREATE_TOP - paletteH;
  const cell = Math.max(14, Math.floor(availH / (createScreen.rows + 1))); // +1: ground row below y=0
  const gridW = createScreen.cols * cell;
  const gridH = (createScreen.rows + 1) * cell;
  const gridX = Math.max(16, Math.floor((app.viewWidth - gridW) / 2));
  const gridY = CREATE_TOP;
  return { cell, gridX, gridY, gridW, gridH };
}

// Screen px -> tile coords. ty = tiles ABOVE the ground row, matching JSON.
function createTileAt(px, py) {
  const { cell, gridX, gridY, gridH } = createGridOrigin();
  const tx = Math.floor((px - gridX) / cell) + Math.floor(createScreen.camX);
  const ty = Math.floor((gridY + gridH - cell - py) / cell);
  return { tx, ty };
}

function createCellKey(tx, ty) {
  return `${tx},${ty}`;
}

function createCellRect(tx, ty) {
  const { cell, gridX, gridY, gridH } = createGridOrigin();
  const camTiles = Math.floor(createScreen.camX);
  return {
    x: gridX + (tx - camTiles) * cell,
    y: gridY + (createScreen.rows - 1 - ty) * cell,
    w: cell,
    h: cell,
  };
}

// A placed part's footprint on the grid. Levels.js sizes objects in tiles, so a
// 2x3 block has to be drawn 2 tiles wide and 3 tall or a re-opened level would
// read wrong. h defaults to a whole tile for parts that don't set it.
function createPartRect(placed, tx, ty) {
  const rect = createCellRect(tx, ty);
  const cell = rect.w;                       // one tile in px, from createCellRect
  const wTiles = Math.max(1, Number(placed.w) || 1);
  const hTiles = Math.max(0.5, Number(placed.h) || 1);
  rect.w = cell * wTiles;
  rect.h = cell * hTiles;
  rect.y = rect.y + cell - rect.h;           // keep the part's bottom on the tile
  return rect;
}

function createInBounds(tx, ty) {
  return tx >= 0 && ty >= 0 && ty < createScreen.rows;
}

// Steps the SIZE control through the footprints the shipped levels use. The
// state is remembered in the draft so the next placement keeps it.
function createCycleSize() {
  const current = CREATE_SIZES.findIndex(
    ([w, h]) => w === createScreen.sizeW && h === createScreen.sizeH);
  const next = CREATE_SIZES[(current + 1) % CREATE_SIZES.length];
  createScreen.sizeW = next[0];
  createScreen.sizeH = next[1];
  createSaveSoon();
  createStatus(`New parts are ${next[0]} x ${next[1]} tiles`, 1.5);
}

function createSizeLabel() {
  return `SIZE ${createScreen.sizeW}x${createScreen.sizeH}`;
}

// -------------------- Create editing --------------------
function createPlaceAt(tx, ty) {
  if (!createInBounds(tx, ty)) return;
  const key = createCellKey(tx, ty);
  if (key === createScreen.lastKey) return;
  createScreen.lastKey = key;

  // A stroke is one undo step: the tap layer clears `dragging` before the first
  // placement, so only that first call snapshots the grid. Everything painted
  // while the pointer stays down lands in the same step.
  const strokeStart = !createScreen.dragging;
  const snapshot = () => { if (strokeStart) createPushUndo(); };

  if (createScreen.eraseMode) {
    if (!createScreen.cells.has(key)) return;
    snapshot();
    createScreen.cells.delete(key);
    createSaveSoon();
    return;
  }

  const entry = createActiveEntry();
  if (!entry) return;

  const cell = { t: entry.type };
  // A portal's kind IS its target gamemode, and the MainLevelSetup schema names
  // that field `mode` (Levels.js reads `raw.mode` and drives enterPortal with
  // it). Everything else keeps its kind as a pure sprite choice.
  if (entry.type === BlockType.PORTAL) {
    if (entry.kind) cell.mode = entry.kind;
  } else if (entry.kind) {
    cell.kind = entry.kind;
  }

  // Blocks, spikes and platforms are the types Levels.js reads w/h for, so the
  // chosen SIZE is stamped on them. Defaults are left off so the exported file
  // stays as clean as the hand-authored ones.
  if (CREATE_SIZED_TYPES.has(cell.t)) {
    if (createScreen.sizeW > 1) cell.w = createScreen.sizeW;
    if (createScreen.sizeH > 1) cell.h = createScreen.sizeH;
  }

  const existing = createScreen.cells.get(key);
  if (existing && existing.t === cell.t &&
      existing.kind === cell.kind && existing.mode === cell.mode) return; // no change

  snapshot();
  createScreen.cells.set(key, cell);
  createSaveSoon();
}

// -------------------- Create export / playtest --------------------
// Serialises the grid to the MainLevelSetup JSON schema (Levels.js' tile
// format), so "Export" downloads a file that plays with zero conversion.
// The key order matches the shipped levels on purpose — a diff against
// MainLevelSetup/*.json shows only real content changes.
function createExportData() {
  const objects = [];
  const portalModes = new Set();
  // Header fields the imported file declared (name, song, palette, difficulty)
  // are carried through export untouched, so opening a shipped level, nudging
  // it, and exporting gives the file back with only the edits changed.
  const header = createScreen.header || {};

  for (const [key, cell] of createScreen.cells) {
    const [tx, ty] = key.split(',').map(Number);
    const obj = { t: cell.t, x: tx, y: ty };
    if (cell.kind) obj.kind = cell.kind;
    if (cell.w) obj.w = cell.w;
    if (cell.h) obj.h = cell.h;
    if (cell.flip) obj.flip = true;
    if (cell.mode) {
      obj.mode = cell.mode;
      // Gravity portals flip the pull, they don't change the mode, so they
      // aren't part of the level's gamemode list.
      if (!GRAVITY_PORTALS.has(cell.mode)) portalModes.add(cell.mode);
    }
    objects.push(obj);
  }
  objects.sort((a, b) => a.x - b.x || a.y - b.y);

  const finishX = objects.reduce((m, o) => (o.t === 'finish' ? Math.max(m, o.x) : m), 0);
  const lastX = objects.reduce((m, o) => Math.max(m, o.x + (o.w || 1)), 0);
  // With a finish line the run ends exactly there (the shipped files all set
  // lengthPx = finishTile * TILE); without one, leave a tail so the percent bar
  // reaches 100 at a playable point. An imported file keeps its own length when
  // that is longer than the grid needs.
  const gridLengthPx = (finishX > 0 ? finishX : Math.max(lastX + 20, 40)) * TILE;
  const importedLengthPx = Number(header.lengthPx);
  const lengthPx = Number.isFinite(importedLengthPx) && importedLengthPx > 0
    ? Math.max(gridLengthPx, importedLengthPx)
    : gridLengthPx;

  // Modes are a union, never a duplicate list: the Cube always opens the level,
  // the imported header keeps whatever it declared, and any portal on the grid
  // adds its own mode. Gravity portals are excluded — they flip the pull, they
  // don't change the mode.
  const modes = [];
  const addMode = (mode) => { if (mode && !modes.includes(mode)) modes.push(mode); };
  addMode(EntityTypes.CUBE);
  for (const mode of Array.isArray(header.modes) ? header.modes : []) addMode(mode);
  for (const mode of portalModes) addMode(mode);

  return {
    name: header.name || createScreen.name,
    difficulty: Number.isFinite(Number(header.difficulty)) ? Number(header.difficulty) : 1,
    modes,
    song: header.song || '',
    lengthPx,
    backgroundCol: header.backgroundCol || '#287DFF',
    ground1Col: header.ground1Col || '#0066FF',
    ground2Col: header.ground2Col || '#287DFF',
    lineCol: header.lineCol || '#ffffff',
    objects,
    triggers: [],
    partTheme: header.partTheme || 'classic',
  };
}

// A filename that matches the level name, because the exported file has to be
// dropped into MainLevelSetup/ by hand.
function createExportFilename() {
  const slug = String(createScreen.name || 'MyLevel')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '') || 'MyLevel';
  return `${slug}.json`;
}

// Asks for the level name before writing the file, so exports are tellable
// apart. prompt() is unavailable in some sandboxed frames — the current name
// is used unchanged when it returns nothing.
function createAskForName() {
  try {
    const answer = window.prompt('Level name:', createScreen.name);
    if (answer && answer.trim()) {
      createScreen.name = answer.trim().slice(0, 40);
      createSaveSoon();
    }
  } catch (err) {
    // Keep the existing name.
  }
}

function createDownloadExport() {
  try {
    const data = createExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = createExportFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    createStatus(`Exported ${createExportFilename()} — put it in MainLevelSetup/`, 4);
  } catch (err) {
    console.warn('Level export failed:', err);
    createStatus('Export failed — see console', 3);
  }
}

// Plays the grid through the exact same pipeline a fetched MainLevelSetup file
// goes through (convertJsonObject -> parts -> sprites), so what you test is
// what exports.
function createPlaytest() {
  if (createScreen.cells.size === 0) {
    createStatus('Place some parts first!', 2);
    return;
  }

  const raw = createExportData();
  const objects = [];
  for (const rawObj of raw.objects) {
    const obj = convertJsonObject(rawObj);
    if (obj) objects.push(obj);
  }
  if (objects.length === 0) {
    createStatus('Nothing placeable in the grid', 2);
    return;
  }
  objects.sort((a, b) => a.x - b.x);
  resolveLevelSprites(objects, 'draft');

  const level = {
    id: 'draft',
    name: raw.name,
    song: raw.song || null,
    modes: raw.modes,
    length: raw.lengthPx,
    objects,
    triggers: [],
    backgroundCol: raw.backgroundCol,
    ground1Col: raw.ground1Col,
    ground2Col: raw.ground2Col,
    lineCol: raw.lineCol,
    draft: true,   // editor playtest: don't record attempts, return to the editor
  };

  beginGameplay(level);
}

function renderCreate() {
  drawMenuBackdrop();

  const big = app.resources.fonts.big;
  const cx = app.viewWidth / 2;

  big.draw(ctx, 'CREATE LEVEL', cx, 14, {
    scale: big.scaleForCap(34), align: 'center', anchor: 'top',
  });

  // Toolbar: one evenly-spaced row that shrinks to fit narrow windows, so the
  // editor stays usable at any aspect ratio.
  const barY = 62;
  const barH = 38;
  const tools = [
    { id: 'create-build', label: 'BUILD', active: !createScreen.eraseMode, action: () => {
      createScreen.eraseMode = false;
    } },
    { id: 'create-erase', label: 'ERASE', active: createScreen.eraseMode, action: () => {
      createScreen.eraseMode = true;
    } },
    { id: 'create-undo', label: 'UNDO', w: 84, action: createUndo },
    { id: 'create-clear', label: 'CLEAR', w: 92, action: () => {
      if (createScreen.cells.size === 0) { createStatus('Already empty', 1.5); return; }
      let ok = true;
      try { ok = window.confirm(`Clear all ${createScreen.cells.size} parts?`); } catch (err) { /* no dialogs */ }
      if (!ok) return;
      createPushUndo();
      createScreen.cells.clear();
      createScreen.lastKey = null;
      createSaveSoon();
      createStatus('Cleared — UNDO brings it back', 2.5);
    } },
    { id: 'create-name', label: 'NAME', w: 88, action: createAskForName },
    { id: 'create-size', label: createSizeLabel(), w: 104, action: createCycleSize },
    { id: 'create-import', label: 'IMPORT', w: 96, action: createImportFile },
    { id: 'create-play', label: 'TEST', w: 88, action: createPlaytest },
    { id: 'create-export', label: 'EXPORT', w: 104, action: createDownloadExport },
  ];
  createToolbar(tools, barY, barH);

  spriteButton('create-back', uiAssets.frames.menu, 56, barY + barH / 2, 52, () => {
    createSaveDraft();  // leaving the editor flushes the autosave immediately
    setScreen('menu');
  });

  // Camera scroll + part counter, on the grid's own row.
  const hintY = barY + barH + 10;
  textButton('create-left', '<', app.viewWidth / 2 - 60, hintY + 14, 48, 30, () => {
    createScreen.camX = Math.max(0, createScreen.camX - 4);
  });
  textButton('create-right', '>', app.viewWidth / 2 + 60, hintY + 14, 48, 30, () => {
    createScreen.camX += 4;
  });
  big.draw(ctx, `${Math.floor(createScreen.camX)} – ${Math.floor(createScreen.camX) + createScreen.cols}`, cx, hintY + 14, {
    scale: big.scaleForCap(15), align: 'center', anchor: 'center', alpha: 0.75,
  });
  big.draw(ctx, `"${createScreen.name}"  ${createScreen.cells.size} PARTS  ${createSizeLabel().slice(5)}`, 16, hintY + 14, {
    scale: big.scaleForCap(15), anchor: 'center', alpha: 0.75,
  });
  big.draw(ctx, createScreen.eraseMode ? 'ERASE MODE' : 'Tap or drag the grid to place', app.viewWidth - 16, hintY + 14, {
    scale: big.scaleForCap(15), align: 'right', anchor: 'center',
    alpha: 0.75, color: createScreen.eraseMode ? '#ff8a8a' : '#ffffff',
  });

  if (createScreen.messageTimer > 0 && createScreen.message) {
    big.draw(ctx, createScreen.message, cx, hintY + 34, {
      scale: big.scaleForCap(16), align: 'center', anchor: 'top', alpha: 0.95,
    });
  }

  // Grid: one button per visible cell, so hit-testing and drawing agree.
  const { cell, gridX, gridY, gridW, gridH } = createGridOrigin();
  const camTiles = Math.floor(createScreen.camX);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= createScreen.cols; c++) {
    const x = gridX + c * cell;
    ctx.beginPath(); ctx.moveTo(x, gridY); ctx.lineTo(x, gridY + gridH); ctx.stroke();
  }
  for (let r = 0; r <= createScreen.rows; r++) {
    const y = gridY + r * cell;
    ctx.beginPath(); ctx.moveTo(gridX, y); ctx.lineTo(gridX + gridW, y); ctx.stroke();
  }
  // Ground line under the bottom row.
  ctx.strokeStyle = playerData.colors.primary;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(gridX, gridY + gridH - cell);
  ctx.lineTo(gridX + gridW, gridY + gridH - cell);
  ctx.stroke();
  ctx.restore();

  renderCreateParts(cell, gridX, gridY, gridW, gridH, camTiles);
}

// Placed parts, the invisible tap layer, and the palette strip. Split out of
// renderCreate purely to keep each function a size that reads in one screenful.
function renderCreateParts(cell, gridX, gridY, gridW, gridH, camTiles) {
  const big = app.resources.fonts.big;

  // Placed parts (atlas sprite where resolved, coloured box otherwise).
  for (const [key, placed] of createScreen.cells) {
    const [tx, ty] = key.split(',').map(Number);
    // Cull on the part's footprint, not just its origin tile, so a wide part
    // stays visible while its left tile scrolls off.
    if (tx + (Number(placed.w) || 1) <= camTiles) continue;
    if (tx >= camTiles + createScreen.cols) continue;

    // Portals key their art off `mode`, so the whole cell is passed through.
    const sprite = createPreviewSprite(placed);
    const sheet = sprite ? gameplaySheet(sprite.sheet) : null;
    const rect = createPartRect(placed, tx, ty);

    if (placed.t === 'finish') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = '#111122';
      ctx.fillRect(rect.x, rect.y + rect.h / 2, rect.w / 2, rect.h / 2);
      ctx.fillRect(rect.x + rect.w / 2, rect.y, rect.w / 2, rect.h / 2);
    } else if (sheet && sheet.has(sprite.frame)) {
      const anchor = sprite.anchor || 'center';
      const ay = String(anchor).startsWith('bottom') ? rect.y + rect.h : rect.y + rect.h / 2;
      sheet.draw(ctx, sprite.frame, rect.x + rect.w / 2, ay,
        { width: rect.w, height: rect.h, anchor });
    } else {
      ctx.fillStyle = placed.t === 'spike' ? '#ff5a5a'
        : placed.t === 'orb' ? ((ORB_KINDS[placed.kind] || ORB_KINDS.yellow) || { color: '#ffe66d' }).color
        : placed.t === 'pad' ? ((PAD_KINDS[placed.kind] || PAD_KINDS.yellow) || { color: '#ffe66d' }).color
        : placed.t === 'portal' ? '#b388ff' : '#2b2b52';
      ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    }
  }

  // One invisible tap layer per cell — registered as buttons so taps always hit
  // exactly where drawn, and held drags keep painting new tiles.
  for (let c = 0; c < createScreen.cols; c++) {
    const tx = camTiles + c;
    for (let r = 0; r < createScreen.rows; r++) {
      const ty = createScreen.rows - 1 - r;
      const sx = gridX + c * cell;
      const sy = gridY + r * cell;
      const key = createCellKey(tx, ty);
      addButton(`create-cell-${key}`, sx, sy, cell, cell, () => {
        createScreen.lastKey = null;
        createPlaceAt(tx, ty);
        createScreen.dragging = true;
      });
    }
  }

  // Palette strip along the bottom: every part LEVEL_PARTS knows about, laid
  // out in as many rows as the window needs. The chip for the active part is
  // outlined in cyan, and the sprite preview is the real in-game frame.
  const palette = createPalette();
  const layout = createPaletteLayout();
  const palY = gridY + gridH + CREATE_PALETTE_GAP;

  palette.forEach((entry, i) => {
    if (i >= layout.capacity) return; // window too narrow for every chip
    const col = i % layout.perRow;
    const row = Math.floor(i / layout.perRow);
    const x = CREATE_PALETTE_PAD + col * (layout.chipW + layout.gap);
    const y = palY + CREATE_PALETTE_PAD + row * (layout.chipH + layout.gap);
    const active = createEntryId(entry) === createEntryId(createScreen);

    const rect = addButton(`create-part-${createEntryId(entry)}`, x, y, layout.chipW, layout.chipH, () => {
      createScreen.tool = entry.type;
      createScreen.kind = entry.kind || null;
      createScreen.eraseMode = false;
    });

    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = active ? 'rgba(0, 255, 204, 0.25)' : 'rgba(255, 255, 255, 0.07)';
    ctx.fill();
    ctx.lineWidth = active ? 3 : 1;
    ctx.strokeStyle = active ? '#00ffcc' : 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();
    ctx.restore();

    const sprite = createPreviewSprite(entry);
    const sheet = sprite ? gameplaySheet(sprite.sheet) : null;
    if (entry.type === 'finish') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(rect.x + 22, rect.y + 6, rect.w - 44, rect.h - 12);
    } else if (sheet && sheet.has(sprite.frame)) {
      // Anchored parts (spikes) sit on the chip's floor; the rest are centred.
      const anchored = String(sprite.anchor || '').startsWith('bottom');
      sheet.draw(ctx, sprite.frame, rect.x + rect.w / 2,
        anchored ? rect.y + rect.h - 11 : rect.y + rect.h / 2,
        { width: rect.w - 12, height: rect.h - 12, anchor: sprite.anchor });
    } else {
      ctx.fillStyle = entry.type === 'spike' ? '#ff5a5a'
        : entry.type === 'orb' ? (ORB_KINDS[entry.kind] || ORB_KINDS.yellow).color
        : entry.type === 'pad' ? (PAD_KINDS[entry.kind] || PAD_KINDS.yellow).color
        : entry.type === 'portal' ? '#b388ff' : '#2b2b52';
      ctx.fillRect(rect.x + 18, rect.y + 8, rect.w - 36, rect.h - 16);
    }

    const label = layout.chipW < 52 ? entry.label.slice(0, 8) : entry.label;
    big.draw(ctx, label, rect.x + rect.w / 2, rect.y + rect.h - 3, {
      scale: big.scaleForCap(9), align: 'center', anchor: 'bottom', alpha: 0.85,
    });
  });

  if (layout.capacity < layout.count) {
    big.draw(ctx, `Widen the window to reach ${layout.count - layout.capacity} more parts`,
      app.viewWidth / 2, palY + layout.height - 2, {
        scale: big.scaleForCap(12), align: 'center', anchor: 'bottom', alpha: 0.6,
      });
  }
}



// -------------------- Gameplay rendering --------------------
// Level art comes from Levels.js' LEVEL_PARTS catalog, resolved through
// BlockDefinitions.js: every object carries a `part`, and objectSprite() (in
// Levels.js) answers with the real frame, the atlas it lives in and its logical
// size. Nothing down here names a sprite or picks an atlas by hand — it blits
// whatever the part resolved to, and drops to a vector shape when a part has no
// art (pads, finish line) or the atlases never loaded.

// The atlas a part lives in, by the key BlockDefinitions records on every
// frame: 'blocks' is GJ_GameSheet, 'objects' is GJ_GameSheet02.
function gameplaySheet(key) {
  const sheets = app.resources.sheets;
  if (!sheets) return null;
  if (key === 'objects') return sheets.objects || sheets.blocks2 || null;
  if (key === 'blocks') return sheets.blocks || sheets.objects || sheets.blocks2 || null;
  return sheets[key] || null;
}

// The sheet + frame one object should be drawn with, or null for parts that are
// drawn procedurally.
function objectArt(obj) {
  const sprite = objectSprite(obj);
  if (!sprite) return null;
  const sheet = gameplaySheet(sprite.sheet);
  if (!sheet || !sheet.has(sprite.frame)) return null;
  return { sheet, sprite };
}

function drawSheetTiled(sheet, frameName, x, top, w, h) {
  if (!sheet || !sheet.has(frameName)) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  const cols = Math.max(1, Math.round(w / TILE));
  const rows = Math.max(1, Math.round(h / TILE));
  const tw = w / cols;
  const th = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sheet.draw(ctx, frameName, x + tw * (c + 0.5), top + th * (r + 0.5), { width: tw, height: th });
    }
  }
  ctx.restore();
  return true;
}

// One-shot sprites (orbs, opt-in pad art, non-tiling blocks) fill their box,
// aspect preserved, anchored where the part says.
function drawSheetFrame(art, box, x) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const anchor = art.sprite.anchor || 'center';
  // A part anchored at its base sits ON the box's bottom edge; anything else is
  // centred in the box.
  const y = String(anchor).startsWith('bottom') ? box.bottom : (box.top + box.bottom) / 2;
  art.sheet.draw(ctx, art.sprite.frame, x + w / 2, y, { width: w, height: h, anchor });
  return true;
}

function drawBlockFallback(box, x) {
  ctx.fillStyle = '#2b2b52';
  ctx.fillRect(x, box.top, box.right - box.left, box.bottom - box.top);

  ctx.strokeStyle = playerData.colors.glow;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, box.top + 1, box.right - box.left - 2, box.bottom - box.top - 2);
}

// Blocks and platforms tile: the part's frame (`fit: 'tile'`) is repeated on the
// 30px grid, so a 3x2 block is six squares rather than one stretched sprite.
function drawBlock(game, obj, box, x) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const art = objectArt(obj);
  if (!art) { drawBlockFallback(box, x); return; }

  if (art.sprite.fit === PART_FIT.TILE &&
      drawSheetTiled(art.sheet, art.sprite.frame, x, box.top, w, h)) return;
  drawSheetFrame(art, box, x);
}

function drawSpikeFallback(box, x, flip) {
  const width = box.right - box.left;
  ctx.fillStyle = '#e8e8ff';
  ctx.beginPath();
  if (flip) {
    // Hanging spike (upside-down sections): apex points DOWN.
    ctx.moveTo(x, box.top);
    ctx.lineTo(x + width / 2, box.bottom);
    ctx.lineTo(x + width, box.top);
  } else {
    ctx.moveTo(x, box.bottom);
    ctx.lineTo(x + width / 2, box.top);
    ctx.lineTo(x + width, box.bottom);
  }
  ctx.closePath();
  ctx.fill();
}

// Spikes are anchored at their base (see LEVEL_PARTS) so the short variants
// stand ON the surface instead of floating mid-box, and a hanging spike is the
// same sprite mirrored about the box's top edge — GD flips the sprite rather
// than shipping a second frame.
function drawSpike(game, obj, box, x) {
  const art = objectArt(obj);
  if (!art) { drawSpikeFallback(box, x, obj.flip); return; }

  const w = box.right - box.left;
  const h = box.bottom - box.top;

  ctx.save();
  if (obj.flip) {
    ctx.translate(x + w / 2, box.top);
    ctx.scale(1, -1);
    art.sheet.draw(ctx, art.sprite.frame, 0, 0,
      { width: w, height: h, anchor: 'bottomCenter' });
  } else {
    art.sheet.draw(ctx, art.sprite.frame, x + w / 2, box.bottom,
      { width: w, height: h, anchor: 'bottomCenter' });
  }
  ctx.restore();
}

// Pads default to the vector renderer — LEVEL_PARTS marks them `art: false`,
// because the atlas' boost_* frames are authored at GD's own scale and colour
// order and don't fit this project's 2x0.5-tile pad box. A level file can opt
// into real art by naming a frame on the object.
function drawPad(game, obj, box, x) {
  const art = objectArt(obj);
  if (art) { drawSheetFrame(art, box, x); return; }

  const padKind = obj.kind || 'yellow';
  const width = box.right - box.left;
  const height = box.bottom - box.top;

  ctx.fillStyle = (PAD_KINDS[padKind] || PAD_KINDS.yellow).color;
  ctx.fillRect(x, box.bottom - height, width, height);

  ctx.strokeStyle = '#111122';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const y = box.bottom - height + 4 + i * (height / 2);
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + width / 2, y);
    ctx.lineTo(x + width - 4, y + 4);
    ctx.stroke();
  }
}

function drawOrb(game, obj, box, x) {
  const cx = x + (box.right - box.left) / 2;
  const cy = (box.top + box.bottom) / 2;
  const radius = (box.bottom - box.top) / 2;
  const lit = game.orbReady === obj; // only the orb in range lights up
  const kind = ORB_KINDS[obj.kind] || ORB_KINDS.yellow;
  const art = objectArt(obj);

  // The catalog maps every orb colour to its matching ring frame, so the art
  // already carries the colour of ORB_KINDS[obj.kind].
  if (art) {
    ctx.save();
    ctx.globalAlpha = lit ? 1 : 0.55;
    art.sheet.draw(ctx, art.sprite.frame, cx, cy,
      { width: box.right - box.left, height: box.bottom - box.top });
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = kind.color;
  ctx.globalAlpha = lit ? 0.9 : 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.lineWidth = 2;
  ctx.strokeStyle = kind.color;
  ctx.stroke();
}

// Gamemodes that ride along block undersides instead of dying on them.
const CEILING_SLIDE = new Set([EntityTypes.SHIP, EntityTypes.UFO, EntityTypes.WAVE]);

const PORTAL_COLORS = {
  [EntityTypes.SHIP]: '#ff8ee6',   // pink
  [EntityTypes.BALL]: '#ff7a4d',   // red-orange
  [EntityTypes.WAVE]: '#4dd7ff',   // cyan
  [EntityTypes.UFO]: '#ffc44d',    // orange
  [EntityTypes.ROBOT]: '#e8e8e8',  // white
  [EntityTypes.SPIDER]: '#b96bff', // purple
  [EntityTypes.CUBE]: '#7bff8a',   // green
  GravityUp: '#ffe66d',            // yellow
  GravityDown: '#5ce1ff',          // blue
};

function drawPortal(game, obj, box, x) {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const cx = x + width / 2;
  const cy = box.top + height / 2;
  const art = objectArt(obj);

  if (art) {
    // GD portals are two layers: a wide glow BACK piece + the FRONT gate.
    // Both are height-fitted (aspect-true) and never tiled or stretched.
    const back = portalBackFrame(art.sprite);
    if (back && art.sheet.has(back)) {
      art.sheet.draw(ctx, back, cx, cy, { height: height * 1.12, alpha: 0.9 });
    }
    art.sheet.draw(ctx, art.sprite.frame, cx, cy, { height });
    return;
  }

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = PORTAL_COLORS[obj.mode] || '#ffffff';
  ctx.fillRect(x, box.top, width, box.bottom - box.top);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, box.top, width, box.bottom - box.top);
}

function drawFinish(box, x) {
  const width = box.right - box.left;
  const rows = 10;
  const rowH = (box.bottom - box.top) / rows;

  for (let row = 0; row < rows; row++) {
    ctx.fillStyle = row % 2 === 0 ? '#ffffff' : '#111122';
    ctx.fillRect(x, box.top + row * rowH, width / 2, rowH);
    ctx.fillStyle = row % 2 === 0 ? '#111122' : '#ffffff';
    ctx.fillRect(x + width / 2, box.top + row * rowH, width / 2, rowH);
  }
}

function drawGameObjects(game) {
  for (const obj of activeObjects(game)) {
    const box = objectBox(obj, game.world);
    const x = box.left - game.cameraX;

    switch (obj.type) {
      case BlockType.SPIKE:  drawSpike(game, obj, box, x); break;
      case BlockType.PAD:    drawPad(game, obj, box, x); break;
      case BlockType.ORB:    drawOrb(game, obj, box, x); break;
      case BlockType.PORTAL: drawPortal(game, obj, box, x); break;
      case BlockType.FINISH: drawFinish(box, x); break;
      default:               drawBlock(game, obj, box, x);
    }
  }
}

function drawGameBackground(game) {
  const { images } = app.resources;
  const w = app.viewWidth;
  const h = app.viewHeight;
  const groundY = game.world.groundY;

  // Background only covers the play area (above ground), not the ground strip.
  // This matches Geometry Dash where the bg doesn't dip into the ground area.
  const bgH = groundY;
  const bg = images.background;
  if (bg) {
    // Scale the tile up in BOTH dimensions (keeps aspect ratio) so the image
    // reads as closer / larger rather than squished. The oversized tile is
    // centered vertically within the bg area; excess above is clipped
    // (off-canvas) and excess below is overwritten by the ground strip.
    const k = bgH / bg.height;
    const tileW = bg.width * k * AppConfig.backgroundScale;
    const tileH = bgH * AppConfig.backgroundScale;
    const tileY = -(tileH - bgH) / 2 + AppConfig.backgroundOffsetY;
    const offset = -((game.cameraX * AppConfig.backgroundParallax) % tileW);
    for (let x = offset - tileW; x < w; x += tileW) {
      ctx.drawImage(bg, x, tileY, tileW, tileH);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, bgH);
    gradient.addColorStop(0, '#0b1026');
    gradient.addColorStop(1, '#241a4d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, bgH);
  }

  // Ground slab
  const ground = images.ground;

  if (ground) {
    const tile = AppConfig.groundTile;
    const offset = -(game.cameraX % tile);
    for (let x = offset - tile; x < w; x += tile) {
      ctx.drawImage(ground, x, groundY, tile, tile);
    }
    // Tiles run past the canvas bottom, which clips them for free
  } else {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, groundY, w, h - groundY);
  }

  // Glowing ground line
  ctx.fillStyle = playerData.colors.primary;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(0, groundY - 2, w, 4);
  ctx.globalAlpha = 1;
}

function drawGamePlayer(game) {
  const player = game.player;
  const size = player.width * AppConfig.iconScale;
  const hasArt = game.iconCanvas.width > 0 && game.iconCanvas.height > 0;

  ctx.save();
  ctx.translate(player.x - game.cameraX, player.y);
  ctx.rotate(player.renderRotation);

  if (hasArt) {
    ctx.drawImage(game.iconCanvas, -size / 2, -size / 2, size, size);
  } else {
    // Fallback square, so the player stays visible if icon art failed to load
    ctx.fillStyle = playerData.colors.primary;
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
  }
  ctx.restore();
}

function drawGameParticles(game) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - game.cameraX - 3, p.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
}

function drawGameHud(game) {
  const big = app.resources.fonts.big;
  const w = app.viewWidth;

  // Pause button, top-right. Skipped while paused so it can't be clicked
  // through the overlay.
  if (app.screen === 'playing') {
    spriteButton('pause', uiAssets.frames.pause, w - 54, 54, 56, () => {
      enterPause();
    });
  }

  // Progress bar, centred
  const frame = app.resources.images.progressBar;
  const barW = Math.min(w * 0.44, 580);
  const barH = frame ? barW * (frame.height / frame.width) : 26;
  const barX = (w - barW) / 2;
  const barY = 32;

  if (frame) {
    ctx.drawImage(frame, barX, barY, barW, barH);
  } else {
    ctx.save();
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // The fill is inset so the bar frame's own border stays visible
  const inset = barH * 0.28;
  const innerW = barW - inset * 2;
  const innerH = barH - inset * 2;

  if (innerW > 0 && innerH > 0 && game.percent > 0.5) {
    ctx.save();
    roundRect(ctx, barX + inset, barY + inset, innerW, innerH, innerH / 2);
    ctx.clip();
    ctx.fillStyle = playerData.colors.primary;
    ctx.fillRect(barX + inset, barY + inset, innerW * (game.percent / 100), innerH);
    ctx.restore();
  }

  big.draw(ctx, `${Math.floor(game.percent)}%`, w / 2, barY + barH + 2, {
    scale: big.scaleForCap(20), align: 'center', anchor: 'top',
  });

  // Level name and attempt count, top-left
  big.draw(ctx, game.level.name.toUpperCase(), 24, 30, {
    scale: big.scaleForCap(20), anchor: 'top', alpha: 0.9,
  });
  big.draw(ctx, `ATTEMPT ${levelProgress(game.level.id).attempts}`, 24, 58, {
    scale: big.scaleForCap(15), anchor: 'top', alpha: 0.55,
  });

  // Level Complete banner (text fallback if the art frame is missing)
  if (game.finished && game.bannerTimer > 0) {
    const gameSheet = app.resources.sheets.game;
    if (gameSheet && gameSheet.has(uiAssets.frames.complete)) {
      gameSheet.draw(ctx, uiAssets.frames.complete, w / 2, app.viewHeight * 0.34, {
        width: Math.min(w * 0.5, 520),
        alpha: clamp(game.bannerTimer / 0.5, 0, 1),
      });
    } else {
      big.draw(ctx, 'LEVEL COMPLETE', w / 2, app.viewHeight * 0.34, {
        scale: big.scaleForCap(54), align: 'center', anchor: 'middle',
        alpha: clamp(game.bannerTimer / 0.5, 0, 1),
      });
    }
  }
}

function renderGame() {
  const game = app.game;
  if (!game) return;

  drawGameBackground(game);
  drawTint('bgTint');
  drawTint('groundTint');
  drawGameObjects(game);
  if (game.alive) drawGamePlayer(game);
  drawGameParticles(game);
  drawGameHud(game);
}

// -------------------- Pause overlay --------------------
function renderPause() {
  const game = app.game;

  // Draw the frozen frame underneath, then dim it
  if (game) renderGame();
  else drawMenuBackdrop();

  ctx.fillStyle = 'rgba(4, 5, 14, 0.72)';
  ctx.fillRect(0, 0, app.viewWidth, app.viewHeight);

  const cx = app.viewWidth / 2;
  const cy = app.viewHeight / 2;
  const big = app.resources.fonts.big;

  // The sheets have no pause-panel art, so the panel is drawn here and the
  // three buttons reuse GD's own play / replay / menu artwork.
  const panelW = Math.min(app.viewWidth - 120, 520);
  const panelH = 340;
  const panelTop = cy - panelH / 2;

  ctx.save();
  roundRect(ctx, cx - panelW / 2, panelTop, panelW, panelH, 24);
  ctx.fillStyle = 'rgba(18, 20, 44, 0.96)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = playerData.colors.primary;
  ctx.stroke();
  ctx.restore();

  big.draw(ctx, 'PAUSED', cx, panelTop + 28, {
    scale: big.scaleForCap(44), align: 'center', anchor: 'top',
  });

  big.draw(ctx, (game ? game.level.name : '').toUpperCase(), cx, panelTop + 86, {
    scale: big.scaleForCap(17), align: 'center', anchor: 'top', alpha: 0.6,
  });

  const row = panelTop + 192;
  const spacing = 142;

  spriteButton('resume', uiAssets.frames.play, cx - spacing, row, 98, () => {
    resumeFromPause();
  });

  spriteButton('restart', uiAssets.frames.replay, cx, row, 98, () => {
    playSFX('play');
    restartFromPause();
  });

  spriteButton('quit', uiAssets.frames.menu, cx + spacing, row, 98, () => {
    playSFX('quit');
    quitFromRun();
  });

  const quitLabel = (game && game.level && game.level.draft) ? 'EDITOR' : 'MENU';
  const labels = [
    { text: 'RESUME', x: cx - spacing },
    { text: 'RESTART', x: cx },
    { text: quitLabel, x: cx + spacing },
  ];

  for (const label of labels) {
    big.draw(ctx, label.text, label.x, row + 72, {
      scale: big.scaleForCap(17), align: 'center', anchor: 'top', alpha: 0.8,
    });
  }
}

// Canvas 2D context, aliased at file scope because every draw helper needs it.
// boot() assigns it before any screen renders.
let ctx = null;

// -------------------- Input --------------------
// Pointer coordinates are converted into the same logical space the screens lay
// themselves out in, so hit-testing is resolution independent.
function toLogical(clientX, clientY) {
  const rect = app.canvas.getBoundingClientRect();
  const s = rect.height / app.viewHeight;
  return { x: (clientX - rect.left) / s, y: (clientY - rect.top) / s };
}

function buttonAt(x, y) {
  // Walk backwards so the most recently drawn (topmost) button wins
  for (let i = app.buttons.length - 1; i >= 0; i--) {
    const b = app.buttons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function onPointerMove(event) {
  const p = toLogical(event.clientX, event.clientY);
  app.pointer.x = p.x;
  app.pointer.y = p.y;

  // Held drags keep painting (or erasing) across the create grid — the cell
  // button only fires on the initial press, so painting continues from here.
  if (app.screen === 'create' && createScreen.dragging) {
    const { tx, ty } = createTileAt(p.x, p.y);
    createPlaceAt(tx, ty);
  }
}

function onPointerDown(event) {
  unlockAudio();

  const p = toLogical(event.clientX, event.clientY);
  app.pointer.x = p.x;
  app.pointer.y = p.y;

  // A UI button always takes priority over tap-to-jump
  const button = buttonAt(p.x, p.y);
  if (button) {
    button.action();
    return;
  }

  if (app.screen === 'playing') pressGameInput();
}

function onPointerUp() {
  createScreen.dragging = false;
  if (app.screen === 'playing') releaseGameInput();
}

function isActionKey(event) {
  return event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW';
}

function onKeyDown(event) {
  if (event.repeat) return;

  if (event.code === 'Escape') {
    if (app.screen === 'playing') enterPause();
    else if (app.screen === 'paused') quitToMenu(); // Esc in pause = leave to home
    else if (app.screen === 'create') {
      createSaveDraft();               // Esc flushes the autosave, same as BACK
      setScreen('menu');
    }
    return;
  }

  // R restarts the run, from gameplay or from the pause menu
  if (event.code === 'KeyR' && (app.screen === 'playing' || app.screen === 'paused')) {
    event.preventDefault();
    playSFX('play');
    restartFromPause();
    return;
  }

  // Space / Enter drive the obvious action on each screen, so the whole game is
  // playable with the keyboard alone.
  if (event.code === 'Space' || event.code === 'Enter') {
    unlockAudio();

    if (app.screen === 'menu') { event.preventDefault(); setScreen('levels'); return; }
    if (app.screen === 'levels') {
      event.preventDefault();
      const ids = getLevelIds();
      startLevel(ids[clamp(app.levelIndex, 0, ids.length - 1)]);
      return;
    }
    if (app.screen === 'paused') { event.preventDefault(); resumeFromPause(); return; }
  }

  if (!isActionKey(event)) return;
  event.preventDefault();

  if (app.screen === 'playing') {
    unlockAudio();
    pressGameInput();
  }
}

function onKeyUp(event) {
  if (!isActionKey(event)) return;
  event.preventDefault();
  if (app.screen === 'playing') releaseGameInput();
}

// -------------------- Gameplay input --------------------
function pressGameInput() {
  const game = app.game;
  if (!game || !game.alive || game.finished) return;

  // Touching an orb means the next tap boosts instead of jumping. The orb's
  // own AABB was already proven this frame, so no extra range check is needed.
  if (game.orbReady) {
    const orb = game.orbReady;
    // 2.1 orb kinds (Transporters wiki): yellow/pink/red launch, blue flips
    // gravity with a small kick, green flips gravity with a full jump.
    const kind = ORB_KINDS[orb.kind] || ORB_KINDS.yellow;
    if (kind.flip) game.player.gravityDir *= -1;
    game.player.velocityY = -kind.boost * game.player.gravityDir;
    game.orbReady = null;
    spawnBurst(game, orb.x + orb.w / 2, game.player.y, kind.color, 12);
    return;
  }

  // For the Spider, pass the list of solid objects (blocks + platforms) so
  // the teleport can target them — the spider can cling to level geometry,
  // not just the world floor/ceiling.
  game.player.handleInputDown(game.solidObjects || null);
}

function releaseGameInput() {
  const game = app.game;
  if (game) game.player.handleInputUp();
}

// -------------------- Resize --------------------
// Logical height is fixed so every screen lays out identically; the width
// follows the window's aspect ratio, so wider screens simply see more.
function resize() {
  const ratio = window.devicePixelRatio || 1;
  const cssW = app.canvas.clientWidth || window.innerWidth;
  const cssH = app.canvas.clientHeight || window.innerHeight;

  app.canvas.width = Math.round(cssW * ratio);
  app.canvas.height = Math.round(cssH * ratio);

  app.scale = app.canvas.height / app.viewHeight;
  app.viewWidth = app.canvas.width / app.scale;
}

// -------------------- Loading / error screens --------------------
const LoadPhase = {
  START: 'start',
  FONTS: 'fonts',
  SHEETS: 'sheets',
  IMAGES: 'images',
  ICONS: 'icons',
  LEVEL: 'level',
  DONE: 'done',
};

function renderLoading() {
  const w = app.viewWidth;
  const h = app.viewHeight;
  const cx = w / 2;

  // Geometry Dash-style loading: solid light blue background
  // The game_bg image is used as a subtle tiled overlay for texture
  const bg = app.resources.images.background;
  
  // Base solid light blue background
  ctx.fillStyle = '#4a9ae8';
  ctx.fillRect(0, 0, w, h);
  
  // If background image loaded, draw it as a faded tiled overlay
  if (bg && bg.width > 0 && bg.height > 0) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    // Tile the image across the screen
    const tileSize = 200;
    const scale = tileSize / bg.width;
    const tileH = bg.height * scale;
    for (let x = -tileSize; x < w + tileSize; x += tileSize) {
      for (let y = -tileH; y < h + tileSize; y += tileSize) {
        ctx.drawImage(bg, x, y + (Math.sin(app.clock * 0.2 + x * 0.01) * 10), tileSize, tileH);
      }
    }
    ctx.restore();
  }

  // RobTop icon at ~18% from the top of the screen
  const robtopY = h * 0.18;
  const robtopSize = Math.min(120, w * 0.15);
  const robtop = app.resources.images.loading;
  if (robtop) {
    ctx.save();
    // Slight bob animation
    const bob = Math.sin(app.clock * 2) * 4;
    ctx.translate(cx, robtopY + bob);
    ctx.drawImage(robtop, -robtopSize / 2, -robtopSize / 2, robtopSize, robtopSize);
    ctx.restore();
  }

  // Geometry Dash logo in the middle of the screen (~40% from top)
  const logoY = h * 0.40;
  const logoWidth = Math.min(w * 0.7, 500);

  // Try to use the GJ logo from the launch sheet
  const launchSheet = app.resources.sheets.launch;
  if (launchSheet && launchSheet.has(uiAssets.frames.logo)) {
    ctx.save();
    launchSheet.draw(ctx, uiAssets.frames.logo, cx, logoY, { width: logoWidth, align: 'center', anchor: 'center' });
    ctx.restore();
  } else {
    // Fallback: draw "GEOMETRY DASH" text
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.min(56, w * 0.07)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillText('GEOMETRY DASH', cx, logoY);
    ctx.restore();
  }

  // Progress bar — 10% lower than the logo
  const barY = h * 0.58;
  const barW = Math.min(w * 0.55, 440);
  const barH = 16;
  const barX = cx - barW / 2;

  // Bar background (dark frame)
  ctx.save();
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Bar fill (GD blue gradient)
  const progress = getLoadProgress();
  const fillW = (barW - 6) * progress;
  if (fillW > 0) {
    ctx.save();
    roundRect(ctx, barX + 3, barY + 3, fillW, barH - 6, (barH - 6) / 2);
    const fillGrad = ctx.createLinearGradient(barX + 3, 0, barX + 3 + fillW, 0);
    fillGrad.addColorStop(0, '#287dff');
    fillGrad.addColorStop(0.5, '#5aaaff');
    fillGrad.addColorStop(1, '#8ac4ff');
    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.restore();
  }

  // Loading message — pick a random one from the pool
  const messages = [
    'Loading the loading screen',
    'Go online to play other players\' levels!',
    'So many secrets...',
    'Connecting Triangles...',
    'I have been expecting you.',
  ];

  // Pick a random message but keep it stable during the loading screen
  if (!app.loadMessage || Math.random() < 0.02) {
    app.loadMessage = messages[Math.floor(Math.random() * messages.length)];
  }

  const messageY = barY + barH + 35;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `${Math.min(16, w * 0.022)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(app.loadMessage, cx, messageY);
  ctx.restore();
}

function getLoadProgress() {
  const phase = app.loadPhase || LoadPhase.START;
  const phaseOrder = [LoadPhase.START, LoadPhase.FONTS, LoadPhase.SHEETS, LoadPhase.IMAGES, LoadPhase.ICONS, LoadPhase.LEVEL, LoadPhase.DONE];
  const idx = phaseOrder.indexOf(phase);
  if (idx < 0) return 0;
  if (idx >= phaseOrder.length - 1) return 1;
  const baseProgress = (idx + 0.5) / phaseOrder.length;
  return Math.min(0.95, Math.max(0.05, baseProgress));
}

const MIN_LOADING_TIME = 400;

/**
 * Wait until the minimum loading time has elapsed, then proceed. This gives
 * the player time to see the loading screen complete and avoids jarring flashes.
 */
function finishLoading() {
  return new Promise((resolve) => {
    const elapsed = performance.now() - (app.loadStartTime || performance.now());
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
    setTimeout(resolve, remaining);
  });
}

function renderError() {
  const w = app.viewWidth;
  const h = app.viewHeight;

  ctx.fillStyle = '#0b1026';
  ctx.fillRect(0, 0, w, h);

  const big = app.resources.fonts.big;
  if (!big) return; // the DOM #boot-error banner covers this case

  big.draw(ctx, 'LOAD FAILED', w / 2, h / 2 - 70, {
    scale: big.scaleForCap(44), align: 'center', anchor: 'center', color: '#ff6b6b',
  });
  big.draw(ctx, app.error || 'Unknown error', w / 2, h / 2, {
    scale: big.scaleForCap(18), align: 'center', anchor: 'center', alpha: 0.85,
  });
  big.draw(ctx, 'Serve this folder over HTTP — opening the file directly will not work.',
    w / 2, h / 2 + 44, {
      scale: big.scaleForCap(16), align: 'center', anchor: 'center', alpha: 0.6,
    });
}

// -------------------- Render dispatch --------------------
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, app.canvas.width, app.canvas.height);
  ctx.scale(app.scale, app.scale);

  app.buttons = []; // whichever screen draws re-registers its buttons

  switch (app.screen) {
    case 'menu':    renderMenu(); break;
    case 'icons':   renderIcons(); break;
    case 'levels':  renderLevels(); break;
    case 'create':  renderCreate(); break;
    case 'playing': renderGame(); break;
    case 'paused':  renderPause(); break;
    case 'error':   renderError(); break;
    default:        renderLoading(); break;
  }
}

// -------------------- Main loop --------------------
let lastFrameTime = 0;

function frame(now) {
  if (!lastFrameTime) lastFrameTime = now;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // cap a backgrounded tab
  lastFrameTime = now;

  app.clock += dt;

  // Gameplay only advances on the playing screen, so the pause menu freezes the
  // run exactly where it was.
  if (app.screen === 'playing') updateGame(dt);
  else if (app.screen === 'create') updateCreate(dt);

  render();
  requestAnimationFrame(frame);
}

// -------------------- Boot --------------------
function showBootError(message) {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  app.canvas = document.getElementById('stage-canvas');
  if (!app.canvas) return;

  ctx = app.canvas.getContext('2d');

  window.addEventListener('resize', resize);
  resize();

  app.canvas.addEventListener('pointermove', onPointerMove);
  app.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  initColourPanel();
  initAudio();

  // Record when loading started so we can enforce a minimum display time
  app.loadStartTime = performance.now();
  app.loadPhase = LoadPhase.START;

  // Paint the loading screen immediately, then fetch everything
  requestAnimationFrame(frame);

  try {
    await loadResources();
  } catch (err) {
    console.error('Failed to load resources:', err);
    app.error = (err && err.message) ? err.message : String(err);
    app.screen = 'error';
    showBootError(app.error);
    return;
  }

  // Deep link: index.html?level=main-3 goes straight into that level
  const requested = new URLSearchParams(window.location.search).get('level');
  const ids = getLevelIds();

  if (requested && ids.includes(requested)) {
    app.levelIndex = ids.indexOf(requested);
    app.loadPhase = LoadPhase.LEVEL;
    startLevel(requested);
    return;
  }

  // Pre-render the icon art so the menu preview is ready on the first paint
  const modes = availableIconModes();
  if (modes.length > 0) {
    app.loadPhase = LoadPhase.ICONS;
    await buildIconScreen(modes.includes(EntityTypes.CUBE) ? EntityTypes.CUBE : modes[0]);
  }

  // All done — hold on the loading screen for a moment so the player sees the
  // progress bar complete and doesn't get a jarring flash to the menu.
  app.loadPhase = LoadPhase.DONE;
  await finishLoading();

  setScreen('menu');
}

document.addEventListener('DOMContentLoaded', boot);
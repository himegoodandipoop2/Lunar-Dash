// IconHandler.js
// Depends on EntityTypes from Data.js — load Data.js first
//
// Icons are Cocos2d-style sprite sheets: one PNG (all layers packed together)
// + a .plist saying where each layer's rectangle lives in that PNG.
// File naming convention: Images/Icons/<Mode>/Icon<number>-uhd.png / .plist
//
// We don't need to know the internal frame name prefix used inside the plist -
// we detect which frame is which layer by suffix pattern instead:
//   *_2_###.png     -> secondary shape
//   *_glow_###.png  -> glow outline
//   *_extra_###.png -> optional detail layer, not recolored
//   anything else   -> base/primary shape

// -------------------- Manifest --------------------
// Just the available icon numbers per mode. Lowest number = starter icon.
// Modes with no shipped art yet still list a number so the icons screen and
// gameplay can show the vector fallback instead of hiding the mode.
const iconManifest = {
  [EntityTypes.CUBE]:   [1,2],   // add 2, 3, etc. here as you make more
  [EntityTypes.SHIP]:   [1],
  [EntityTypes.BALL]:   [1],
  [EntityTypes.UFO]:    [1],
  [EntityTypes.WAVE]:   [1],
  [EntityTypes.ROBOT]:  [1],
  [EntityTypes.SPIDER]: [1],
};

function getAvailableIcons(mode) {
  return iconManifest[mode] || [];
}

function getStarterIcon(mode) {
  const list = getAvailableIcons(mode);
  return list.length > 0 ? Math.min(...list) : null;
}

function getIconPaths(mode, number) {
  // Layout on disk is Images/Icons/<Mode>/<Mode><number>/Icon<number>-uhd.<ext>
  // e.g. Images/Icons/Cube/Cube1/Icon1-uhd.png — one folder per icon.
  const folder = `${mode}/${mode}${number}`; // matches EntityTypes values: 'Cube/Cube1', etc.
  return {
    sheet: `Images/Icons/${folder}/Icon${number}-uhd.png`,
    plist: `Images/Icons/${folder}/Icon${number}-uhd.plist`,
  };
}

// -------------------- Plist parsing --------------------
// parsePlist / parseDict / parseValue / parseRect / parsePoint / loadImage all
// live in SheetHandler.js, which is loaded before this file. They are shared
// with the menu/UI atlas code so there is exactly one implementation.

// -------------------- Frame categorization --------------------
// Figures out which parsed frame is base/secondary/glow/extra by suffix,
// without needing to know the internal name prefix ahead of time.
function categorizeFrames(frames) {
  const result = { base: null, secondary: null, glow: null, extra: null };

  for (const [key, frame] of Object.entries(frames)) {
    if (/_2_\d+\.png$/i.test(key)) {
      result.secondary = frame;
    } else if (/_glow_\d+\.png$/i.test(key)) {
      result.glow = frame;
    } else if (/_extra_\d+\.png$/i.test(key)) {
      result.extra = frame;
    } else {
      result.base = frame; // anything left over is treated as the base layer
    }
  }

  return result;
}

// -------------------- Sheet loading --------------------
// Uses the shared atlas loader (which already caches by plist path) and
// re-shapes its frames into the icon layer model this file renders from.
async function loadSheet(sheetPath, plistPath) {
  const sheet = await getSheet(sheetPath, plistPath);

  const frames = {};
  for (const [name, f] of Object.entries(sheet.frames)) {
    frames[name] = {
      textureRect: f.rect,
      rotated: !!f.rotated,
      spriteOffset: { x: f.offX, y: f.offY },
      spriteSize: { x: f.sizeW, y: f.sizeH },
      spriteSourceSize: { x: f.srcW, y: f.srcH },
    };
  }

  return { image: sheet.image, layers: categorizeFrames(frames) };
}

// -------------------- Rendering --------------------
function extractLayer(sheetImage, frame, color, skipTint) {
  const { textureRect: r, spriteSize: size, rotated } = frame;

  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = size.x;
  layerCanvas.height = size.y;
  const ctx = layerCanvas.getContext('2d');

  if (rotated) {
    // Stored sideways (footprint h x w): un-rotate back to upright.
    ctx.save();
    ctx.translate(size.x / 2, size.y / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(sheetImage, r.x, r.y, r.h, r.w, -size.y / 2, -size.x / 2, size.y, size.x);
    ctx.restore();
  } else {
    ctx.drawImage(sheetImage, r.x, r.y, r.w, r.h, 0, 0, size.x, size.y);
  }

  if (!skipTint) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size.x, size.y);
  }

  return layerCanvas;
}

function drawLayer(destCtx, layerCanvas, frame, originW, originH) {
  const { spriteOffset: off, spriteSize: size, spriteSourceSize: srcSize } = frame;

  const dx = (originW - srcSize.x) / 2 + (srcSize.x - size.x) / 2 + off.x;
  const dy = (originH - srcSize.y) / 2 + (srcSize.y - size.y) / 2 - off.y;

  destCtx.drawImage(layerCanvas, dx, dy);
}

async function renderIcon(canvas, mode, number, colors) {
  const { sheet, plist } = getIconPaths(mode, number);
  let image;
  let layers;
  try {
    ({ image, layers } = await loadSheet(sheet, plist));
  } catch (err) {
    // A mode with no art yet (or a failed download) falls back to a simple
    // vector cube so the player is never invisible.
    drawFallbackIcon(canvas, mode, number, colors);
    return;
  }
  const { base, secondary, glow, extra } = layers;

  const candidates = [base, secondary, glow, extra].filter(Boolean);
  if (candidates.length === 0) {
    drawFallbackIcon(canvas, mode, number, colors);
    return;
  }
  const originW = Math.max(...candidates.map((f) => f.spriteSourceSize.x));
  const originH = Math.max(...candidates.map((f) => f.spriteSourceSize.y));

  canvas.width = originW;
  canvas.height = originH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, originW, originH);

  // Draw order: glow behind, then secondary, then base on top, extra last
  if (glow) drawLayer(ctx, extractLayer(image, glow, colors.glow), glow, originW, originH);
  if (secondary) drawLayer(ctx, extractLayer(image, secondary, colors.secondary), secondary, originW, originH);
  if (base) drawLayer(ctx, extractLayer(image, base, colors.primary), base, originW, originH);
  if (extra) drawLayer(ctx, extractLayer(image, extra, null, true), extra, originW, originH);
}

// -------------------- Fallback rendering --------------------
// Modes with no sprite art yet get a simple vector icon in the player's
// colours, so every mode is playable and visible even before its art lands.
function drawFallbackIcon(canvas, mode, number, colors) {
  const size = 120;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const primary = (colors && colors.primary) || '#00ffcc';
  const secondary = (colors && colors.secondary) || '#ff00aa';
  const glow = (colors && colors.glow) || '#ffffff';

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;

  if (mode === EntityTypes.SHIP) {
    // Simple triangular ship hull with a cockpit dot.
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.moveTo(12, 84);
    ctx.lineTo(66, 84);
    ctx.lineTo(104, 60);
    ctx.lineTo(66, 36);
    ctx.lineTo(12, 36);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(56, 60, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === EntityTypes.BALL) {
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(60, 60, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(60, 60, 26, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mode === EntityTypes.WAVE) {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14, 88);
    ctx.lineTo(44, 88);
    ctx.lineTo(60, 32);
    ctx.lineTo(76, 88);
    ctx.lineTo(106, 88);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(60 + ((number || 1) % 3) * 4, 60, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Default: rounded cube with a secondary inset, like the real GD icons.
    ctx.fillStyle = primary;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(14, 14, 92, 92, 18);
    else ctx.rect(14, 14, 92, 92);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(32, 32, 56, 56, 10);
    else ctx.rect(32, 32, 56, 56);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.fillRect(52, 40, 16, 16);
  }
  ctx.restore();
}

// -------------------- Public handler --------------------
class IconHandler {
  constructor(canvasElement, playerColors) {
    this.canvas = canvasElement; // a <canvas> element
    this.colors = playerColors;  // { primary, secondary, glow }
    this.mode = null;
    this.number = null;
  }

  async setMode(mode) {
    const starter = getStarterIcon(mode);
    if (starter === null) {
      console.warn(`No icons available yet for mode: ${mode}`);
      return;
    }
    await this.setIconByNumber(mode, starter);
  }

  async setIconByNumber(mode, number) {
    this.mode = mode;
    this.number = number;
    await renderIcon(this.canvas, mode, number, this.colors);
  }

  async setColors(playerColors) {
    this.colors = playerColors;
    if (this.mode && this.number !== null) {
      await renderIcon(this.canvas, this.mode, this.number, this.colors);
    }
  }

  // Builds a clickable thumbnail canvas for every icon available in a mode
  async renderSelectList(listElement) {
    if (!this.mode) return;
    listElement.innerHTML = '';

    for (const number of getAvailableIcons(this.mode)) {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'icon-thumb';
      await renderIcon(thumbCanvas, this.mode, number, this.colors);
      thumbCanvas.addEventListener('click', () => this.setIconByNumber(this.mode, number));
      listElement.appendChild(thumbCanvas);
    }
  }
}
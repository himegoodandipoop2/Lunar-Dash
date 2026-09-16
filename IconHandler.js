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
const iconManifest = {
  [EntityTypes.CUBE]:   [1,2],   // add 2, 3, etc. here as you make more
  [EntityTypes.SHIP]:   [],
  [EntityTypes.BALL]:   [],
  [EntityTypes.UFO]:    [],
  [EntityTypes.WAVE]:   [],
  [EntityTypes.ROBOT]:  [],
  [EntityTypes.SPIDER]: [],
  [EntityTypes.SWING]:  [],
};

function getAvailableIcons(mode) {
  return iconManifest[mode] || [];
}

function getStarterIcon(mode) {
  const list = getAvailableIcons(mode);
  return list.length > 0 ? Math.min(...list) : null;
}

function getIconPaths(mode, number) {
  const folder = mode; // matches EntityTypes values: 'Cube', 'Ship', etc.
  return {
    sheet: `Images/Icons/${folder}/Icon${number}-uhd.png`,
    plist: `Images/Icons/${folder}/Icon${number}-uhd.plist`,
  };
}

// -------------------- Plist parsing --------------------
function parsePlist(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const rootDict = xml.querySelector('plist > dict');
  return parseDict(rootDict);
}

function parseDict(dictEl) {
  const result = {};
  const children = Array.from(dictEl.children);
  for (let i = 0; i < children.length; i += 2) {
    const key = children[i].textContent;
    result[key] = parseValue(children[i + 1]);
  }
  return result;
}

function parseValue(el) {
  switch (el.tagName) {
    case 'dict':    return parseDict(el);
    case 'array':   return Array.from(el.children).map(parseValue);
    case 'integer': return parseInt(el.textContent, 10);
    case 'real':    return parseFloat(el.textContent);
    case 'true':    return true;
    case 'false':   return false;
    default:        return el.textContent; // string
  }
}

function parseRect(str) {
  const nums = str.match(/-?\d+(\.\d+)?/g).map(Number);
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

function parsePoint(str) {
  const nums = str.match(/-?\d+(\.\d+)?/g).map(Number);
  return { x: nums[0], y: nums[1] };
}

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

// -------------------- Sheet loading (cached) --------------------
const sheetCache = new Map(); // key: plist path -> { image, layers }

async function loadSheet(sheetPath, plistPath) {
  if (sheetCache.has(plistPath)) return sheetCache.get(plistPath);

  const [image, plistText] = await Promise.all([
    loadImage(sheetPath),
    fetch(plistPath).then((res) => res.text()),
  ]);

  const parsed = parsePlist(plistText);
  const frames = {};
  for (const [name, data] of Object.entries(parsed.frames)) {
    frames[name] = {
      textureRect: parseRect(data.textureRect),
      spriteOffset: parsePoint(data.spriteOffset),
      spriteSize: parsePoint(data.spriteSize),
      spriteSourceSize: parsePoint(data.spriteSourceSize),
    };
  }

  const result = { image, layers: categorizeFrames(frames) };
  sheetCache.set(plistPath, result);
  return result;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// -------------------- Rendering --------------------
function extractLayer(sheetImage, frame, color, skipTint) {
  const { textureRect: r, spriteSize: size } = frame;

  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = size.x;
  layerCanvas.height = size.y;
  const ctx = layerCanvas.getContext('2d');

  ctx.drawImage(sheetImage, r.x, r.y, r.w, r.h, 0, 0, size.x, size.y);

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
  const { image, layers } = await loadSheet(sheet, plist);
  const { base, secondary, glow, extra } = layers;

  const candidates = [base, secondary, glow, extra].filter(Boolean);
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
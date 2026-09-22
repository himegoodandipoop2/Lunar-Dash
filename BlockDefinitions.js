/*
 * BlockDefinitions.js
 * ------------------------------------------------------------
 * Central registry for Geometry Dash-style level assets.
 *
 * Source atlases:
 *   Images/MenuImgs/GJ_GameSheet-uhd.png/.plist
 *   Images/MenuImgs/GJ_GameSheet02-uhd.png/.plist
 *
 * This file does NOT manually duplicate thousands of plist entries.
 * SheetHandler.js already parses every frame. We use that data to
 * automatically register every frame, then classify known families
 * (blocks, spikes, portals, etc.) for gameplay use.
 *
 * Load order:
 *   Data.js
 *   SheetHandler.js
 *   BlockDefinitions.js
 *   Levels.js
 *
 * UHD artwork is 4x the game's logical 30px tile scale.
 */

const BLOCK_ASSET_SCALE = 4;
const BLOCK_TILE_SIZE = 30;

const blockAssetSheets = {
  blocks: {
    key: 'blocks',
    png: 'Images/MenuImgs/GJ_GameSheet-uhd.png',
    plist: 'Images/MenuImgs/GJ_GameSheet-uhd.plist',
  },

  objects: {
    key: 'objects',
    png: 'Images/MenuImgs/GJ_GameSheet02-uhd.png',
    plist: 'Images/MenuImgs/GJ_GameSheet02-uhd.plist',
  },
};

// Gameplay meaning for known sprite families.
// Individual variants are discovered automatically from the plist.
const blockFamilyDefinitions = {
  // ----- Solid level geometry -----
  block:        { type: 'block',    collision: 'solid' },
  square:       { type: 'block',    collision: 'solid' },
  plank:        { type: 'block',    collision: 'solid' },
  colorPlank:   { type: 'block',    collision: 'solid' },
  brick:        { type: 'block',    collision: 'solid' },
  colorSquare:  { type: 'block',    collision: 'solid' },

  // ----- Hazards -----
  spike:        { type: 'spike',    collision: 'hazard' },
  colorSpike:   { type: 'spike',    collision: 'hazard' },
  fakeSpike:    { type: 'spike',    collision: 'none' },
  iceSpike:     { type: 'spike',    collision: 'hazard' },
  sawblade:     { type: 'saw',      collision: 'hazard' },
  blade:        { type: 'saw',      collision: 'hazard' },
  darkblade:    { type: 'saw',      collision: 'hazard' },
  lightBlade:   { type: 'saw',      collision: 'hazard' },
  blackCogwheel:{ type: 'saw',      collision: 'hazard' },
  bladeTrap01:  { type: 'saw',      collision: 'hazard' },
  bladeTrap02:  { type: 'saw',      collision: 'hazard' },
  bladeTrap03:  { type: 'saw',      collision: 'hazard' },
  spinBlade01:  { type: 'saw',      collision: 'hazard' },
  spinBlade02:  { type: 'saw',      collision: 'hazard' },

  // ----- Non-solid / decorative level pieces -----
  blockDesign01:       { type: 'decoration', collision: 'none' },
  blockDesign02:       { type: 'decoration', collision: 'none' },
  blockDesign03:       { type: 'decoration', collision: 'none' },
  blockDesign04:       { type: 'decoration', collision: 'none' },
  blockDesign05:       { type: 'decoration', collision: 'none' },
  blockDesign06:       { type: 'decoration', collision: 'none' },
  blockDesign07:       { type: 'decoration', collision: 'none' },
  blockOutline:        { type: 'decoration', collision: 'none' },
  blockOutlineThick:   { type: 'decoration', collision: 'none' },
  blockOutlineThickb:  { type: 'decoration', collision: 'none' },
  blockOutlineOuter1:  { type: 'decoration', collision: 'none' },
  blockOutlineOuter2:  { type: 'decoration', collision: 'none' },
  blockOutlineOuter3:  { type: 'decoration', collision: 'none' },

  // ----- Other common object families -----
  dashRing:    { type: 'ring',      collision: 'trigger' },
  dropRing:    { type: 'ring',      collision: 'trigger' },
  ring:        { type: 'ring',      collision: 'trigger' },
  boost:       { type: 'boost',     collision: 'trigger' },
  portal:      { type: 'portal',    collision: 'trigger' },

  // Decorative/interactive effects
  fireball:     { type: 'decoration', collision: 'none' },
  lava:         { type: 'decoration', collision: 'none' },
  waterfallAnim:{ type: 'decoration', collision: 'none' },
  waterSplash:  { type: 'decoration', collision: 'none' },
  starAnim:     { type: 'decoration', collision: 'none' },
  lightsquare:  { type: 'decoration', collision: 'none' },
  lighttriangle:{ type: 'decoration', collision: 'none' },
  puzzle:       { type: 'decoration', collision: 'none' },
  triangle:     { type: 'decoration', collision: 'none' },
  persp:        { type: 'decoration', collision: 'none' },
  pit:          { type: 'decoration', collision: 'none' },
  invis:        { type: 'decoration', collision: 'none' },
};

// Families from GameSheet02 that are gameplay/player assets rather than blocks.
const secondaryFamilyDefinitions = {
  portal:    { type: 'portal',     collision: 'trigger' },
  boost:     { type: 'boost',      collision: 'trigger' },
  player:    { type: 'player',     collision: 'none' },
  ship:      { type: 'player',     collision: 'none' },
  robot:     { type: 'player',     collision: 'none' },
  spider:    { type: 'player',     collision: 'none' },
  bird:      { type: 'player',     collision: 'none' },
  dart:      { type: 'player',     collision: 'none' },
  fireBoost: { type: 'boost',      collision: 'trigger' },
  checkpoint:{ type: 'checkpoint', collision: 'trigger' },
};

// Anything not explicitly known remains available as an "unknown" asset.
// This is intentional: adding new art to a plist does not break the game.

function getAssetFamily(frameName) {
  const first = String(frameName).split('_')[0];
  return first;
}

function classifyAsset(frameName, sheetKey) {
  const family = getAssetFamily(frameName);

  const definitions =
    sheetKey === 'objects'
      ? secondaryFamilyDefinitions
      : blockFamilyDefinitions;

  const known = definitions[family];

  if (known) {
    return {
      family,
      type: known.type,
      collision: known.collision,
    };
  }

  return {
    family,
    type: 'unknown',
    collision: 'none',
  };
}

function frameVariant(frameName, family) {
  const stem = String(frameName)
    .replace(/\.(png|webp)$/i, '')
    .replace(new RegExp(`^${family}_?`), '');

  return stem;
}

const BlockDefinitions = {
  scale: BLOCK_ASSET_SCALE,
  tileSize: BLOCK_TILE_SIZE,

  sheets: blockAssetSheets,

  families: {
    ...blockFamilyDefinitions,
    ...secondaryFamilyDefinitions,
  },

  // Populated by loadBlockDefinitions().
  frames: {},
  byFamily: {},
  byType: {},

  // The live Sheet objects, keyed exactly like each definition's `sheet`
  // field ('blocks' = GJ_GameSheet, 'objects' = GJ_GameSheet02). They are the
  // same Sheet instances SheetHandler already cached, so resolving a frame
  // through here costs no extra download.
  sheetObjects: {},

  loaded: false,

  /**
   * Load both UHD atlases and automatically register every plist frame.
   * SheetHandler.js must already be loaded.
   */
  async load() {
    if (this.loaded) return this;

    if (typeof getSheet !== 'function') {
      throw new Error(
        'BlockDefinitions requires SheetHandler.js to be loaded first.'
      );
    }

    const [blocksSheet, objectsSheet] = await Promise.all([
      getSheet(
        blockAssetSheets.blocks.png,
        blockAssetSheets.blocks.plist
      ),

      getSheet(
        blockAssetSheets.objects.png,
        blockAssetSheets.objects.plist
      ),
    ]);

    this.registerSheet('blocks', blocksSheet);
    this.registerSheet('objects', objectsSheet);

    this.sheetObjects = { blocks: blocksSheet, objects: objectsSheet };

    this.loaded = true;
    return this;
  },

  registerSheet(sheetKey, sheet) {
    if (!sheet || !sheet.frames) return;

    for (const [frameName, frame] of Object.entries(sheet.frames)) {
      const classification = classifyAsset(frameName, sheetKey);
      const family = classification.family;

      const logicalWidth =
        (frame.srcW ??
          frame.sizeW ??
          frame.rect?.w ??
          0) / BLOCK_ASSET_SCALE;

      const logicalHeight =
        (frame.srcH ??
          frame.sizeH ??
          frame.rect?.h ??
          0) / BLOCK_ASSET_SCALE;

      const definition = {
        id: frameName,
        frame: frameName,
        sheet: sheetKey,

        family,
        type: classification.type,
        collision: classification.collision,

        // Original atlas information.
        atlas: {
          rect: frame.rect || null,

          source: {
            w:
              frame.srcW ??
              frame.sizeW ??
              frame.rect?.w ??
              0,

            h:
              frame.srcH ??
              frame.sizeH ??
              frame.rect?.h ??
              0,
          },

          offset: {
            x: frame.offX ?? 0,
            y: frame.offY ?? 0,
          },

          rotated: !!frame.rotated,
        },

        // Convert UHD pixels to this engine's logical coordinate space.
        size: {
          width: logicalWidth,
          height: logicalHeight,
        },

        variant: frameVariant(frameName, family),
      };

      this.frames[frameName] = definition;

      if (!this.byFamily[family]) {
        this.byFamily[family] = [];
      }

      this.byFamily[family].push(definition);

      if (!this.byType[classification.type]) {
        this.byType[classification.type] = [];
      }

      this.byType[classification.type].push(definition);
    }
  },

  get(frameName) {
    return this.frames[frameName] || null;
  },

  /**
   * The live Sheet a definition (or a bare 'blocks'/'objects' key) lives in.
   * Lets a caller blit a resolved frame without knowing which atlas it came
   * from — that is the whole point of recording `sheet` on every definition.
   */
  sheetFor(definition) {
    const key = typeof definition === 'string'
      ? definition
      : (definition && definition.sheet);

    return this.sheetObjects[key] || null;
  },

  getFamily(family) {
    return this.byFamily[family] || [];
  },

  getType(type) {
    return this.byType[type] || [];
  },

  has(frameName) {
    return !!this.frames[frameName];
  },

  /**
   * Find the first matching frame for a family/variant.
   *
   * Example:
   *   BlockDefinitions.find('square', '01')
   */
  find(family, variant = '') {
    const list = this.getFamily(family);

    if (!variant) {
      return list[0] || null;
    }

    return (
      list.find(
        (entry) => entry.variant === String(variant)
      ) ||

      list.find(
        (entry) => entry.id.includes(`_${variant}_`)
      ) ||

      null
    );
  },

  /**
   * Return the actual sprite frame name to give SheetHandler/renderer.
   */
  frameName(frameName) {
    const definition = this.get(frameName);
    return definition ? definition.frame : null;
  },

  /**
   * Useful for debugging the atlas in the browser console.
   */
  stats() {
    const familyCount = Object.keys(this.byFamily).length;
    const typeCount = Object.keys(this.byType).length;

    return {
      totalFrames: Object.keys(this.frames).length,
      families: familyCount,
      types: typeCount,

      byType: Object.fromEntries(
        Object.entries(this.byType).map(
          ([type, list]) => [type, list.length]
        )
      ),
    };
  },
};

// Optional global helper.
async function loadBlockDefinitions() {
  return BlockDefinitions.load();
}
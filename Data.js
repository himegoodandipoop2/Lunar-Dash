// Data.js
// Entity datastore for player modes in the Geometry Dash clone

const EntityTypes = {
  CUBE:   'Cube',
  SHIP:   'Ship',
  BALL:   'Ball',
  UFO:    'UFO',
  WAVE:   'Wave',
  ROBOT:  'Robot',
  SPIDER: 'Spider',
};

// Hitbox model — every mode owns THREE hitboxes, mirroring GD:
//   hitbox         (BLUE)  solid collision: blocks / platforms, full size
//   hazardHitbox   (RED)   hazards: spikes. Small inner box (~1/3 of the body),
//                          centered — grazing a spike's edge survives, like GD
//   rotationHitbox (GREEN) the box used for landing / ground snapping. It never
//                          rotates and never changes size, so a spinning sprite
//                          can never shift where collision actually happens.
const entityStore = {
  [EntityTypes.CUBE]: {
    name: 'Cube',
    gravity: true,
    input: 'jump',
    hitbox: { w: 30, h: 30 },          // BLUE — full body, drives visual size + solid collision
    hazardHitbox: { w: 18, h: 18 },    // RED — small inner box, centered, forgiving spike hits
    rotationHitbox: { w: 30, h: 30 },  // GREEN — matches hitbox, so ground-snap = visual bottom
    rotates: true,
    rotationStep: Math.PI / 2,
    flipGravityOnPad: true,
  },
  [EntityTypes.SHIP]: {
    name: 'Ship',
    gravity: true,
    input: 'hold',         // hold = fly up, release = fall
    hitbox: { w: 30, h: 20 },
    hazardHitbox: { w: 18, h: 12 },
    rotationHitbox: { w: 30, h: 20 },
    rotates: true,          // tilts based on velocity
    maxTilt: 65,
  },
  [EntityTypes.BALL]: {
    name: 'Ball',
    gravity: true,
    input: 'tap',           // tap = flip gravity instantly
    hitbox: { w: 30, h: 30 },
    hazardHitbox: { w: 18, h: 18 },
    rotationHitbox: { w: 30, h: 30 },
    rotates: true,           // rolls continuously
    flipGravityOnTap: true,
  },
  [EntityTypes.UFO]: {
    name: 'UFO',
    gravity: true,
    input: 'tap',            // tap = single small hop, can chain
    hitbox: { w: 30, h: 26 },
    hazardHitbox: { w: 18, h: 16 },
    rotationHitbox: { w: 30, h: 26 },
    rotates: false,
    hopHeight: 'fixed',
  },
  [EntityTypes.WAVE]: {
    name: 'Wave',
    gravity: false,
    input: 'hold',            // hold = diagonal up, release = diagonal down
    hitbox: { w: 16, h: 16 },  // BLUE — full sprite, no rotation
    hazardHitbox: { w: 10, h: 10 },
    rotationHitbox: { w: 16, h: 16 },
    rotates: false,
    diagonalAngle: Math.PI / 4, // 45°, in radians
  },
  [EntityTypes.ROBOT]: {
    name: 'Robot',
    gravity: true,
    input: 'hold',              // hold = variable jump height (charge jump)
    hitbox: { w: 30, h: 30 },
    hazardHitbox: { w: 18, h: 18 },
    rotationHitbox: { w: 30, h: 30 },
    rotates: false,
    chargeJump: true,
  },
  [EntityTypes.SPIDER]: {
    name: 'Spider',
    gravity: true,
    input: 'tap',                // tap = instant teleport to nearest surface
    hitbox: { w: 30, h: 30 },
    hazardHitbox: { w: 18, h: 18 },
    rotationHitbox: { w: 30, h: 30 },
    rotates: false,
    teleportOnTap: true,
  },
};

function getEntity(type) {
  return entityStore[type];
}

// ============================================================
// Player save data — mutable, persisted to localStorage.
// Unlike entityStore above (static config), this changes at runtime.
// ============================================================

const SAVE_KEY = 'lunarDash_saveData';

const defaultPlayerData = {
  colors: {
    primary: '#00ffcc',
    secondary: '#ff00aa',
    glow: '#ffffff',
  },
  selectedIcons: {
    [EntityTypes.CUBE]: 1,
    [EntityTypes.SHIP]: 1,
    [EntityTypes.BALL]: 1,
    [EntityTypes.UFO]: 1,
    [EntityTypes.WAVE]: 1,
    [EntityTypes.ROBOT]: 1,
    [EntityTypes.SPIDER]: 1,
  },
  levelsCompleted: {
    // populated as: 'levelId': { completed: true, bestPercent: 100, attempts: 12 }
  },
};

let playerData = loadPlayerData();

// ============================================================
// Level registry — main/official levels only for now.
// IDs are prefixed ('main-N') so user-created levels (later: 'user-N')
// can never collide with these, no matter how many of either exist.
// ============================================================

const mainLevels = {
  // `file` points at the hand-authored MainLevelSetup JSON (tile-grid layout).
  // name/difficulty/modes/song below are the registry fallbacks — when the JSON
  // loads, its values win (so configuring the music in the JSON just works).
  'main-1': { name: 'Stereo Madness',  difficulty: 1, modes: [EntityTypes.CUBE, EntityTypes.SHIP], song: 'Music/StereoMadness.mp3', file: 'MainLevelSetup/StereoMadness.json' },
  'main-2': { name: 'Back On Track',   difficulty: 2, modes: [EntityTypes.CUBE, EntityTypes.SHIP], song: 'Music/BackOnTrack.mp3', file: 'MainLevelSetup/BackOnTrack.json' },
  'main-3': { name: 'Polargeist',      difficulty: 3, modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/Polargeist.mp3', file: 'MainLevelSetup/Polargeist.json' },
  'main-4': { name: 'Dry Out',         difficulty: 4, modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/DryOut.mp3', file: 'MainLevelSetup/DryOut.json' },
  'main-5': { name: 'Base After Base', difficulty: 5, modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/BaseAfterBase.mp3', file: 'MainLevelSetup/BaseAfterBase.json' },
  // add more as you build them out — order matches GD's own level list
};

// Level ids in registry order, which is the order the level select shows them
function getLevelIds() {
  return Object.keys(mainLevels);
}

function getMainLevel(levelId) {
  return mainLevels[levelId];
}

// ============================================================
// UI assets — every sprite and font the menus draw.
// Atlases are (png, plist) pairs; `frames` names the ones we actually use, so
// renaming art in the sheet is a one-line change here instead of a hunt.
// ============================================================
const uiAssets = {
  fonts: {
    big: 'Images/Fonts/bigFont-uhd.fnt',   // Pusab 128px — headings, buttons
    gold: 'Images/Fonts/goldFont-uhd.fnt', // Pusab 96px — level names, scores
  },
  sheets: {
    // Main UI atlas: buttons, arrows and difficulty faces all live here
    game: {
      png: 'Images/MenuImgs/GJ_GameSheet03-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet03-uhd.plist',
    },
    // Only the logo lives here, and it's a far smaller download
    launch: {
      png: 'Images/MenuImgs/GJ_LaunchSheet-uhd.png',
      plist: 'Images/MenuImgs/GJ_LaunchSheet-uhd.plist',
    },
    // Level blocks + spikes live here (square_XX / spike_XX frames).
    // BlockDefinitions.js registers this atlas as the 'blocks' sheet.
    blocks: {
      png: 'Images/MenuImgs/GJ_GameSheet-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet-uhd.plist',
    },
    // Portals (portal_XX_front/back) + extra object art live here.
    // BlockDefinitions.js registers this atlas as the 'objects' sheet, which is
    // the key LEVEL_PARTS records on portal / boost parts.
    blocks2: {
      png: 'Images/MenuImgs/GJ_GameSheet02-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet02-uhd.plist',
    },
  },
  images: {
    background: 'Images/LevelImg/game_bg_01_001-uhd.png',
    ground: 'Images/LevelImg/groundSquare_01_001-uhd.png',
    progressBar: 'Images/MenuImgs/GJ_progressBar_001-uhd.png',
    loading: 'Images/MenuImgs/loadingCircle-uhd.png',
  },
  frames: {
    // Gameplay parts (blocks / spikes / portals / orbs) are NOT named here any
    // more — they come from the LEVEL_PARTS catalog in Levels.js, which resolves
    // every part through BlockDefinitions.js. Only menu artwork lives below.
    logo: 'GJ_logo_001.png',
    play: 'GJ_playBtn_001.png',          // also used as the pause-menu Resume
    replay: 'GJ_replayBtn_001.png',      // pause menu: Restart
    menu: 'GJ_menuBtn_001.png',          // pause menu: Quit to menu
    pause: 'GJ_pauseBtn_001.png',        // in-game HUD pause button
    pauseClean: 'GJ_pauseBtn_clean_001.png',
    arrowPrev: 'GJ_arrow_01_001.png',
    arrowNext: 'GJ_arrow_02_001.png',
    complete: 'GJ_levelComplete_001.png',
    bigStar: 'GJ_bigStar_001.png',
    starsIcon: 'GJ_starsIcon_001.png',
    // Extra frames for the GD-identical menu / level-select chrome
    garage: 'GJ_garageBtn_001.png',      // main menu: icon kit (left button)
    creator: 'GJ_creatorBtn_001.png',    // main menu: creator (right button)
    back: 'GJ_backBtn_001.png',          // top-left back arrow button
    myLevels: 'accountBtn_myLevels_001.png', // level-select header art
    note: 'GJ_noteIcon_001.png',         // song box note icon
    selectSong: 'GJ_selectSongBtn_001.png',
    starSmall: 'star_small01_001.png',   // star reward counter on the card
    dot: 'uiDot_001.png',                // level-select page dots
    close: 'GJ_closeBtn_001.png',
    practice: 'GJ_practiceBtn_001.png',  // pause menu practice button
    topBar: 'GJ_topBar_001.png',         // GD's top bar strip
  },
};

// Debug hitbox colours (press H in a level). Matches GD's own editor debug
// colours: blue = solid collision, red = hazards, green = rotation box.
const HitboxDebug = {
  enabled: false,
  colors: {
    blue: 'rgba(64, 128, 255, 0.9)',
    red: 'rgba(255, 48, 48, 0.9)',
    rotation: 'rgba(48, 220, 96, 0.9)',
  },
};

// GD's difficulty faces: 01 Easy, 02 Normal, 03 Hard, 04 Harder, 05 Insane,
// 06-10 Demon tiers. Levels store a plain 1-10 index.
function difficultyFrame(index) {
  const n = Math.max(0, Math.min(10, Number(index) || 0));
  return `difficulty_${String(n).padStart(2, '0')}_btn_001.png`;
}

// ============================================================
// Sound effects — global, not tied to a specific level
// ============================================================

const sfx = {
  death: 'Music/SFX/PlayerExplode.mp3', // player shatters on a hazard
  complete: 'Music/SFX/EndStart.mp3',   // level finished
  // PlaySound fires once when a level STARTS (entering gameplay / restarting).
  play: 'Music/SFX/PlaySound.mp3',
  // QuitSound fires once when LEAVING a level (quit to menu / level select).
  quit: 'Music/SFX/QuitSound.mp3',
  // Backwards-compat aliases so old playSFX('click') calls stay silent-safe.
  click: 'Music/SFX/PlaySound.mp3',
};

// Menu music loops for as long as index.html is open, so it's kept separate
// from the one-shot sfx above (which are re-created per play).
const menuMusic = 'Music/SFX/MenuLoop.mp3';

function playSFX(name) {
  const path = sfx[name];
  if (!path) {
    console.warn(`No SFX registered for: ${name}`);
    return;
  }
  const audio = new Audio(path);
  audio.volume = 0.6;
  // A missing file must never break the game loop — swallow both the rejected
  // promise and the element's own error event.
  audio.addEventListener('error', () => {});
  audio.play().catch(() => {});
}

function loadPlayerData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(defaultPlayerData);

    const saved = JSON.parse(raw);
    // Merge with defaults so new fields (added later, e.g. after an update)
    // don't break old save files that don't have them yet
    return {
      ...structuredClone(defaultPlayerData),
      ...saved,
      colors: { ...defaultPlayerData.colors, ...saved.colors },
      selectedIcons: { ...defaultPlayerData.selectedIcons, ...saved.selectedIcons },
      levelsCompleted: { ...saved.levelsCompleted },
    };
  } catch (err) {
    console.warn('Failed to load save data, using defaults:', err);
    return structuredClone(defaultPlayerData);
  }
}

function savePlayerData() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(playerData));
  } catch (err) {
    console.warn('Failed to save data:', err);
  }
}

function setPlayerColors(colors) {
  playerData.colors = { ...playerData.colors, ...colors };
  savePlayerData();
}

function setSelectedIcon(mode, number) {
  playerData.selectedIcons[mode] = number;
  savePlayerData();
}

function markLevelComplete(levelId, { percent = 100 } = {}) {
  const existing = playerData.levelsCompleted[levelId];
  playerData.levelsCompleted[levelId] = {
    completed: true,
    bestPercent: Math.max(existing?.bestPercent || 0, percent),
    attempts: (existing?.attempts || 0) + 1,
  };
  savePlayerData();
}

function recordLevelAttempt(levelId) {
  // Call this even on a failed attempt, so attempt counts stay accurate
  const existing = playerData.levelsCompleted[levelId];
  playerData.levelsCompleted[levelId] = {
    completed: existing?.completed || false,
    bestPercent: existing?.bestPercent || 0,
    attempts: (existing?.attempts || 0) + 1,
  };
  savePlayerData();
}
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
  SWING:  'Swing',
};

const entityStore = {
  [EntityTypes.CUBE]: {
    name: 'Cube',
    gravity: true,
    input: 'jump',        // tap = single jump, hold = jump on landing
    hitbox: { w: 32, h: 32 },
    rotates: true,
    rotationStep: Math.PI / 2, // quarter-turn (90°) per jump, in radians
    flipGravityOnPad: true,
  },
  [EntityTypes.SHIP]: {
    name: 'Ship',
    gravity: true,
    input: 'hold',         // hold = fly up, release = fall
    hitbox: { w: 34, h: 24 },
    rotates: true,          // tilts based on velocity
    maxTilt: 30,
  },
  [EntityTypes.BALL]: {
    name: 'Ball',
    gravity: true,
    input: 'tap',           // tap = flip gravity instantly
    hitbox: { w: 30, h: 30 },
    rotates: true,           // rolls continuously
    flipGravityOnTap: true,
  },
  [EntityTypes.UFO]: {
    name: 'UFO',
    gravity: true,
    input: 'tap',            // tap = single small hop, can chain
    hitbox: { w: 32, h: 28 },
    rotates: false,
    hopHeight: 'fixed',
  },
  [EntityTypes.WAVE]: {
    name: 'Wave',
    gravity: false,
    input: 'hold',            // hold = diagonal up, release = diagonal down
    hitbox: { w: 16, h: 16 },  // thin hitbox, no rotation
    rotates: false,
    diagonalAngle: Math.PI / 4, // 45°, in radians
  },
  [EntityTypes.ROBOT]: {
    name: 'Robot',
    gravity: true,
    input: 'hold',              // hold = variable jump height (charge jump)
    hitbox: { w: 32, h: 34 },
    rotates: false,
    chargeJump: true,
  },
  [EntityTypes.SPIDER]: {
    name: 'Spider',
    gravity: true,
    input: 'tap',                // tap = instant teleport to nearest surface
    hitbox: { w: 30, h: 30 },
    rotates: false,
    teleportOnTap: true,
  },
  [EntityTypes.SWING]: {
    name: 'Swing',
    gravity: true,               // constant, but flips each tap (like a pendulum)
    input: 'tap',
    hitbox: { w: 30, h: 30 },
    rotates: false,
    flipGravityOnTap: true,
    swingPhysics: true,
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
    [EntityTypes.SWING]: 1,
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
  'main-1': { name: 'Stereo Madness', modes: [EntityTypes.CUBE, EntityTypes.SHIP], song: 'Music/StereoMadness.mp3' },
  'main-2': { name: 'Back On Track', modes: [EntityTypes.CUBE, EntityTypes.SHIP], song: 'Music/BackOnTrack.mp3' },
  'main-3': { name: 'Polargeist', modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/Polargeist.mp3' },
  'main-4': { name: 'Dry Out', modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/DryOut.mp3' },
  'main-5': { name: 'Base After Base', modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/BaseAfterBase.mp3' },
  // add more as you build them out — order matches GD's own level list
};

function getMainLevel(levelId) {
  return mainLevels[levelId];
}

// ============================================================
// Sound effects — global, not tied to a specific level
// ============================================================

const sfx = {
  death: 'Music/SFX/Death.mp3',
  complete: 'Music/SFX/Complete.mp3',
};

function playSFX(name) {
  const path = sfx[name];
  if (!path) {
    console.warn(`No SFX registered for: ${name}`);
    return;
  }
  const audio = new Audio(path);
  audio.play();
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
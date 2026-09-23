# Lunar Dash

A remix of Geometry Dash for schools. This is a better version of Geometry Dash Lite from someone else.

Created by Lunar Eclipse. An unblocked game site.

---

## MainLevelSetup — the five main levels

Each main level's layout is hand-authored in `MainLevelSetup/<Name>.json` on the
same 30px tile grid GD uses (the cube is 30x30, so every block is 30x30). The
game fetches the JSON at level start; if a file is missing or empty it falls
back to the seeded procedural builder, so nothing hard-crashes.

```json
{
  "name": "Stereo Madness",
  "difficulty": 1,
  "modes": ["Cube", "Ship"],
  "song": "Music/StereoMadness.mp3",
  "objects": [
    { "t": "block",  "x": 24, "y": 0, "w": 3, "h": 2 },
    { "t": "spike",  "x": 40, "y": 0 },
    { "t": "spike",  "x": 48, "y": 0, "kind": "ice" },
    { "t": "orb",    "x": 70, "y": 4, "kind": "red" },
    { "t": "portal", "x": 100, "y": 0, "mode": "Ship" },
    { "t": "finish", "x": 420 }
  ],
  "triggers": [
    { "t": "color", "x": 120, "channel": "bg", "color": "#287dff", "duration": 0.5 },
    { "t": "move",  "x": 200, "dx": 10, "dy": 0, "duration": 2 },
    { "t": "pulse", "x": 300, "color": "#ff66ff", "strength": 0.5 }
  ]
}
```

* `x`/`y`/`w`/`h` are **tiles** — multiply by 30 for px. `y` is height above the ground.
* `song` in the JSON wins over the registry, so music is configured per level file.
* Any object may also pick its own sprite: `"kind"` (a catalog variant such as an
  `ice` spike or a `red` orb), `"variant"` (a family variant by number, `4` → `spike_04`),
  `"frame"` (an exact atlas frame) and `"sheet"` (`blocks` or `objects`). See
  [Parts and sprites](#parts-and-sprites).
* **Triggers** are invisible in gameplay (`color` triggers tint the bg/ground
  channels; `move`/`pulse` are parsed and stored but not simulated yet). The
  [editor](#create--the-level-editor) exports an empty `triggers` list.

## Create — the level editor

The home menu's **CREATE** button opens a tile-grid editor laid out like Geometry
Dash 2.1's own editor: a top bar, the level grid, and a palette band along the
bottom. It is driven by the same `LEVEL_PARTS` catalog the gameplay renderer
blits, so the palette can never offer a part the game is unable to draw.

```text
┌ [pause] [undo] [redo] ──── "My Level" · 128 PARTS ──── [gear] ┐  top bar
│                          the level grid                       │  tap or drag to build
│  ◀                                                         ▶  │  camera scroll
├───────────────────────────────────────────────────────────────┤
│ [BUILD]   ◀   chip chip chip chip chip chip chip   ▶  1/2     │  paged palette
│ [DELETE]      chip chip chip chip chip chip chip              │
│ [SIZE]                                                [TEST]  │
│ [SWIPE]                                                       │
└───────────────────────────────────────────────────────────────┘
```

| Piece | What it does |
| --- | --- |
| Grid | Tap a tile to place the selected part, one tile at a time; wide/tall parts draw at their real footprint. A ghost under the pointer previews the size about to be stamped. `x = 0` is the level's start line, marked on the grid. |
| BUILD | The default tab: taps and drags place the selected part. |
| DELETE | Deletes parts under the tap, or under a drag. |
| SIZE | Opens the part popover: cycles the footprint stamped on new blocks, spikes and platforms through the sizes the shipped levels use — `1x1`, `2x1`, `2x2`, `2x3`, `2x4`, `3x1`, `3x2` and `3x3`. |
| SWIPE | Turns drag-painting on or off. With swipe off, a tap still places a single part — that is how you build precisely without a mouse. |
| Palette | One chip per catalog part — every block/spike kind, the platform, each pad and orb colour, every portal (the two gravity portals included) and the finish line. Two rows per page with `◀` / `▶` paging, so a narrow window shows fewer chips per page instead of hiding them. Chips show the real atlas frame. |
| pause | Opens the editor sheet: **RESUME**, or **SAVE & EXIT** back to the home menu. |
| UNDO / REDO | One step per stroke — a whole drag counts as one. A new edit clears the redo trail. |
| gear | Level settings: **NAME**, **SIZE**, **IMPORT**, **EXPORT**, **CLEAR** (undoable) and **CLOSE**. |
| TEST | Plays the grid through the real gameplay pipeline (`convertJsonObject` → parts → sprites). Finishing or quitting returns to the editor with the grid intact. |
| EXPORT | Downloads the grid as `MainLevelSetup`-shaped JSON. |
| IMPORT | Loads a `MainLevelSetup/*.json` file back onto the grid, header and all, so a shipped level can be opened, edited and exported again. |

### Editor keybinds

| Key | Action |
| --- | --- |
| `Esc` | Close the open sheet — or, with none open, save the draft and return to the menu |
| `Z` / `Ctrl+Z` | Undo |
| `Y` / `Ctrl+Shift+Z` | Redo |
| `B` | Build tab |
| `D` / `Delete` / `Backspace` | Delete tab |
| `E` | Open or close the part-size popover |
| `S` | Toggle swipe (drag-painting) |
| `←` / `→` | Scroll the camera 4 tiles (`Shift` = 1 tile) |
| `↑` / `↓` | Previous / next part in the palette |
| `,` `.` / `PageUp` `PageDown` | Previous / next palette page |
| `1`–`9` | Jump to palette page N |
| `+` / `-` | Next / previous part size |
| `Space` / `Enter` / `T` | Playtest the grid |
| `N` | Rename the level |
| `G` | Open level settings |

The draft autosaves to `localStorage` (`lunardash.create.draft.v1`) as you work, so a
refresh never loses a level; `Escape`, the pause sheet's **SAVE & EXIT**, or the
**CLOSE** button on the settings sheet all leave the editor with the draft flushed.

Every behaviour above is covered by `verify_create.js`, a headless harness that loads
the real scripts in a Node `vm` with the DOM stubbed out and drives the buttons each
frame registers (plus every keybind):

```bash
node verify_create.js
```

It prints the check count and exits non-zero on a regression. It also reads the shipped
`.plist` atlases, so an editor sprite name that doesn't exist fails the run too.

### Getting an exported level into the game

1. `EXPORT` writes `<LevelName>.json` to your downloads.
2. Move that file into `MainLevelSetup/`.
3. Register it in `mainLevels` (`Data.js`) so it appears in the level select:

```js
'main-6': {
  name: 'My Level', difficulty: 3,
  modes: [EntityTypes.CUBE, EntityTypes.SHIP],
  song: 'Music/MySong.mp3',
  file: 'MainLevelSetup/MyLevel.json',
},
```

A level whose `file` is missing or malformed falls back to the seeded procedural
builder, so a bad export can never break the game — it just logs why.

## Hitboxes

Every mode owns three axis-aligned hitboxes (see `Data.js`), mirroring GD:

| Box | Used for | Cube size |
| --- | --- | --- |
| **Blue** (`hitbox`) | solid collision: blocks, platforms, portals (half the sprite) | 15x15 |
| **Red** (`hazardHitbox`) | hazards: spikes (full sprite size) | 30x30 |
| **Rotation** (`rotationHitbox`) | ground/ceiling snap — never rotates or resizes, so a spinning sprite can never shift collision | 30x30 |

---

## Running it

The game loads its icon sprite data with `fetch()`, so **it must be served over HTTP** —
opening `index.html` directly from disk (`file://`) will fail to load any icons.

```bash
cd Lunar-Dash
python3 -m http.server 8000
```

Then open <http://localhost:8000/index.html>.

Any static server works (`npx serve`, `php -S localhost:8000`, VS Code Live Server, GitHub Pages, …).
There is no build step and no dependencies — everything is plain ES + `<script>` tags.

### Controls

| Input | Action |
| --- | --- |
| `Space` / `↑` / `W` / click / tap | Jump / fly / flip, depending on the current mode |
| Hold | Ship thrust, Wave diagonal, Robot charge jump, Cube auto-jump on landing |
| `R` | Restart the level |

---

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | The whole game: menu, icons, level select, gameplay, pause (single canvas) |
| `Game.html` | Legacy redirect — forwards old links (with `?level=`) to `index.html` |
| `Data.js` | Entity/mode config, save data (`localStorage`), level registry, sound effects |
| `SheetHandler.js` | Shared images, `.plist` atlases, bitmap fonts |
| `BlockDefinitions.js` | Reads every frame of the two gameplay atlases and classifies it (block / spike / portal / ring…), so parts are looked up by family instead of by hard-coded name |
| `Levels.js` | The `LEVEL_PARTS` part catalog + level geometry (hazards, portals, finish line) and the deterministic builder |
| `IconHandler.js` | Cocos2d-style sprite-sheet icon compositing (base / secondary / glow / extra) |
| `PlayerController.js` | `Player` class + the `Physics` tuning constants |
| `MainHandler.js` | Entry point. Screen machine + game loop for `index.html` |
| `verify_create.js` | Headless harness for the level editor (`node verify_create.js`) |
| `MainMenu.css`, `Game.css` | Styling |

### Load order matters

Scripts are loaded in dependency order in `index.html`:

```
Data.js → SheetHandler.js → BlockDefinitions.js → Levels.js → IconHandler.js
        → PlayerController.js → MainHandler.js
```

### Parts and sprites

Nothing in the renderer names a sprite. Every level object carries a **catalog part**
(`LEVEL_PARTS` in `Levels.js`), and the catalog is resolved through
`BlockDefinitions.js`, which classifies all ~2,980 frames of
`GJ_GameSheet(-uhd)` and `GJ_GameSheet02(-uhd)` by family:

| Part | Family / default frame | Atlas (`sheet`) |
| --- | --- | --- |
| block | `square` → `square_01_001.png` (kinds: `brick`, `plank`, `outline`, `design`) | `blocks` |
| spike | `spike` → `spike_01_001.png` (kinds: `color`, `ice`, `fake`) | `blocks` |
| platform | `plank` → `plank_01_001.png` | `blocks` |
| orb | `ring` → `ring_01_001.png` (yellow/pink/red/blue/green) | `blocks` |
| portal | `portal` → one frame per mode (`portal_01/07/09/11/13/14/17`, `portal_02/12` for gravity) | `objects` |
| pad | `boost` → **vector by default**, see below | `objects` |
| finish | drawn checkerboard, never an atlas frame | — |

So the atlas answers *which frame, which atlas, how big* — a part only has to say what it
is. Orb frames were matched to `ORB_KINDS` colours by sampling the atlas
(yellow `ring_01` #fffaa7, pink `ring_03` #ffadff, red `ring_02` #ff9981,
blue `gravring_01` #9cffff, green `dashRing_01` #77fa77).

A part can also carry a per-kind variant and a `fit` mode — `tile` (blocks and
platforms repeat on the 30px grid), `contain` (spikes, orbs) or `height` (portals) — plus
an `anchor` so a short spike `spike_02/03/04` stands *on* the surface rather than floating
mid-box. Ceiling spikes are the same frame mirrored with `ctx.scale(1, -1)`, because the
atlas ships no upside-down spike.

Pads deliberately stay vector-drawn: the atlas' `boost_*` frames are authored at GD's own
scale and colour order (gold, cyan, green, purple, red) and none of them fit this
project's 2×0.5-tile pad box, so `LEVEL_PARTS` marks them `art: false`. A level file can
opt into real pad art per object with an explicit `frame`.

Everything degrades: if `BlockDefinitions.js` never loads, each part falls back to the
frame name written in the catalog; if that frame is missing too, the object draws the
vector shape it always had.

### Coordinate convention

`Levels.js` authors `y` as **height above the ground line** (so `y: 0` rests on the floor),
while `PlayerController.js` works in canvas space where `y` grows downward and is the
hitbox **centre**. `MainHandler.objectBox()` does the conversion.

### Physics tuning envelope

Everything in `Physics` (`PlayerController.js`) was tuned together. The two numbers that
matter when authoring a level:

* forward speed `380 px/s`, cube jump `560`, gravity `2330`
* → a cube jump is **~67px high and ~183px long** (about 2.1 tiles, spins 180° per arc)

So never author a ground wall taller than ~3 tiles, never author a hazard cluster wider
than ~180px, and leave ≥6 tiles between clusters.

---

## Adding icons

Icons are one folder per icon, named after the mode plus the icon number.
`IconHandler.js` builds these paths automatically:

```
Images/Icons/<Mode>/<Mode><number>/Icon<number>-uhd.png
Images/Icons/<Mode>/<Mode><number>/Icon<number>-uhd.plist
```

For example `Images/Icons/Cube/Cube2/Icon2-uhd.png`.

Then register the number in the manifest at the top of `IconHandler.js`:

```js
const iconManifest = {
  [EntityTypes.CUBE]: [1, 2], // add 3, 4, ... as you add folders
  [EntityTypes.SHIP]: [],
  // ...
};
```

The lowest number in a mode's list is that mode's starter icon. Modes with an empty list
are hidden from the menu, and the player falls back to the Cube icon in-game.

**Layers are detected by filename suffix**, so the frames inside the plist can use any
internal name prefix:

| Suffix | Layer |
| --- | --- |
| `_2_###.png` | secondary shape (recoloured with `secondary`) |
| `_glow_###.png` | glow outline (recoloured with `glow`) |
| `_extra_###.png` | detail layer (drawn last, **not** recoloured) |
| anything else | base shape (recoloured with `primary`) |

The plist's `metadata.size` must match the real PNG dimensions, and every `textureRect`
must sit inside the sheet — otherwise `drawImage` reads the wrong pixels.

## Adding levels

Add an entry to `mainLevels` in `Data.js`, then extend the builder in `Levels.js`
(`groundPatterns` / `airPatterns`) or hand-author objects with the `block()`, `spike()`,
`pad()`, `orb()` and `portal()` helpers. Levels are generated from a seeded RNG, so the
same level id always produces the same layout — a level stays learnable.

---

## Sound

One-shot effects live in the `sfx` map in `Data.js`; `playSFX(name)` plays one.

| Name | File | Fires when |
| --- | --- | --- |
| `death` | `Music/SFX/PlayerExplode.mp3` | the player hits a hazard |
| `complete` | `Music/SFX/EndStart.mp3` | the level is finished |
| `play` | `Music/SFX/PlaySound.mp3` | a level starts (level-select Play, pause Restart, `R`) |
| `quit` | `Music/SFX/QuitSound.mp3` | leaving a level (pause-menu quit) |

`Music/SFX/MenuLoop.mp3` loops on `index.html`, and each level's own song plays during
gameplay. Browsers block autoplay until the first user gesture, so both start on the
first click or key press — that's expected, not a bug.

---

## Known gaps

These are content gaps, not bugs — the game runs and degrades gracefully without them:

* **Songs.** `Music/StereoMadness.mp3` and `Music/BaseAfterBase.mp3` exist; the other
  three songs are still missing and play nothing until added.
* **Only Cube icons have sprite art.** Ship, Ball, UFO, Wave, Robot, Spider and
  Swing use a vector fallback drawn in your colours until their art lands.
* All 7 modes (2.1 set — no Swing) have working physics, but the main levels only use
  `Cube` and `Ship`.
* The Spider teleports to the nearest **world** surface (floor or ceiling) — it does not
  yet consider blocks or platforms as teleport targets.
* The [editor](#create--the-level-editor) authors parts only: triggers, per-object
  rotation and free (non-tile) placement aren't editable yet, and a level it exports
  keeps whatever header the imported file had.
// PlayerController.js
// Depends on EntityTypes and entityStore from Data.js — load Data.js first.
//
// Coordinate convention (matches Levels.js / MainHandler.js):
//   x = world distance, grows to the right
//   y = hitbox CENTER, grows DOWNWARD (canvas space)
// So "up" is negative y. Levels author y as height-above-ground and flip it
// when they hand the world bounds over, so nothing here needs to know that.
//
// Physics target:
//   Geometry Dash 2.1 classic game modes.
//   Cube / Ship / Ball / UFO / Wave / Robot / Spider.
//
// The numerical values below are calibrated to this project's 30 px tile size.
// The important goal is preserving the actual 2.1 movement relationships and
// input behavior rather than copying internal GD engine units directly.

// -------------------- Tunables --------------------

const Physics = {
  // Forward movement.
  // This is equivalent to the default 1x gameplay speed for this project.
  speed: 345,

  // Classic gravity.
  gravity: 2330,

  // Prevent numerical explosions / tunneling.
  terminalVelocity: 1400,

  // Cube jump.
  cubeJump: 600,

  // UFO jump.
  // UFO taps are independent mid-air hops.
  ufoHop: 605,

  // Ball gravity flip.
  // The ball changes gravity instantly rather than performing a normal jump.
  ballFlip: 620,

  // Ship physics.
  //
  // Ship movement is acceleration based:
  //   holding  -> accelerate against gravity
  //   releasing -> gravity pulls the ship back
  //
  // These values are calibrated so the ship has the characteristic GD
  // "floaty but responsive" control instead of behaving like a cube.
  shipThrust: 2600,
  shipGravity: 1800,
  shipMaxVy: 550,

  // Robot variable jump.
  robotChargeRate: 1500,
  robotMinJump: 520,
  robotMaxJump: 1000,

  // Transporter strengths used by MainHandler.
  padBoost: 900,
  orbBoost: 720,

  // Physics is internally subdivided so gameplay is less dependent on the
  // browser's rendering framerate.
  maxStep: 1 / 240,

  // Maximum simulation step from one render update.
  maxFrameTime: 0.1,

  // Visual rotation smoothing.
  rotationLerp: 18,
  landSnapRate: 28,

  // Spider horizontal search tolerance.
  spiderHorizontalTolerance: 200,

  // Small collision tolerance.
  surfaceTolerance: 2,
};

// A cube completes a half-turn over one complete jump arc.
//
// A full jump consists of:
//   rise + fall
//
// The cube rotates 180 degrees across that arc.
Physics.cubeSpinRate =
  (Math.PI * Physics.gravity) / (2 * Physics.cubeJump);


// ============================================================
// Player
// ============================================================

class Player {
  constructor(startType = EntityTypes.CUBE) {
    this.world = {
      groundY: 0,
      ceilingY: 0,
    };

    this.reset(startType);
  }

  get config() {
    return entityStore[this.type];
  }

  get hitbox() {
    return this.config.hitbox;
  }


  // ==========================================================
  // Hitboxes
  // ==========================================================

  // BLUE:
  // Main solid collision box.
  get boxBlue() {
    const w = this.hitbox.w;
    const h = this.hitbox.h;

    return {
      left: this.x - w / 2,
      right: this.x + w / 2,
      top: this.y - h / 2,
      bottom: this.y + h / 2,
    };
  }

  // RED:
  // Hazard hitbox.
  get boxRed() {
    const hb = this.config.hazardHitbox || this.hitbox;

    return {
      left: this.x - hb.w / 2,
      right: this.x + hb.w / 2,
      top: this.y - hb.h / 2,
      bottom: this.y + hb.h / 2,
    };
  }

  // ROTATION:
  // Used by MainHandler for landing / surface snapping.
  get boxRotation() {
    const rb = this.config.rotationHitbox || this.hitbox;

    return {
      left: this.x - rb.w / 2,
      right: this.x + rb.w / 2,
      top: this.y - rb.h / 2,
      bottom: this.y + rb.h / 2,
    };
  }

  get width() {
    return this.hitbox.w;
  }

  get height() {
    return this.hitbox.h;
  }

  get left() {
    return this.x - this.width / 2;
  }

  get right() {
    return this.x + this.width / 2;
  }

  get top() {
    return this.y - this.height / 2;
  }

  get bottom() {
    return this.y + this.height / 2;
  }


  // ==========================================================
  // Support state
  // ==========================================================

  get isSupported() {
    const boundsSupport =
      this.gravityDir === 1
        ? this.onGround
        : this.onCeiling;

    return boundsSupport || this.onSolid;
  }

  setWorld(world) {
    this.world = world;
  }


  // ==========================================================
  // Reset
  // ==========================================================

  reset(startType = this.type) {
    this.type = startType;

    this.x = 0;
    this.y = 0;

    this.velocityY = 0;

    this.rotation = 0;
    this.renderRotation = 0;

    // 1 = normal gravity, toward the ground.
    // -1 = inverted gravity, toward the ceiling.
    this.gravityDir = 1;

    this.isHolding = false;
    this.holdTime = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;

    this.alive = true;
    this.finished = false;

    this.spinning = false;
    this.spinStart = 0;
  }


  // ==========================================================
  // Game-mode changes
  // ==========================================================

  changeMode(newType) {
    const oldGravity = this.gravityDir;

    this.type = newType;

    // Changing a game mode does NOT inherently change gravity.
    //
    // Gravity portals control gravity. Game-mode portals control the mode.
    // This distinction matters for combinations such as:
    //
    //   upside-down ship
    //   upside-down UFO
    //   upside-down spider
    //
    this.gravityDir = oldGravity;

    this.spinning = false;
    this.spinStart = 0;

    this.rotation = 0;
    this.renderRotation = 0;

    this.velocityY = 0;
    this.holdTime = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;
  }


  // ==========================================================
  // Input
  // ==========================================================

  handleInputDown(solidObjects = null) {
    const cfg = this.config;

    this.isHolding = true;
    this.holdTime = 0;

    // Ball:
    // click = reverse gravity.
    if (cfg.flipGravityOnTap) {
      this.flipGravity();
      return;
    }

    // Spider:
    // click = instant teleport to the opposite surface.
    if (cfg.teleportOnTap) {
      this.teleportToNearestSurface(solidObjects);
      return;
    }

    // Cube / UFO:
    // click = jump.
    if (cfg.input === 'jump' || cfg.input === 'tap') {
      this.jump();
      return;
    }

    // Ship / Wave / Robot:
    // handled during update().
  }

  handleInputUp() {
    const cfg = this.config;

    // Robot:
    // Jump strength is determined by how long the button was held.
    if (cfg.chargeJump && this.isSupported) {
      const power = Math.min(
        Physics.robotMaxJump,
        Physics.robotMinJump +
          this.holdTime * Physics.robotChargeRate
      );

      this.velocityY = -power * this.gravityDir;
    }

    this.isHolding = false;
    this.holdTime = 0;
  }


  // ==========================================================
  // Frame update
  // ==========================================================

  update(deltaTime, world) {
    if (world) {
      this.world = world;
    }

    // Clamp the incoming render delta.
    let remaining = Math.min(
      Math.max(0, deltaTime),
      Physics.maxFrameTime
    );

    // Run multiple small physics steps.
    //
    // This makes the game-mode physics much more stable across monitors and
    // browser frame rates.
    while (remaining > 0) {
      const dt = Math.min(remaining, Physics.maxStep);

      this.physicsStep(dt);

      remaining -= dt;
    }

    this.updateVisualRotation(
      Math.min(Math.max(0, deltaTime), Physics.maxFrameTime)
    );
  }


  // ==========================================================
  // Physics step
  // ==========================================================

  physicsStep(dt) {
    const cfg = this.config;

    // GD gameplay continuously moves forward.
    this.x += Physics.speed * dt;

    this.applyVerticalPhysics(cfg, dt);

    this.velocityY = clamp(
      this.velocityY,
      -Physics.terminalVelocity,
      Physics.terminalVelocity
    );

    this.y += this.velocityY * dt;

    this.applyWorldBounds();

    // Cube:
    //
    // Holding the button can immediately trigger another jump after landing.
    // This is the familiar GD "hold to auto-jump" behavior.
    if (
      this.type === EntityTypes.CUBE &&
      this.isHolding &&
      this.isSupported &&
      this.velocityY >= 0
    ) {
      this.jump();
    }

    // Robot charging happens while supported.
    if (
      this.type === EntityTypes.ROBOT &&
      this.isHolding &&
      this.isSupported
    ) {
      this.holdTime += dt;
      this.velocityY = 0;
    }
  }


  // ==========================================================
  // Vertical physics
  // ==========================================================

  applyVerticalPhysics(cfg, dt) {

    // --------------------------------------------------------
    // WAVE
    // --------------------------------------------------------
    //
    // Wave has no gravity-based arc.
    //
    // Holding:
    //     diagonal upward
    //
    // Releasing:
    //     diagonal downward
    //
    // Both directions are straight lines.
    if (this.type === EntityTypes.WAVE) {
      const angle = this.isHolding
        ? -cfg.diagonalAngle
        : cfg.diagonalAngle;

      this.velocityY =
        Math.sin(angle) * Physics.speed;

      return;
    }


    // --------------------------------------------------------
    // SHIP
    // --------------------------------------------------------
    //
    // Holding accelerates the ship against gravity.
    // Releasing allows gravity to pull it back.
    //
    // This is deliberately acceleration-based rather than a jump impulse.
    if (this.type === EntityTypes.SHIP) {
      const acceleration = this.isHolding
        ? -Physics.shipThrust
        : Physics.shipGravity;

      this.velocityY +=
        acceleration * this.gravityDir * dt;

      this.velocityY = clamp(
        this.velocityY,
        -Physics.shipMaxVy,
        Physics.shipMaxVy
      );

      return;
    }


    // --------------------------------------------------------
    // ROBOT
    // --------------------------------------------------------
    //
    // Robot does not continuously accelerate while charging.
    // It stores the hold duration and launches when released.
    if (this.type === EntityTypes.ROBOT) {
      if (this.isHolding && this.isSupported) {
        this.velocityY = 0;
      } else {
        this.velocityY +=
          Physics.gravity * this.gravityDir * dt;
      }

      return;
    }


    // --------------------------------------------------------
    // CUBE / BALL / UFO / SPIDER
    // --------------------------------------------------------
    //
    // These use standard gravity.
    if (cfg.gravity) {
      this.velocityY +=
        Physics.gravity * this.gravityDir * dt;
    }
  }


  // ==========================================================
  // Visual rotation
  // ==========================================================

  updateVisualRotation(deltaTime) {
    const dt = Math.min(
      Math.max(0, deltaTime),
      Physics.maxFrameTime
    );

    // --------------------------------------------------------
    // CUBE
    // --------------------------------------------------------
    if (this.type === EntityTypes.CUBE) {
      if (!this.isSupported) {
        this.rotation +=
          Physics.cubeSpinRate *
          this.gravityDir *
          dt;

        this.spinning = true;

        this.renderRotation +=
          (this.rotation - this.renderRotation) *
          Math.min(
            1,
            dt * Physics.rotationLerp
          );
      } else {
        this.spinning = false;

        const step = Math.PI / 2;

        const snapped =
          Math.round(this.rotation / step) * step;

        this.renderRotation +=
          (snapped - this.renderRotation) *
          Math.min(
            1,
            dt * Physics.landSnapRate
          );

        if (
          Math.abs(
            snapped - this.renderRotation
          ) < 0.001
        ) {
          this.renderRotation = snapped;
          this.rotation = snapped;
        }
      }

      return;
    }


    // --------------------------------------------------------
    // SHIP
    // --------------------------------------------------------
    if (this.type === EntityTypes.SHIP) {
      const cfg = this.config;

      const maxTilt =
        cfg.maxTilt || 30;

      const maxTiltRad =
        maxTilt * Math.PI / 180;

      const tilt =
        (this.velocityY / Physics.shipMaxVy) *
        maxTiltRad;

      this.rotation = clamp(
        tilt,
        -maxTiltRad,
        maxTiltRad
      );

      this.renderRotation +=
        (this.rotation - this.renderRotation) *
        Math.min(
          1,
          dt * Physics.rotationLerp
        );

      return;
    }


    // --------------------------------------------------------
    // BALL
    // --------------------------------------------------------
    //
    // Ball rolls when moving between surfaces.
    if (this.type === EntityTypes.BALL) {
      if (!this.isSupported) {
        const rollSpeed =
          Math.abs(this.velocityY) /
          Math.max(1, Physics.terminalVelocity);

        this.rotation +=
          (this.gravityDir > 0 ? 1 : -1) *
          (2.5 + rollSpeed * 3) *
          dt;
      } else {
        const step = Math.PI / 2;

        const snapped =
          Math.round(this.rotation / step) * step;

        this.renderRotation +=
          (snapped - this.renderRotation) *
          Math.min(
            1,
            dt * Physics.landSnapRate
          );

        this.rotation = this.renderRotation;
      }

      return;
    }


    // --------------------------------------------------------
    // Other modes
    // --------------------------------------------------------

    this.renderRotation +=
      (this.rotation - this.renderRotation) *
      Math.min(
        1,
        dt * Physics.rotationLerp
      );
  }


  // ==========================================================
  // World bounds
  // ==========================================================

  applyWorldBounds() {
    const half =
      (this.config.rotationHitbox || this.hitbox).h / 2;

    const groundLimit =
      this.world.groundY - half;

    const ceilingLimit =
      this.world.ceilingY + half;

    this.onGround = false;
    this.onCeiling = false;

    // Normal gravity / ground.
    if (this.y >= groundLimit) {
      this.y = groundLimit;

      if (this.velocityY > 0) {
        this.velocityY = 0;
      }

      this.onGround = true;
    }

    // Reverse gravity / ceiling.
    if (this.y <= ceilingLimit) {
      this.y = ceilingLimit;

      if (this.velocityY < 0) {
        this.velocityY = 0;
      }

      this.onCeiling = true;
    }
  }


  // ==========================================================
  // Mode abilities
  // ==========================================================

  jump() {
    const cfg = this.config;

    // UFO is allowed to jump while airborne.
    const canAirJump =
      this.type === EntityTypes.UFO;

    // Cube / Robot require a surface.
    if (!canAirJump && !this.isSupported) {
      return;
    }

    let power;

    if (this.type === EntityTypes.UFO) {
      power = Physics.ufoHop;
    } else {
      power = Physics.cubeJump;
    }

    this.velocityY =
      -power * this.gravityDir;

    // Cube rotation begins when the jump begins.
    if (this.type === EntityTypes.CUBE) {
      this.spinning = true;
      this.spinStart = this.rotation;
    }
  }


  // ==========================================================
  // Ball gravity
  // ==========================================================

  flipGravity() {
    this.gravityDir *= -1;

    // Ball switches direction immediately.
    //
    // Give it a small directional impulse so it leaves the old surface
    // instead of spending a frame visually stuck to it.
    this.velocityY =
      Physics.ballFlip * this.gravityDir;
  }


  // ==========================================================
  // Spider teleport
  // ==========================================================
  //
  // Geometry Dash 2.1 Spider behavior:
  //
  // Normal gravity:
  //     teleport to the nearest valid surface ABOVE
  //     and switch gravity upward.
  //
  // Reverse gravity:
  //     teleport to the nearest valid surface BELOW
  //     and switch gravity downward.
  //
  // It is NOT simply "pick whichever surface is closest".
  //
  // Fingerdash describes the Spider as instantly teleporting to the nearest
  // opposite solid surface and inverting gravity.
  // ==========================================================

  teleportToNearestSurface(solidObjects = null) {
    const half =
      (this.config.rotationHitbox || this.hitbox).h / 2;

    const groundLimit =
      this.world.groundY - half;

    const ceilingLimit =
      this.world.ceilingY + half;

    const goingUp =
      this.gravityDir === 1;

    let bestY = null;
    let bestDistance = Infinity;

    // --------------------------------------------------------
    // World boundary candidate
    // --------------------------------------------------------

    if (goingUp) {
      // Normal gravity -> Spider goes upward.
      const distance =
        Math.abs(this.y - ceilingLimit);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestY = ceilingLimit;
      }
    } else {
      // Reverse gravity -> Spider goes downward.
      const distance =
        Math.abs(groundLimit - this.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestY = groundLimit;
      }
    }


    // --------------------------------------------------------
    // Block / platform candidates
    // --------------------------------------------------------

    if (solidObjects) {
      for (const obj of solidObjects) {
        if (
          obj.type !== 'block' &&
          obj.type !== 'platform'
        ) {
          continue;
        }

        const centerX =
          obj.x + obj.w / 2;

        const horizontalDistance =
          Math.abs(this.x - centerX);

        // Spider teleport stays roughly aligned with the player's
        // horizontal position.
        if (
          horizontalDistance >
          Physics.spiderHorizontalTolerance
        ) {
          continue;
        }

        const top =
          obj.y - obj.h;

        const bottom =
          obj.y;

        if (goingUp) {
          // We need a surface ABOVE the spider.
          //
          // The player's centre will sit half a hitbox below the
          // block's top surface.
          const targetY =
            top - half;

          if (targetY >= this.y) {
            continue;
          }

          const distance =
            this.y - targetY;

          if (distance < bestDistance) {
            bestDistance = distance;
            bestY = targetY;
          }
        } else {
          // We need a surface BELOW the spider.
          //
          // The player's centre will sit half a hitbox above the
          // block's bottom surface.
          const targetY =
            bottom + half;

          if (targetY <= this.y) {
            continue;
          }

          const distance =
            targetY - this.y;

          if (distance < bestDistance) {
            bestDistance = distance;
            bestY = targetY;
          }
        }
      }
    }


    // --------------------------------------------------------
    // Teleport
    // --------------------------------------------------------

    if (bestY === null) {
      return;
    }

    this.y = bestY;

    // Spider switches gravity as part of the teleport.
    this.gravityDir *= -1;

    this.velocityY = 0;

    this.rotation = 0;
    this.renderRotation = 0;

    this.onGround = false;
    this.onCeiling = false;
    this.onSolid = false;
  }


  // ==========================================================
  // Gravity pads
  // ==========================================================

  applyGravityPad() {
    this.gravityDir *= -1;

    this.velocityY =
      Physics.ballFlip * this.gravityDir;
  }
}


// ============================================================
// Utility
// ============================================================

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}
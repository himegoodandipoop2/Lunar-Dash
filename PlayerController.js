// PlayerController.js
// Depends on EntityTypes and entityStore from Data.js — load Data.js first

class Player {
  constructor(startType = EntityTypes.CUBE) {
    this.type = startType;
    this.x = 0;
    this.y = 0;
    this.velocityY = 0;
    this.rotation = 0;
    this.isHolding = false; // tracks hold input state
  }

  get config() {
    return entityStore[this.type];
  }

  changeMode(newType) {
    this.type = newType;
    // reset anything that shouldn't carry over between modes
    this.rotation = 0;
  }

  handleInputDown() {
    const cfg = this.config;
    this.isHolding = true;

    if (cfg.flipGravityOnTap) {
      this.flipGravity();
    } else if (cfg.teleportOnTap) {
      this.teleportToNearestSurface();
    } else if (cfg.input === 'jump' || cfg.input === 'tap') {
      this.jump();
    }
  }

  handleInputUp() {
    this.isHolding = false;
  }

  update(deltaTime) {
    const cfg = this.config;

    if (cfg.gravity) {
      this.applyGravity(deltaTime);
    }

    if (cfg.input === 'hold' && this.isHolding) {
      this.applyHoldForce(cfg);
    }

    this.x += this.speed * deltaTime; // constant forward movement
    this.y += this.velocityY * deltaTime;
  }

  jump() {
    // Cube uses rotationStep (Math.PI / 2) to advance rotation on each jump
    if (this.type === EntityTypes.CUBE) {
      this.rotation += this.config.rotationStep;
    }
    // ...apply upward velocity here too
  }

  flipGravity() { /* ... */ }
  applyGravity(dt) { /* ... */ }

  applyHoldForce(cfg) {
    if (this.type === EntityTypes.WAVE) {
      // Wave moves along a fixed diagonal, using diagonalAngle (Math.PI / 4)
      const angle = this.isHolding ? -cfg.diagonalAngle : cfg.diagonalAngle;
      this.velocityY = Math.sin(angle) * this.speed;
    }
    // ...other hold-based modes (Ship, Robot) go here
  }

  teleportToNearestSurface() { /* ... */ }
}
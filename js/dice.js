// ============================================================
// Dice Renderer — Interactive 3D CSS Dice
// ============================================================

import { ANIM } from './config.js';

export class DiceRenderer {
  constructor(container) {
    this.container = container;
    this.cube = null;
    this.isRolling = false;
    this._build();
  }

  /** Build the 3D dice DOM structure */
  _build() {
    this.container.innerHTML = '';
    
    const scene = document.createElement('div');
    scene.className = 'dice-scene';

    this.cube = document.createElement('div');
    this.cube.className = 'dice-cube';

    // Create 6 faces with dot patterns
    const dotPatterns = {
      1: [4],                           // center
      2: [0, 8],                        // top-left, bottom-right
      3: [0, 4, 8],                     // diagonal
      4: [0, 2, 6, 8],                  // corners
      5: [0, 2, 4, 6, 8],              // corners + center
      6: [0, 2, 3, 5, 6, 8]            // 3x2 grid
    };

    for (let face = 1; face <= 6; face++) {
      const faceEl = document.createElement('div');
      faceEl.className = `dice-face dice-face-${face}`;
      
      // Create 9-cell grid for dot placement
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'dice-dot-cell';
        if (dotPatterns[face].includes(i)) {
          const dot = document.createElement('div');
          dot.className = 'dice-dot';
          cell.appendChild(dot);
        }
        faceEl.appendChild(cell);
      }

      this.cube.appendChild(faceEl);
    }

    scene.appendChild(this.cube);
    this.container.appendChild(scene);
  }

  /**
   * Animate a dice roll and land on the given value.
   * Returns a Promise that resolves when animation completes.
   */
  roll(value) {
    return new Promise(resolve => {
      if (this.isRolling) { resolve(); return; }
      this.isRolling = true;

      this.cube.dataset.face = '';

      this.currentX = this.currentX || 0;
      this.currentY = this.currentY || 0;
      this.currentZ = this.currentZ || 0;

      // Determine final rotation for the target face
      const rotations = {
        1: { x: 0, y: 0 },
        2: { x: 0, y: 90 },
        3: { x: -90, y: 0 },
        4: { x: 90, y: 0 },
        5: { x: 0, y: -90 },
        6: { x: 0, y: 180 }
      };

      const targetRot = rotations[value];
      const minSpins = 720; // At least 2 full spins for realistic roll duration

      let nextX = this.currentX + minSpins;
      nextX = Math.ceil(nextX / 360) * 360 + targetRot.x;

      let nextY = this.currentY + minSpins;
      nextY = Math.ceil(nextY / 360) * 360 + targetRot.y;

      const spinsZ = (Math.floor(Math.random() * 2) + 2) * 360;
      let nextZ = this.currentZ + spinsZ;

      this.currentX = nextX;
      this.currentY = nextY;
      this.currentZ = nextZ;

      // Apply transition and transform dynamically for perfect smooth rotation flow
      this.cube.style.transition = `transform ${ANIM.DICE_ROLL}ms cubic-bezier(0.2, 0.8, 0.2, 1.15)`;
      this.cube.style.transform = `rotateX(${this.currentX}deg) rotateY(${this.currentY}deg) rotateZ(${this.currentZ}deg)`;

      // Resolve after animation completes
      setTimeout(() => {
        this.cube.dataset.face = value;
        this.isRolling = false;
        resolve();
      }, ANIM.DICE_ROLL + 80);
    });
  }

  /** Reset dice to neutral position */
  reset() {
    this.cube.style.transition = 'none';
    this.cube.style.transform = 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
    this.cube.dataset.face = '1';
    this.currentX = 0;
    this.currentY = 0;
    this.currentZ = 0;
    this.isRolling = false;
  }

  /** Add a shake/wobble effect */
  shake() {
    this.cube.classList.add('dice-shake');
    setTimeout(() => this.cube.classList.remove('dice-shake'), 500);
  }
}

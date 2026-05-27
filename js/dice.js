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

      // Add rolling animation class
      this.cube.classList.add('rolling');
      this.cube.dataset.face = '';

      // Determine final rotation for the target face
      const rotations = {
        1: { x: 0, y: 0 },
        2: { x: 0, y: 90 },
        3: { x: -90, y: 0 },
        4: { x: 90, y: 0 },
        5: { x: 0, y: -90 },
        6: { x: 0, y: 180 }
      };

      // Add extra spins (reduced for speed)
      const spinsX = (Math.floor(Math.random() * 2) + 1) * 360;
      const spinsY = (Math.floor(Math.random() * 2) + 1) * 360;
      const rot = rotations[value];
      const finalX = spinsX + rot.x;
      const finalY = spinsY + rot.y;

      const spinDuration = 800; // Let it spin/tumble for 800ms

      // Apply the landing roll after the rolling spin duration
      setTimeout(() => {
        this.cube.classList.remove('rolling');
        this.cube.style.transition = `transform ${ANIM.DICE_ROLL}ms cubic-bezier(0.25, 0.8, 0.25, 1)`;
        this.cube.style.transform = `rotateX(${finalX}deg) rotateY(${finalY}deg)`;
      }, spinDuration);
 
      // Resolve after entire roll animation finishes
      setTimeout(() => {
        this.cube.dataset.face = value;
        this.isRolling = false;
        // Cleanup transition for next roll
        setTimeout(() => {
          this.cube.style.transition = 'none';
        }, 50);
        resolve();
      }, spinDuration + ANIM.DICE_ROLL + 80);
    });
  }

  /** Reset dice to neutral position */
  reset() {
    this.cube.style.transition = 'none';
    this.cube.style.transform = 'rotateX(0deg) rotateY(0deg)';
    this.cube.dataset.face = '1';
    this.isRolling = false;
  }

  /** Add a shake/wobble effect */
  shake() {
    this.cube.classList.add('dice-shake');
    setTimeout(() => this.cube.classList.remove('dice-shake'), 500);
  }
}

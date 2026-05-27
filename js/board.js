// ============================================================
// Board Renderer — DOM-based 10x10 Board with SVG Snakes/Ladders
// ============================================================

import { BOARD_SIZE, TOTAL_TILES, SNAKES, LADDERS, TILE_COLORS } from './config.js';

export class BoardRenderer {
  constructor(container) {
    this.container = container;
    this.tileElements = {};
    this.pawnElements = {};
    this.svgOverlay = null;
    this.boardRect = null;
    this.tileSize = 0;
  }

  /** Build the entire board DOM */
  render() {
    this.container.innerHTML = '';
    this.container.classList.add('game-board');

    // Clean up existing dynamic elements in the board wrapper to prevent duplicates
    const parent = this.container.parentElement;
    if (parent) {
      const oldLayer = parent.querySelector('#pawn-layer');
      if (oldLayer) oldLayer.remove();
      const oldStart = parent.querySelector('.board-start-zone');
      if (oldStart) oldStart.remove();
    }

    // Create tile grid
    const grid = document.createElement('div');
    grid.className = 'board-grid';
    
    // Build tiles from top row (91-100) to bottom row (1-10)
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const tileNum = this._gridToTile(row, col);
        const tile = document.createElement('div');
        tile.className = 'board-tile';
        tile.dataset.tile = tileNum;
        
        // Alternating colors based on tile number
        const colorIndex = (tileNum - 1) % TILE_COLORS.length;
        tile.style.backgroundColor = TILE_COLORS[colorIndex];

        // Snake/ladder indicator
        if (SNAKES[tileNum]) {
          tile.classList.add('snake-tile');
        }
        if (LADDERS[tileNum]) {
          tile.classList.add('ladder-tile');
        }

        // Tile number label
        const label = document.createElement('span');
        label.className = 'tile-label';
        label.textContent = tileNum;
        tile.appendChild(label);

        // No small emoji icons to keep grid clean, as big SVG overlay already draws snakes and ladders

        grid.appendChild(tile);
        this.tileElements[tileNum] = tile;
      }
    }
    
    this.container.appendChild(grid);

    // Create SVG overlay for snakes and ladders
    this._createSVGOverlay();
    
    // Pawn container (absolutely positioned over the board)
    const pawnLayer = document.createElement('div');
    pawnLayer.className = 'pawn-layer';
    pawnLayer.id = 'pawn-layer';
    
    // Create a beautiful start zone tag
    const startZone = document.createElement('div');
    startZone.className = 'board-start-zone';

    // Append both to parent container if available (prevents clipping by board overflow: hidden)
    const boardWrapper = this.container.parentElement;
    if (boardWrapper) {
      boardWrapper.appendChild(pawnLayer);
      boardWrapper.appendChild(startZone);
    } else {
      this.container.appendChild(pawnLayer);
    }

    // Calculate tile size after rendering
    requestAnimationFrame(() => {
      this._updateDimensions();
      this._drawSnakesAndLadders();
    });
  }

  /** Update dimensions on resize */
  _updateDimensions() {
    this.boardRect = this.container.getBoundingClientRect();
    const firstTile = this.tileElements[1];
    if (firstTile) {
      this.tileSize = firstTile.getBoundingClientRect().width;
    }
  }

  /** Get the center pixel position of a tile relative to the board */
  getTilePosition(tileNum) {
    if (tileNum <= 0) {
      // Off-board position (below the board)
      return { x: this.tileSize / 2, y: this.boardRect?.height + 30 || 600 };
    }
    const tile = this.tileElements[tileNum];
    if (!tile) return { x: 0, y: 0 };
    const tileRect = tile.getBoundingClientRect();
    const boardRect = this.container.getBoundingClientRect();
    return {
      x: tileRect.left - boardRect.left + tileRect.width / 2,
      y: tileRect.top - boardRect.top + tileRect.height / 2
    };
  }

  /** Convert grid row/col to tile number */
  _gridToTile(row, col) {
    if (row % 2 === 0) {
      return row * BOARD_SIZE + col + 1;        // left to right
    } else {
      return row * BOARD_SIZE + (BOARD_SIZE - col); // right to left
    }
  }

  /** Create pawn elements for all players */
  createPawns(players) {
    const pawnLayer = document.getElementById('pawn-layer');
    if (!pawnLayer) return;
    pawnLayer.innerHTML = '';
    this.pawnElements = {};

    players.forEach((player, index) => {
      const pawn = document.createElement('div');
      pawn.className = 'pawn';
      pawn.id = `pawn-${player.id}`;
      pawn.style.setProperty('--pawn-color', player.color.hex);
      pawn.style.setProperty('--pawn-light', player.color.light);
      pawn.textContent = player.name.charAt(0).toUpperCase();
      pawn.dataset.playerIndex = index;
      pawn.title = player.name;

      // Start off-board (spaced beautifully over the START zone)
      const boardHeight = this.boardRect?.height || 500;
      pawn.style.left = `${30 + index * 24}px`;
      pawn.style.top = `${boardHeight + 20}px`;
      pawn.style.opacity = '1';

      pawnLayer.appendChild(pawn);
      this.pawnElements[player.id] = pawn;
    });
  }

  /** Update all pawn positions to match game state */
  updatePawnPositions(players) {
    players.forEach(player => {
      const pawn = this.pawnElements[player.id];
      if (!pawn) return;

      if (player.position <= 0) {
        // Off board (placed in a nice visual start zone at the bottom-left)
        const idx = parseInt(pawn.dataset.playerIndex);
        const boardHeight = this.boardRect?.height || 500;
        
        // Space them beautifully: center over the START tag (which is at left: 20px, bottom: -32px)
        pawn.style.left = `${30 + idx * 24}px`;
        pawn.style.top = `${boardHeight + 20}px`;
        pawn.style.opacity = '1';
        return;
      }

      const pos = this.getTilePosition(player.position);
      // Offset pawns slightly so they don't overlap
      const idx = parseInt(pawn.dataset.playerIndex);
      const offsetX = ((idx % 2) * 2 - 1) * (this.tileSize * 0.15);
      const offsetY = (Math.floor(idx / 2) * 2 - 1) * (this.tileSize * 0.15);

      pawn.style.left = `${pos.x + offsetX}px`;
      pawn.style.top = `${pos.y + offsetY}px`;
    });
  }

  /** Get a pawn DOM element by player ID */
  getPawnElement(playerId) {
    return this.pawnElements[playerId];
  }

  /** Highlight the active player's tile */
  highlightTile(tileNum, highlight = true) {
    Object.values(this.tileElements).forEach(t => t.classList.remove('highlight'));
    if (highlight && this.tileElements[tileNum]) {
      this.tileElements[tileNum].classList.add('highlight');
    }
  }

  /** Create SVG overlay element */
  _createSVGOverlay() {
    this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgOverlay.classList.add('board-svg-overlay');
    this.svgOverlay.setAttribute('preserveAspectRatio', 'none');
    this.container.appendChild(this.svgOverlay);
  }

  /** Draw all snakes and ladders as SVG paths */
  _drawSnakesAndLadders() {
    if (!this.svgOverlay) return;
    this.svgOverlay.innerHTML = '';
    const rect = this.container.getBoundingClientRect();
    this.svgOverlay.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.svgOverlay.setAttribute('width', rect.width);
    this.svgOverlay.setAttribute('height', rect.height);

    // Draw ladders first (behind snakes)
    Object.entries(LADDERS).forEach(([from, to]) => {
      this._drawLadder(parseInt(from), to);
    });

    // Draw snakes
    Object.entries(SNAKES).forEach(([from, to]) => {
      this._drawSnake(parseInt(from), to);
    });
  }

  /** Draw a single snake SVG */
  _drawSnake(headTile, tailTile) {
    const head = this.getTilePosition(headTile);
    const tail = this.getTilePosition(tailTile);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('snake-svg');

    const isMobile = window.innerWidth < 1024;
    const bodyStroke = isMobile ? '3.5' : '6';
    const outlineStroke = isMobile ? '5' : '8';
    const headR = isMobile ? '5' : '8';
    const tongueOffset = isMobile ? 3.5 : 6;
    const tongueLength = isMobile ? 3 : 5;
    const eyeSize = isMobile ? '1.2' : '2';
    const pupilSize = isMobile ? '0.6' : '1';
    const eyeDists = isMobile ? [[-2, -2], [2, -2]] : [[-3, -3], [3, -3]];

    // Curvy snake body path
    let midX = (head.x + tail.x) / 2 + (Math.random() - 0.5) * 40;
    let midY = (head.y + tail.y) / 2;

    // Explicit bend to avoid tile 56 for the long snake from 87 to 24
    if (headTile === 87 && tailTile === 24) {
      midX = (head.x + tail.x) / 2 - 70; // Pull the curve strongly to the left to bypass 56
    }

    const cp1x = head.x + (midX - head.x) * 0.5 + 30;
    const cp1y = head.y + (midY - head.y) * 0.3;
    const cp2x = midX - 30;
    const cp2y = midY;
    const cp3x = midX + 30;
    const cp3y = midY;
    const cp4x = tail.x + (midX - tail.x) * 0.5 - 30;
    const cp4y = tail.y - (tail.y - midY) * 0.3;

    // Body path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${head.x} ${head.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${midX} ${midY} S ${cp4x} ${cp4y}, ${tail.x} ${tail.y}`);
    path.setAttribute('stroke', '#4CAF50');
    path.setAttribute('stroke-width', bodyStroke);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', '0.7');
    group.appendChild(path);

    // Snake body pattern (darker outline)
    const pathOuter = path.cloneNode();
    pathOuter.setAttribute('stroke', '#2E7D32');
    pathOuter.setAttribute('stroke-width', outlineStroke);
    pathOuter.setAttribute('opacity', '0.3');
    group.insertBefore(pathOuter, path);

    // Head circle
    const headCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    headCircle.setAttribute('cx', head.x);
    headCircle.setAttribute('cy', head.y);
    headCircle.setAttribute('r', headR);
    headCircle.setAttribute('fill', '#4CAF50');
    headCircle.setAttribute('stroke', '#2E7D32');
    headCircle.setAttribute('stroke-width', '2');
    group.appendChild(headCircle);

    // Eyes
    const eyeOffsets = eyeDists;
    eyeOffsets.forEach(([ox, oy]) => {
      const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      eye.setAttribute('cx', head.x + ox);
      eye.setAttribute('cy', head.y + oy);
      eye.setAttribute('r', eyeSize);
      eye.setAttribute('fill', 'white');
      group.appendChild(eye);
      const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      pupil.setAttribute('cx', head.x + ox);
      pupil.setAttribute('cy', head.y + oy + (isMobile ? 0.3 : 0.5));
      pupil.setAttribute('r', pupilSize);
      pupil.setAttribute('fill', '#333');
      group.appendChild(pupil);
    });

    // Tongue
    const tongue = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tongue.setAttribute('d', `M ${head.x} ${head.y + tongueOffset} l -${tongueLength} ${tongueLength} M ${head.x} ${head.y + tongueOffset} l ${tongueLength} ${tongueLength}`);
    tongue.setAttribute('stroke', '#E53935');
    tongue.setAttribute('stroke-width', isMobile ? '1' : '1.5');
    tongue.setAttribute('fill', 'none');
    group.appendChild(tongue);

    this.svgOverlay.appendChild(group);
  }

  /** Draw a single ladder SVG */
  _drawLadder(bottomTile, topTile) {
    const bottom = this.getTilePosition(bottomTile);
    const top = this.getTilePosition(topTile);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('ladder-svg');

    const isMobile = window.innerWidth < 1024;
    const width = isMobile ? 8 : 14;
    const railStroke = isMobile ? '2.5' : '4';
    const rungStroke = isMobile ? '1.8' : '3';
    const rungSpacing = isMobile ? 18 : 30;

    const dx = top.x - bottom.x;
    const dy = top.y - bottom.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / length * width; // perpendicular normal
    const ny = dx / length * width;

    // Left rail
    const leftRail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leftRail.setAttribute('x1', bottom.x + nx);
    leftRail.setAttribute('y1', bottom.y + ny);
    leftRail.setAttribute('x2', top.x + nx);
    leftRail.setAttribute('y2', top.y + ny);
    leftRail.setAttribute('stroke', '#8D6E63');
    leftRail.setAttribute('stroke-width', railStroke);
    leftRail.setAttribute('stroke-linecap', 'round');
    leftRail.setAttribute('opacity', '0.8');
    group.appendChild(leftRail);

    // Right rail
    const rightRail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    rightRail.setAttribute('x1', bottom.x - nx);
    rightRail.setAttribute('y1', bottom.y - ny);
    rightRail.setAttribute('x2', top.x - nx);
    rightRail.setAttribute('y2', top.y - ny);
    rightRail.setAttribute('stroke', '#8D6E63');
    rightRail.setAttribute('stroke-width', railStroke);
    rightRail.setAttribute('stroke-linecap', 'round');
    rightRail.setAttribute('opacity', '0.8');
    group.appendChild(rightRail);

    // Rungs
    const rungCount = Math.max(3, Math.floor(length / rungSpacing));
    for (let i = 1; i < rungCount; i++) {
      const t = i / rungCount;
      const rx = bottom.x + dx * t;
      const ry = bottom.y + dy * t;
      const rung = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rung.setAttribute('x1', rx + nx);
      rung.setAttribute('y1', ry + ny);
      rung.setAttribute('x2', rx - nx);
      rung.setAttribute('y2', ry - ny);
      rung.setAttribute('stroke', '#A1887F');
      rung.setAttribute('stroke-width', rungStroke);
      rung.setAttribute('stroke-linecap', 'round');
      rung.setAttribute('opacity', '0.7');
      group.appendChild(rung);
    }

    this.svgOverlay.appendChild(group);
  }

  /** Redraw on window resize */
  handleResize() {
    this._updateDimensions();
    this._drawSnakesAndLadders();
  }
}

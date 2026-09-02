/**
 * Classic N x N sliding puzzle over a single captured image. Tiles are
 * DOM divs positioned by CSS grid, each showing a slice of the source
 * image via background-position (so no per-tile canvas is needed).
 * The blank is always the last index; scrambling is done by replaying
 * random legal slides from the solved state, which guarantees the
 * result is always solvable (no parity checking needed).
 */
class SlidingPuzzle {
  /**
   * @param {HTMLElement} gridEl
   * @param {string} imageDataUrl
   * @param {number} size grid dimension (3 or 4)
   * @param {() => void} onSolved
   */
  constructor(gridEl, imageDataUrl, size, onSolved) {
    this.gridEl = gridEl;
    this.imageDataUrl = imageDataUrl;
    this.size = size;
    this.onSolved = onSolved;
    this.tileCount = size * size;
    this.blankIndex = this.tileCount - 1;

    // order[gridPosition] = homeTileIndex (homeTileIndex === tileCount-1 is blank)
    this.order = Array.from({ length: this.tileCount }, (_, i) => i);

    this._buildDom();
    this._scramble();
    this._render();
  }

  _buildDom() {
    this.gridEl.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
    this.gridEl.style.gridTemplateRows = `repeat(${this.size}, 1fr)`;
    this.gridEl.innerHTML = '';
    this.tileEls = this.order.map((homeIndex) => {
      const el = document.createElement('div');
      el.className = 'puzzle-tile';
      this.gridEl.appendChild(el);
      return el;
    });
  }

  _scramble() {
    const shuffleMoves = this.tileCount * this.tileCount * 8;
    let blankPos = this.blankIndex;
    for (let i = 0; i < shuffleMoves; i++) {
      const neighbors = this._neighborsOf(blankPos);
      const swapWith = neighbors[Math.floor(Math.random() * neighbors.length)];
      [this.order[blankPos], this.order[swapWith]] = [this.order[swapWith], this.order[blankPos]];
      blankPos = swapWith;
    }
    this.blankPos = blankPos;

    // Extremely unlikely, but guard against an accidental solved scramble.
    if (this._isSolved()) this._scramble();
  }

  _neighborsOf(pos) {
    const row = Math.floor(pos / this.size);
    const col = pos % this.size;
    const result = [];
    if (row > 0) result.push(pos - this.size);
    if (row < this.size - 1) result.push(pos + this.size);
    if (col > 0) result.push(pos - 1);
    if (col < this.size - 1) result.push(pos + 1);
    return result;
  }

  _isSolved() {
    return this.order.every((homeIndex, pos) => homeIndex === pos);
  }

  _render() {
    this.order.forEach((homeIndex, pos) => {
      const el = this.tileEls[pos];
      const isBlank = homeIndex === this.blankIndex;
      el.classList.toggle('blank', isBlank);
      if (isBlank) {
        el.style.backgroundImage = 'none';
      } else {
        const row = Math.floor(homeIndex / this.size);
        const col = homeIndex % this.size;
        el.style.backgroundImage = `url(${this.imageDataUrl})`;
        el.style.backgroundSize = `${this.size * 100}% ${this.size * 100}%`;
        el.style.backgroundPosition = `${col * (100 / (this.size - 1))}% ${row * (100 / (this.size - 1))}%`;
      }
      el.dataset.pos = pos;
    });
  }

  /** Returns the grid position index under a pixel point, or -1. */
  hitTest(px, py) {
    const rect = this.gridEl.getBoundingClientRect();
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) return -1;
    const col = Math.floor(((px - rect.left) / rect.width) * this.size);
    const row = Math.floor(((py - rect.top) / rect.height) * this.size);
    return row * this.size + col;
  }

  clearHoverTarget() {
    this.tileEls.forEach((el) => el.classList.remove('hover-target'));
  }

  setHoverTarget(pos) {
    this.clearHoverTarget();
    if (pos >= 0 && this._neighborsOf(this.blankPos).includes(pos)) {
      this.tileEls[pos].classList.add('hover-target');
      return true;
    }
    return false;
  }

  /** Attempts to slide the tile at grid position `pos` into the blank. Returns true if moved. */
  trySlide(pos) {
    if (!this._neighborsOf(this.blankPos).includes(pos)) return false;
    [this.order[this.blankPos], this.order[pos]] = [this.order[pos], this.order[this.blankPos]];
    this.blankPos = pos;
    this._render();
    if (this._isSolved()) this.onSolved();
    return true;
  }
}

function neighborsOf(pos, size) {
  const row = Math.floor(pos / size);
  const col = pos % size;
  const result = [];
  if (row > 0) result.push(pos - size);
  if (row < size - 1) result.push(pos + size);
  if (col > 0) result.push(pos - 1);
  if (col < size - 1) result.push(pos + 1);
  return result;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Sliding puzzle over a captured image, rendered directly onto a canvas
 * region. `order[gridPos] = tileValue` (0 = blank). Dragging is expressed
 * as a single scalar `progress` (0..1) along the fixed axis from the
 * dragged tile toward the blank — sliding puzzles only ever move one cell
 * in one direction, so the caller (gesture or mouse) only needs to report
 * how far along that axis the pointer has traveled.
 */
export class SlidingPuzzle {
  constructor(size, image) {
    this.size = size;
    this.image = image;
    this.total = size * size;
    this.order = Array.from({ length: this.total }, (_, i) => i + 1);
    this.order[this.total - 1] = 0;
    this.drag = null; // { pos, empty, axis: 'x'|'y', dir: 1|-1, progress }
    this.shuffle();
  }

  shuffle() {
    for (let i = 0; i < this.total * this.total * 25; i++) {
      const empty = this.order.indexOf(0);
      const options = neighborsOf(empty, this.size);
      const pick = options[Math.floor(Math.random() * options.length)];
      [this.order[empty], this.order[pick]] = [this.order[pick], this.order[empty]];
    }
    if (this.isSolved()) this.shuffle();
  }

  isSolved() {
    return this.order.every((tile, i) => tile === (i === this.total - 1 ? 0 : i + 1));
  }

  countCorrectlyPlaced() {
    return this.order.filter((tile, i) => tile !== 0 && tile === i + 1).length;
  }

  /** Grid position under a point given as fractions [0,1] of the puzzle box. */
  positionAt(fx, fy) {
    const col = clamp(Math.floor(fx * this.size), 0, this.size - 1);
    const row = clamp(Math.floor(fy * this.size), 0, this.size - 1);
    return row * this.size + col;
  }

  isAdjacentToEmpty(pos) {
    return neighborsOf(this.order.indexOf(0), this.size).includes(pos);
  }

  /** Starts lifting the tile at `pos` if it's a legal move (adjacent to blank). */
  beginDrag(pos) {
    if (this.drag) return false;
    const empty = this.order.indexOf(0);
    if (!neighborsOf(empty, this.size).includes(pos)) return false;
    const row = Math.floor(pos / this.size);
    const col = pos % this.size;
    const emptyRow = Math.floor(empty / this.size);
    const emptyCol = empty % this.size;
    const axis = row === emptyRow ? "x" : "y";
    const dir = axis === "x" ? Math.sign(emptyCol - col) : Math.sign(emptyRow - row);
    this.drag = { pos, empty, axis, dir, progress: 0 };
    return true;
  }

  /** Feeds how far (in cells, signed toward the blank) the pointer has moved. */
  updateDrag(cellsTowardEmpty) {
    if (!this.drag) return;
    this.drag.progress = clamp(cellsTowardEmpty, 0, 1);
  }

  /** Commits the slide if dragged > 40% of the way, else snaps back. */
  endDrag() {
    if (!this.drag) return { moved: false };
    const { pos, empty, progress } = this.drag;
    this.drag = null;
    if (progress > 0.4) {
      [this.order[pos], this.order[empty]] = [this.order[empty], this.order[pos]];
      return { moved: true };
    }
    return { moved: false };
  }

  cancelDrag() {
    this.drag = null;
  }

  /** Draws the puzzle inside `rect` (canvas pixel {x,y,w,h}) on `ctx`. */
  render(ctx, rect) {
    const { x, y, w, h } = rect;
    const cellW = w / this.size;
    const cellH = h / this.size;
    const srcCell = this.image.width / this.size;

    for (let pos = 0; pos < this.total; pos++) {
      const tile = this.order[pos];
      const row = Math.floor(pos / this.size);
      const col = pos % this.size;
      let dx = x + col * cellW;
      let dy = y + row * cellH;

      if (this.drag && this.drag.pos === pos) {
        const offset = this.drag.progress * (this.drag.axis === "x" ? cellW : cellH) * this.drag.dir;
        if (this.drag.axis === "x") dx += offset;
        else dy += offset;
      }

      if (tile === 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(dx, dy, cellW, cellH);
        continue;
      }

      const tileRow = Math.floor((tile - 1) / this.size);
      const tileCol = (tile - 1) % this.size;
      ctx.drawImage(
        this.image,
        tileCol * srcCell, tileRow * srcCell, srcCell, srcCell,
        dx, dy, cellW, cellH,
      );

      if (this.drag && this.drag.pos === pos) {
        ctx.save();
        ctx.strokeStyle = "#f5c518";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 10;
        ctx.strokeRect(dx + 1.5, dy + 1.5, cellW - 3, cellH - 3);
        ctx.restore();
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (let i = 1; i < this.size; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * cellW, y);
      ctx.lineTo(x + i * cellW, y + h);
      ctx.moveTo(x, y + i * cellH);
      ctx.lineTo(x + w, y + i * cellH);
      ctx.stroke();
    }
  }
}

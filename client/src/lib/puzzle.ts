/**
 * Sliding puzzle helpers over a flat tile array. Tile value 0 means blank;
 * any other value N sits at its solved position N-1. Shuffling replays
 * random legal slides starting from the solved state, which guarantees
 * the result is always solvable (no parity checking needed).
 */
export function shufflePuzzle(size: number): number[] {
  const total = size * size;
  const solved = Array.from({ length: total }, (_, index) => index + 1);
  solved[total - 1] = 0;
  const next = [...solved];
  for (let i = 0; i < size * size * 20; i += 1) {
    const empty = next.indexOf(0);
    const choice = neighborsOf(empty, size)[Math.floor(Math.random() * neighborsOf(empty, size).length)];
    [next[empty], next[choice]] = [next[choice], next[empty]];
  }
  return isSolved(next) ? shufflePuzzle(size) : next;
}

export function isSolved(tiles: number[]): boolean {
  return tiles.every((tile, index) => tile === (index === tiles.length - 1 ? 0 : index + 1));
}

export function neighborsOf(pos: number, size: number): number[] {
  const row = Math.floor(pos / size);
  const col = pos % size;
  const result: number[] = [];
  if (row > 0) result.push(pos - size);
  if (row < size - 1) result.push(pos + size);
  if (col > 0) result.push(pos - 1);
  if (col < size - 1) result.push(pos + 1);
  return result;
}

/** Returns the new tile array if sliding the tile at `index` into the blank is legal, else null. */
export function slideTile(tiles: number[], size: number, index: number): number[] | null {
  const empty = tiles.indexOf(0);
  if (!neighborsOf(empty, size).includes(index)) return null;
  const next = [...tiles];
  [next[index], next[empty]] = [next[empty], next[index]];
  return next;
}

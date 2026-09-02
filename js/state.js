/**
 * Central app state, shared across modules via the global `AppState` object.
 * Kept as a plain object (not a class) since there is only ever one instance.
 */
const AppState = {
  config: {
    gridSize: 3,
    layoutCount: 2,
    filter: 'original',
  },
  photos: [],      // array of { dataUrl, image } captured this session
  currentRound: 0,
  strip: {
    frameColor: '#ffffff',
    memoryText: '',
    stickers: [],  // { id, emoji, xPct, yPct, sizePct }
  },
};

function resetSessionState() {
  AppState.photos = [];
  AppState.currentRound = 0;
  AppState.strip.stickers = [];
  AppState.strip.memoryText = '';
}

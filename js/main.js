/**
 * App entry point: wires the setup form, switches between the four
 * screens, and starts/stops the camera-dependent screen as needed so
 * the webcam isn't left running once the user has moved on.
 */
(function main() {
  const screens = {
    setup: document.getElementById('screen-setup'),
    puzzle: document.getElementById('screen-puzzle'),
    loading: document.getElementById('screen-loading'),
    strip: document.getElementById('screen-strip'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('active-screen'));
    screens[name].classList.add('active-screen');
  }

  function wireOptionGroup(selector, stateKey, coerce) {
    const group = document.querySelector(`[data-group="${selector}"]`);
    const buttons = group.querySelectorAll('button');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        AppState.config[stateKey] = coerce ? coerce(btn.dataset.value) : btn.dataset.value;
      });
    });
  }

  function initSetupForm() {
    wireOptionGroup('gridSize', 'gridSize', Number);
    wireOptionGroup('layout', 'layoutCount', Number);
    wireOptionGroup('filter', 'filter');

    // Pre-select the defaults declared in AppState so the UI and state agree.
    document.querySelector(`[data-group="gridSize"] [data-value="${AppState.config.gridSize}"]`)?.classList.add('selected');
    document.querySelector(`[data-group="layout"] [data-value="${AppState.config.layoutCount}"]`)?.classList.add('selected');
    document.querySelector(`[data-group="filter"] [data-value="${AppState.config.filter}"]`)?.classList.add('selected');

    const form = document.getElementById('setup-form');
    const errorEl = document.getElementById('setup-error');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        errorEl.textContent = 'Browser ini tidak mendukung akses kamera.';
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');
      showScreen('puzzle');
      PuzzleScreen.startPuzzleScreen();
    });
  }

  function initRestartButton() {
    document.getElementById('restart-btn').addEventListener('click', () => {
      resetSessionState();
      showScreen('setup');
    });
  }

  document.addEventListener('scrapbook:all-rounds-done', () => {
    PuzzleScreen.stopPuzzleScreen();
    showScreen('loading');
    setTimeout(() => {
      showScreen('strip');
      PhotoBooth.enterScreen();
    }, 1500);
  });

  PuzzleScreen.init();
  PhotoBooth.init();
  initSetupForm();
  initRestartButton();
  showScreen('setup');
})();

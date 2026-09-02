const STORAGE_KEY = "scrapbook-puzzle-archive";

function readArchive() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeArchive(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function saveStripToArchive(dataUrl) {
  const items = readArchive();
  items.unshift({ id: crypto.randomUUID?.() ?? String(Date.now()), dataUrl, createdAt: Date.now() });
  if (!writeArchive(items)) {
    // Storage full (base64 PNGs are large) — drop the oldest entries and retry once.
    writeArchive(items.slice(0, Math.max(1, items.length - 3)));
  }
}

function deleteFromArchive(id) {
  writeArchive(readArchive().filter((item) => item.id !== id));
}

export function renderArchivePage() {
  const grid = document.getElementById("archiveGrid");
  const empty = document.getElementById("archiveEmpty");
  const items = readArchive();

  empty.classList.toggle("hidden", items.length > 0);
  grid.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "archive-item";
    card.innerHTML = `
      <img src="${item.dataUrl}" alt="Saved photostrip" />
      <div class="archive-item-actions">
        <a href="${item.dataUrl}" download="scrapbook-strip.png"><span class="material-symbols-outlined">download</span></a>
        <button type="button" aria-label="Delete"><span class="material-symbols-outlined">delete</span></button>
      </div>`;
    card.querySelector("button").addEventListener("click", () => {
      deleteFromArchive(item.id);
      renderArchivePage();
    });
    grid.appendChild(card);
  });
}

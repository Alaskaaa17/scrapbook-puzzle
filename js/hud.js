const STATUS_TEXT = {
  waiting: "MENUNGGU TANGAN...",
  detected: "TANGAN TERDETEKSI",
  countdown: "MENGHITUNG MUNDUR...",
  puzzle: "SUSUN PUZZLE MENGGUNAKAN GESTUR PINCH",
  solved: "PUZZLE SELESAI! KEPALKAN TANGAN UNTUK MENYIMPAN",
  saving: "SAVING",
};

const STATUS_DOT_CLASS = {
  waiting: "",
  detected: "green",
  countdown: "yellow",
  puzzle: "green",
  solved: "green",
  saving: "green",
};

export class Hud {
  constructor() {
    this.statusText = document.getElementById("statusText");
    this.statusDot = document.getElementById("statusDot");
    this.photoCounter = document.getElementById("photoCounter");
    this.thumbStrip = document.getElementById("thumbStrip");
    this.solvedCard = document.getElementById("solvedCard");
    this.errorBox = document.getElementById("cameraErrorBox");
  }

  setStatus(key) {
    this.statusText.textContent = STATUS_TEXT[key] ?? "";
    this.statusDot.className = `status-dot ${STATUS_DOT_CLASS[key] ?? ""}`.trim();
  }

  setCounter(done, total) {
    this.photoCounter.textContent = `${done} / ${total}`;
  }

  setThumbnails(photos) {
    this.thumbStrip.innerHTML = "";
    photos.forEach((dataUrl) => {
      const img = document.createElement("img");
      img.src = dataUrl;
      this.thumbStrip.appendChild(img);
    });
  }

  showSolvedCard(show) {
    this.solvedCard.classList.toggle("hidden", !show);
  }

  showError(message) {
    this.errorBox.textContent = message;
    this.errorBox.classList.remove("hidden");
  }

  hideError() {
    this.errorBox.classList.add("hidden");
  }

  reset() {
    this.setStatus("waiting");
    this.showSolvedCard(false);
    this.hideError();
    this.thumbStrip.innerHTML = "";
  }
}

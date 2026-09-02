import { CameraController } from "./camera.js";
import { Editor } from "./editor.js";
import { renderArchivePage } from "./archive.js";

const pages = {
  landing: document.getElementById("landingPage"),
  setup: document.getElementById("setupPage"),
  camera: document.getElementById("cameraPage"),
  printing: document.getElementById("printingPage"),
  editor: document.getElementById("editorPage"),
  howItWorks: document.getElementById("howItWorksPage"),
  features: document.getElementById("featuresPage"),
  archive: document.getElementById("archivePage"),
  contact: document.getElementById("contactPage"),
};

const config = { gridSize: 3, totalPhotos: 3, filterKey: "original" };
const camera = new CameraController();
const editor = new Editor();

function showPage(name) {
  if (pages.camera.classList.contains("active-page") && name !== "camera") {
    camera.stop();
  }
  Object.values(pages).forEach((el) => el.classList.remove("active-page"));
  pages[name].classList.add("active-page");
  if (name === "archive") renderArchivePage();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function wireOptionGroup(selector, key, coerce) {
  const group = document.querySelector(`[data-group="${selector}"]`);
  const buttons = group.querySelectorAll("button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      config[key] = coerce ? coerce(btn.dataset.value) : btn.dataset.value;
    });
  });
  const initial = group.querySelector(`[data-value="${config[key]}"]`);
  initial?.classList.add("selected");
}

wireOptionGroup("gridSize", "gridSize", Number);
wireOptionGroup("layout", "totalPhotos", Number);
wireOptionGroup("filter", "filterKey");

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => showPage(btn.dataset.nav));
});

document.getElementById("startCreatingLanding").addEventListener("click", () => showPage("setup"));

document.getElementById("startCreatingSetup").addEventListener("click", async () => {
  showPage("camera");
  await camera.start({ ...config, onDone: (photos) => runPrintingSequence(photos) });
});

document.getElementById("camBackBtn").addEventListener("click", () => {
  camera.stop();
  showPage("setup");
});

document.getElementById("fullscreenBtn").addEventListener("click", () => {
  const stage = document.querySelector(".camera-stage");
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.();
});

function runPrintingSequence(photos) {
  showPage("printing");
  const printingPageEl = pages.printing;
  const stripEl = document.getElementById("printingStrip");
  printingPageEl.classList.remove("fading-out");
  stripEl.classList.remove("printed");
  stripEl.innerHTML = "";
  photos.forEach((dataUrl) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    stripEl.appendChild(img);
  });

  // Force layout before adding the class so the transform transition runs.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => stripEl.classList.add("printed"));
  });

  window.setTimeout(() => printingPageEl.classList.add("fading-out"), 3200);
  window.setTimeout(() => {
    showPage("editor");
    editor.open(photos);
  }, 3800);
}

document.getElementById("contactForm").addEventListener("submit", (e) => {
  e.preventDefault();
  e.target.reset();
  window.alert("Pesan terkirim. Terima kasih!");
});

showPage("landing");

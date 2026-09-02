import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Hand,
  Image as ImageIcon,
  LockKeyhole,
  Maximize2,
  Move,
  Palette,
  RotateCcw,
  Sparkles,
  Sticker,
  Timer,
  Video,
  X,
} from "lucide-react";
import { StickerLayer, type PlacedSticker } from "@/components/StickerLayer";
import { captureSquareFrame, waitForVideoFrame } from "@/lib/captureFrame";
import type { FilterId } from "@/lib/filters";
import { countCorrectlyPlaced, isSolved, neighborsOf, shufflePuzzle, slideTile } from "@/lib/puzzle";
import { useHandTracking, type HandFrameState } from "@/hooks/useHandTracking";

type Step = "setup" | "puzzle" | "strip";

const filters: { label: FilterId; sample: string }[] = [
  { label: "Original", sample: "linear-gradient(135deg, #f8c6a8, #9bc3d8)" },
  { label: "B&W", sample: "linear-gradient(135deg, #dedad3, #6b6b68)" },
  { label: "Vintage", sample: "linear-gradient(135deg, #dd9b6d, #9c674f)" },
  { label: "Korean", sample: "linear-gradient(135deg, #f7d4db, #b9c9ed)" },
  { label: "Warm Glow", sample: "linear-gradient(135deg, #ffc867, #ef7659)" },
];

const frameColors = [
  { label: "Pastel blue", value: "#b9d4dc" },
  { label: "Pastel pink", value: "#efb7b7" },
  { label: "White", value: "#fbfaf6" },
  { label: "Cream", value: "#f0dfb8" },
];

const stickerOptions = ["✦", "♡", "☁", "♫", "✿", "✷"];
const timerOptions = [3, 5, 10] as const;

/** No-camera fallback so the puzzle stays playable without a photo source. */
const demoTileGradients = [
  "linear-gradient(135deg, #f2b398 0%, #e98072 42%, #786a9f 100%)",
  "linear-gradient(135deg, #aacfd1 0%, #7892ba 45%, #dd9f85 100%)",
  "linear-gradient(135deg, #e8c78b 0%, #e59362 45%, #6b8790 100%)",
  "linear-gradient(135deg, #caa5b5 0%, #9284ad 48%, #e6bf9d 100%)",
];

function makePuzzleImage(video: HTMLVideoElement | null): string | null {
  if (!video || video.readyState < 2) return null;
  return captureSquareFrame(video, 480);
}

function newStickerId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `sticker-${Date.now()}-${Math.random()}`;
}

function AppMark() {
  return (
    <div className="brand-mark" aria-label="Scrapbook Puzzle home">
      <div className="brand-spark">✦</div>
      <div>
        <div className="brand-name">SCRAPBOOK</div>
        <div className="brand-sub">PUZZLE STUDIO</div>
      </div>
    </div>
  );
}

const DEBUG_ENABLED = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

export default function Home() {
  const [step, setStep] = useState<Step>("setup");
  const [eventLog, setEventLog] = useState<string[]>([]);
  const startedAtRef = useRef(performance.now());
  const [gridSize, setGridSize] = useState<3 | 4>(3);
  const [photoCount, setPhotoCount] = useState<2 | 3 | 4>(3);
  const [filter, setFilter] = useState<FilterId>("Original");
  const [timerSeconds, setTimerSeconds] = useState<(typeof timerOptions)[number]>(3);
  const [frameColor, setFrameColor] = useState(frameColors[0].value);
  const [memory, setMemory] = useState("a little moment worth keeping");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("requesting camera access");
  const [tiles, setTiles] = useState<number[]>(() => shufflePuzzle(3));
  const [puzzleImage, setPuzzleImage] = useState<string | null>(null);
  const [hoverTile, setHoverTile] = useState(-1);
  const [solved, setSolved] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stripPreviewRef = useRef<HTMLDivElement>(null);

  const currentFilter = useMemo(() => filters.find((item) => item.label === filter) ?? filters[0], [filter]);

  const logEvent = (message: string) => {
    if (!DEBUG_ENABLED) return;
    const elapsed = ((performance.now() - startedAtRef.current) / 1000).toFixed(2);
    setEventLog((prev) => [...prev.slice(-14), `${elapsed}s  ${message}`]);
  };

  const moveTile = (index: number, source: "click" | "pinch") => {
    if (solved || countdown !== null) return;
    const next = slideTile(tiles, gridSize, index);
    if (!next) return;
    logEvent(`slide tile @${index} via ${source}`);
    setTiles(next);
    setHoverTile(-1);
    if (isSolved(next)) {
      logEvent("puzzle solved");
      setSolved(true);
    }
  };

  const triggerCountdown = (source: "click" | "fist") => {
    if (!solved || countdown !== null) return;
    logEvent(`countdown started (${timerSeconds}s) via ${source}`);
    setCountdown(timerSeconds);
  };

  const finishCountdown = (source: "timer" | "fist-skip") => {
    logEvent(`capture fired via ${source}`);
    setCountdown(null);
    const video = videoRef.current;
    const shot = video && video.readyState >= 2 ? captureSquareFrame(video, 640, filter) : null;
    const nextPhotos = shot ? [...photos, shot] : photos;
    setPhotos(nextPhotos);

    if (nextPhotos.length >= photoCount) {
      logEvent("all rounds done -> strip");
      stopCamera();
      setStep("strip");
      return;
    }
    setActivePhoto(nextPhotos.length);
    setTiles(shufflePuzzle(gridSize));
    setSolved(false);
    setHoverTile(-1);
    setPuzzleImage(makePuzzleImage(video));
  };

  // Countdown ticks every second; at 0 it pauses briefly on "memory saved" before capturing.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      const timer = window.setTimeout(() => finishCountdown("timer"), 450);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const handleHandFrame = (state: HandFrameState) => {
    if (state.pinchStarted) logEvent("gesture: pinchStarted");
    if (state.fistStarted) logEvent("gesture: fistStarted");

    if (countdown !== null) {
      if (state.fistStarted) finishCountdown("fist-skip");
      return;
    }
    if (solved) {
      if (state.fistStarted) triggerCountdown("fist");
      return;
    }
    if (!state.detected || !state.cursorFraction) {
      setHoverTile(-1);
      return;
    }
    const col = Math.min(gridSize - 1, Math.max(0, Math.floor(state.cursorFraction.x * gridSize)));
    const row = Math.min(gridSize - 1, Math.max(0, Math.floor(state.cursorFraction.y * gridSize)));
    const pos = row * gridSize + col;
    const emptyPos = tiles.indexOf(0);
    const movable = neighborsOf(emptyPos, gridSize).includes(pos);
    setHoverTile(movable ? pos : -1);
    if (state.pinchStarted && movable) moveTile(pos, "pinch");
  };

  const { status: gestureStatus } = useHandTracking({
    videoRef,
    overlayCanvasRef,
    enabled: step === "puzzle" && cameraReady,
    onFrame: handleHandFrame,
  });

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    startedAtRef.current = performance.now();
    setEventLog([]);
    logEvent("Start Creating clicked");
    setStep("puzzle");
    setCameraError("");
    setCameraMessage("requesting camera access");
    setPhotos([]);
    setActivePhoto(0);
    setTiles(shufflePuzzle(gridSize));
    setSolved(false);
    setHoverTile(-1);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const video = videoRef.current;
      if (!video) throw new Error("video element missing");
      video.srcObject = stream;
      await video.play();
      await waitForVideoFrame(video);
      streamRef.current = stream;
      setCameraReady(true);
      setPuzzleImage(makePuzzleImage(video));
      logEvent("camera ready, puzzle scrambled");
    } catch {
      setCameraReady(false);
      setPuzzleImage(null);
      setCameraMessage("demo mode · camera unavailable");
      setCameraError("Camera access is off, so we opened a playful demo mode. You can still solve the puzzle and make a strip.");
      logEvent("camera denied/unavailable -> demo mode");
    }
  };

  const resetToSetup = () => {
    stopCamera();
    setStep("setup");
    setCountdown(null);
    setSolved(false);
    setCameraError("");
  };

  const changeGridSize = (size: 3 | 4) => {
    setGridSize(size);
    setTiles(shufflePuzzle(size));
    setSolved(false);
    setHoverTile(-1);
  };

  const addSticker = (icon: string) => {
    setPlacedStickers((items) => [...items, { id: newStickerId(), icon, xPct: 0.5, yPct: 0.5, sizePct: 0.14 }]);
  };

  const downloadStrip = async () => {
    const node = stripPreviewRef.current;
    if (!node) return;
    node.classList.add("exporting");
    try {
      const canvas = await html2canvas(node, { backgroundColor: null, scale: 3, useCORS: true });
      const link = document.createElement("a");
      link.download = "scrapbook-puzzle-strip.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      node.classList.remove("exporting");
    }
  };

  const displayStatus = cameraReady ? gestureStatus : cameraMessage;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={resetToSetup}><AppMark /></button>
        <nav className="stepper" aria-label="Creation steps">
          {(["setup", "puzzle", "strip"] as Step[]).map((item, index) => (
            <div className={`step-item ${step === item ? "active" : ""} ${["setup", "puzzle", "strip"].indexOf(step) > index ? "done" : ""}`} key={item}>
              <span className="step-number">{["setup", "puzzle", "strip"].indexOf(step) > index ? <Check size={12} /> : `0${index + 1}`}</span>
              <span>{item === "setup" ? "Set the scene" : item === "puzzle" ? "Play the puzzle" : "Keep the memory"}</span>
            </div>
          ))}
        </nav>
        <button className="help-button" onClick={() => setCameraError("Tip: point your hand and pinch to slide a highlighted tile, or click tiles directly. Make a fist when you are ready to save.")}><CircleHelp size={16} /> <span>How it works</span></button>
      </header>

      {step === "setup" && (
        <section className="setup-page page-enter">
          <div className="setup-intro">
            <div className="eyebrow"><span className="eyebrow-dot" /> A tiny studio for big feelings</div>
            <h1>Make a memory<br /><em>worth puzzling over.</em></h1>
            <p className="intro-copy">A webcam photobooth with a twist. Solve a tiny puzzle with your hands, then print the moment as a one-of-a-kind scrapbook strip.</p>
            <div className="intro-meta"><span><LockKeyhole size={14} /> Nothing leaves your browser</span><span><Sparkles size={14} /> Made for 01–04 people</span></div>
          </div>

          <div className="setup-board paper-card">
            <div className="tape tape-top-left" /><div className="tape tape-top-right" />
            <div className="board-heading"><div><span className="mono-label">01 / SETUP</span><h2>Choose your little details.</h2></div><span className="board-note">* you can change these later</span></div>
            <div className="form-section">
              <div className="section-label"><span>01</span><div><strong>Grid size</strong><small>How tricky should it be?</small></div></div>
              <div className="choice-row">
                {[3, 4].map((size) => <button key={size} className={`grid-choice ${gridSize === size ? "selected" : ""}`} onClick={() => changeGridSize(size as 3 | 4)}><span className={`mini-grid grid-${size}`}>{Array.from({ length: size * size }, (_, i) => <i key={i} />)}</span><span><b>{size} × {size}</b><small>{size === 3 ? "easy does it" : "bring your focus"}</small></span>{gridSize === size && <Check size={16} className="choice-check" />}</button>)}
              </div>
            </div>
            <div className="form-section">
              <div className="section-label"><span>02</span><div><strong>Photo set</strong><small>How many moments to keep?</small></div></div>
              <div className="photo-counts">{([2, 3, 4] as const).map((count) => <button key={count} className={`count-choice ${photoCount === count ? "selected" : ""}`} onClick={() => setPhotoCount(count)}><span className="polaroid-stack"><i /><i /><i /></span><b>{count}</b><small>photos</small></button>)}</div>
            </div>
            <div className="form-section filter-section">
              <div className="section-label"><span>03</span><div><strong>Light leak</strong><small>Choose the mood</small></div></div>
              <div className="filter-row">{filters.map((item) => <button key={item.label} className={`filter-choice ${filter === item.label ? "selected" : ""}`} onClick={() => setFilter(item.label)}><span className="filter-swatch" style={{ background: item.sample }} /><span>{item.label}</span></button>)}</div>
            </div>
            <div className="form-section filter-section">
              <div className="section-label"><span>04</span><div><strong>Countdown</strong><small>Seconds after your fist before it snaps</small></div></div>
              <div className="filter-row">{timerOptions.map((seconds) => <button key={seconds} className={`filter-choice ${timerSeconds === seconds ? "selected" : ""}`} onClick={() => setTimerSeconds(seconds)}><Timer size={14} /><span>{seconds}s</span></button>)}</div>
            </div>
            <button className="primary-cta" onClick={startCamera}><Camera size={19} /> Start creating <ArrowRight size={18} /></button>
            <div className="board-footer"><span>camera permission required</span><span className="footer-scribble">let's make something sweet ↗</span></div>
          </div>
          <div className="floating-sticker sticker-one">✿</div><div className="floating-sticker sticker-two">✦</div>
        </section>
      )}

      {step === "puzzle" && (
        <section className="puzzle-page page-enter">
          <div className="puzzle-topline"><button className="back-button" onClick={resetToSetup}><ArrowLeft size={16} /> Back to setup</button><div className="capture-progress"><span className="mono-label">PHOTO SET</span><div className="progress-dots">{Array.from({ length: photoCount }, (_, index) => <i className={index === activePhoto ? "current" : index < activePhoto ? "done" : ""} key={index} />)}</div><b>{String(activePhoto + 1).padStart(2, "0")} / {String(photoCount).padStart(2, "0")}</b></div><span className="filter-pill"><span className="tiny-swatch" style={{ background: currentFilter.sample }} /> {filter}</span></div>
          <div className="puzzle-layout">
            <div className="camera-card">
              <div className="camera-toolbar"><span><span className={`status-dot ${cameraReady ? "live" : ""}`} /> {cameraReady ? "LIVE CAMERA" : "DEMO CAMERA"}</span><span>1080p <Maximize2 size={13} /></span></div>
              <div className="camera-stage">
                <video ref={videoRef} className={cameraReady ? "camera-video" : "camera-video hidden"} muted playsInline />
                {!cameraReady && <div className="demo-camera" style={{ background: currentFilter.sample }}><div className="demo-sun" /><div className="demo-face"><span /><span /><b /></div><div className="demo-caption">your camera moment<br /><small>will appear here</small></div></div>}
                <div className="camera-vignette" /><div className="face-frame"><i /><i /><i /><i /></div>
                <canvas ref={overlayCanvasRef} className="hand-skeleton-canvas" />
                <div className="camera-label"><Video size={14} /> {displayStatus}</div>
              </div>
              {cameraError && <div className="camera-alert"><X size={15} /><span>{cameraError}</span><button onClick={() => setCameraError("")}>dismiss</button></div>}
              <div className="camera-hint"><span className="hint-icon"><Move size={16} /></span><span><b>Point &amp; pinch</b><small>Move your hand to highlight a tile next to the empty square, pinch to slide it.</small></span></div>
            </div>

            <div className="game-panel">
              <div className="game-heading"><div><span className="mono-label coral">YOUR TURN</span><h2>Solve to unlock<br /><em>the flash.</em></h2></div><span className="puzzle-count">{countCorrectlyPlaced(tiles)} / {tiles.length - 1}<small>pieces placed</small></span></div>
              <div className={`puzzle-grid grid-${gridSize}`} style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }} aria-label="Sliding puzzle">
                {tiles.map((tile, index) => {
                  const isHover = hoverTile === index;
                  if (tile === 0) {
                    return <button key={`empty-${index}`} className={`puzzle-tile empty ${isHover ? "hover-target" : ""}`} onClick={() => moveTile(index, "click")} aria-label="Empty tile" />;
                  }
                  const style = puzzleImage
                    ? {
                        backgroundImage: `url(${puzzleImage})`,
                        backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                        backgroundPosition: `${((tile - 1) % gridSize) * (100 / (gridSize - 1))}% ${Math.floor((tile - 1) / gridSize) * (100 / (gridSize - 1))}%`,
                      }
                    : { background: demoTileGradients[(tile - 1) % demoTileGradients.length] };
                  return (
                    <button key={`${tile}-${index}`} className={`puzzle-tile ${isHover ? "hover-target" : ""}`} onClick={() => moveTile(index, "click")} style={style}>
                      {!puzzleImage && <span className="tile-number">{String(tile).padStart(2, "0")}</span>}
                      <span className="tile-grain" />
                    </button>
                  );
                })}
              </div>
              <div className="game-actions"><button className="text-button" onClick={() => { setTiles(shufflePuzzle(gridSize)); setSolved(false); setHoverTile(-1); }}><RotateCcw size={14} /> scramble</button><span className="action-rule" /><span className="gesture-key"><span className="gesture-circle"><Hand size={15} /></span><span><b>PINCH</b><small>to slide</small></span></span><button className="finish-button" onClick={() => triggerCountdown("click")} disabled={!solved || countdown !== null}><span>Make a fist</span><ChevronRight size={16} /></button></div>
              {solved && countdown === null && <div className="solved-note"><Sparkles size={14} /> Puzzle unlocked — make a fist for a {timerSeconds}s countdown to the photo.</div>}
            </div>
          </div>
          <div className="puzzle-footer"><span><span className="footer-key">esc</span> to leave the studio</span><span>gesture tracking is local &amp; private <LockKeyhole size={13} /></span></div>
          {countdown !== null && <div className="countdown-overlay"><div className="countdown-paper"><span className="mono-label">GET READY</span><b>{countdown === 0 ? "✦" : countdown}</b><p>{countdown === 0 ? "memory saved" : "hold that thought"}</p></div></div>}
          {DEBUG_ENABLED && <DebugPanel log={eventLog} />}
        </section>
      )}

      {step === "strip" && (
        <section className="strip-page page-enter">
          <div className="strip-heading"><div><span className="mono-label coral">03 / KEEP IT</span><h1>Printing your <em>memories.</em></h1><p>Arrange the little details, then take your memory home.</p></div><button className="secondary-button" onClick={resetToSetup}><RotateCcw size={15} /> start over</button></div>
          <div className="strip-layout">
            <div className="strip-preview-wrap">
              <div className="tape tape-strip" />
              <div className="strip-preview" ref={stripPreviewRef} style={{ background: frameColor }}>
                <div className="strip-inner">
                  <div className="strip-topline"><span>SCRAPBOOK<br />PUZZLE</span><span>2026<br />EDITION</span></div>
                  {photos.map((photo, index) => (
                    <div className="strip-photo" key={index} style={{ backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                      <span>MEMORY 0{index + 1}</span><span className="photo-spark">✦</span>
                    </div>
                  ))}
                  <div className="memory-line">{memory || "a little moment worth keeping"}</div>
                  <div className="strip-date">made with a pinch of magic · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
                <StickerLayer stickers={placedStickers} onChange={setPlacedStickers} />
              </div>
              <span className="preview-shadow" />
            </div>
            <aside className="customize-panel paper-card">
              <div className="tape tape-panel" />
              <div className="panel-title"><span className="mono-label">MAKE IT YOURS</span><h2>The finishing touches.</h2></div>
              <div className="customize-section"><div className="customize-label"><Palette size={15} /><span><b>Frame color</b><small>Pick a paper mood.</small></span></div><div className="color-row">{frameColors.map((color) => <button key={color.value} className={`color-dot ${frameColor === color.value ? "selected" : ""}`} aria-label={color.label} style={{ background: color.value }} onClick={() => setFrameColor(color.value)}>{frameColor === color.value && <Check size={14} />}</button>)}</div></div>
              <div className="customize-section"><div className="customize-label"><Sticker size={15} /><span><b>Little stickers</b><small>Click to add, then drag &amp; resize on the strip.</small></span></div><div className="sticker-row">{stickerOptions.map((sticker) => <button key={sticker} className="sticker-button" onClick={() => addSticker(sticker)}>{sticker}</button>)}</div></div>
              <div className="customize-section"><div className="customize-label"><ImageIcon size={15} /><span><b>Memory log</b><small>A note to your future self.</small></span></div><textarea value={memory} onChange={(event) => setMemory(event.target.value)} maxLength={60} placeholder="Type a memory here..." /><div className="character-count">{memory.length} / 60</div></div>
              <button className="primary-cta download-button" onClick={downloadStrip}><Download size={17} /> Download my strip <ArrowRight size={17} /></button>
              <div className="export-note"><LockKeyhole size={13} /> PNG export · your real photos, filters &amp; stickers</div>
            </aside>
          </div>
          <div className="strip-footer"><span><Sparkles size={14} /> made with tiny moments &amp; big feelings</span><span>Scrapbook Puzzle Studio · 01</span></div>
          {DEBUG_ENABLED && <DebugPanel log={eventLog} />}
        </section>
      )}
    </main>
  );
}

function DebugPanel({ log }: { log: string[] }) {
  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 50, maxWidth: 360, maxHeight: 260, overflowY: "auto", background: "rgba(20,20,20,.92)", color: "#9ef58c", font: "10px/1.5 'Space Mono', monospace", padding: "10px 12px", borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
      <div style={{ color: "#fff", marginBottom: 4 }}>DEBUG LOG (?debug=1)</div>
      {log.length === 0 && <div>waiting for events…</div>}
      {log.map((line, index) => <div key={index}>{line}</div>)}
    </div>
  );
}

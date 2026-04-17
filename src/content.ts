// Content script: not an ES module. No imports.
// Runs on https://claude.ai/*

type Config = {
  selectedImage: string;
  bgSize: number;
  bgOpacity: number;
  offsetX: number;
  offsetY: number;
  svgColor: string;
  enabled: boolean;
};

type UploadedImage = { id: string; dataUrl: string; name: string };

const DEFAULT_CONFIG: Config = {
  selectedImage: "",
  bgSize: 120,
  bgOpacity: 100,
  offsetX: 0,
  offsetY: 0,
  svgColor: "",
  enabled: true,
};

const CONFIG_KEY = "claudeLoadingArt";
const IMAGES_KEY = "uploadedImages";
const STYLE_ID = "claude-loading-art-style";
const DATA_WRAP = "data-ca-wrap";
const DATA_ICON = "data-ca-icon";
const BG_CLASS = "ca-bg-layer";
const IMG_CLASS = "ca-bg-img";
const PATH_PREFIX = "m19.6 66.5";

type WinFlag = Window & { __claude_loading_art__?: boolean };

(function main() {
  const w = window as WinFlag;
  if (w.__claude_loading_art__) return;
  w.__claude_loading_art__ = true;

  let config: Config = { ...DEFAULT_CONFIG };
  let images: UploadedImage[] = [];

  injectStyle();
  void init();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[CONFIG_KEY]) {
      const next = (changes[CONFIG_KEY].newValue ?? {}) as Partial<Config>;
      config = { ...DEFAULT_CONFIG, ...next };
      apply();
    }
    if (area === "local" && changes[IMAGES_KEY]) {
      const next = changes[IMAGES_KEY].newValue;
      images = Array.isArray(next) ? (next as UploadedImage[]) : [];
      apply();
    }
  });

  let scanScheduled = false;
  const scheduleScan = () => {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanAndTag();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  async function init() {
    const [syncRes, localRes] = await Promise.all([
      chrome.storage.sync.get(CONFIG_KEY),
      chrome.storage.local.get(IMAGES_KEY),
    ]);
    const stored = (syncRes[CONFIG_KEY] ?? {}) as Partial<Config>;
    config = { ...DEFAULT_CONFIG, ...stored };
    const list = localRes[IMAGES_KEY];
    images = Array.isArray(list) ? (list as UploadedImage[]) : [];
    apply();
    scanAndTag();
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // We keep small values (size, opacity, offsets, display) in CSS vars, but
    // the image itself is delivered via a real <img> element inside the layer.
    // Large data URLs ( > a few hundred KB ) get silently dropped when assigned
    // to a CSS custom property, so we must NOT put the image URL in a var.
    style.textContent = `
.${BG_CLASS} {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(
    calc(-50% + var(--ca-ox, 0px)),
    calc(-50% + var(--ca-oy, 0px))
  );
  width: var(--ca-size, 120px);
  height: var(--ca-size, 120px);
  opacity: var(--ca-opacity, 1);
  display: var(--ca-display, none);
  z-index: -1;
  pointer-events: none;
  transition: opacity 0.2s ease-in-out;
}
.${BG_CLASS} > .${IMG_CLASS} {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
  user-select: none;
}
[inert] .${BG_CLASS},
.blur-md .${BG_CLASS} {
  display: none !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function apply() {
    const root = document.documentElement;
    const img = images.find((i) => i.id === config.selectedImage);
    const hasImage = !!img && config.enabled;

    root.style.setProperty("--ca-display", hasImage ? "block" : "none");
    root.style.setProperty("--ca-size", `${config.bgSize}px`);
    root.style.setProperty("--ca-opacity", String(config.bgOpacity / 100));
    root.style.setProperty("--ca-ox", `${config.offsetX}px`);
    root.style.setProperty("--ca-oy", `${config.offsetY}px`);

    document
      .querySelectorAll<HTMLElement>(`.${BG_CLASS}`)
      .forEach(updateBgImage);
    applyColors();
  }

  function scanAndTag() {
    const paths = document.querySelectorAll<SVGPathElement>("svg path");
    for (const path of Array.from(paths)) {
      const d = path.getAttribute("d") ?? "";
      if (!d.startsWith(PATH_PREFIX)) continue;
      const svg = path.ownerSVGElement;
      if (!svg) continue;
      const icon = svg.closest<HTMLElement>(".text-accent-brand.inline-block");
      if (!icon) continue;
      if (!icon.hasAttribute(DATA_ICON)) icon.setAttribute(DATA_ICON, "");
      const wrap = pickWrap(icon);
      if (!wrap) continue;
      ensureWrapStyles(wrap);
      ensureBgLayer(wrap);
    }
    applyColors();
  }

  function pickWrap(icon: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = icon.parentElement;
    for (let i = 0; node && i < 4; i++) {
      if (node.getAttribute("aria-hidden") === "true") return node;
      node = node.parentElement;
    }
    return icon.parentElement;
  }

  function ensureWrapStyles(wrap: HTMLElement) {
    if (!wrap.hasAttribute(DATA_WRAP)) wrap.setAttribute(DATA_WRAP, "");
    const cs = getComputedStyle(wrap);
    if (cs.position === "static" && wrap.style.position !== "relative") {
      wrap.style.position = "relative";
    }
    if (cs.isolation !== "isolate") {
      wrap.style.isolation = "isolate";
    }
    if (cs.overflow !== "visible") {
      wrap.style.overflow = "visible";
    }
  }

  function ensureBgLayer(wrap: HTMLElement) {
    let bg = wrap.querySelector<HTMLDivElement>(`:scope > .${BG_CLASS}`);
    if (!bg) {
      bg = document.createElement("div");
      bg.className = BG_CLASS;
      bg.setAttribute("aria-hidden", "true");
      const img = document.createElement("img");
      img.className = IMG_CLASS;
      img.setAttribute("aria-hidden", "true");
      img.alt = "";
      bg.appendChild(img);
      wrap.appendChild(bg);
    }
    updateBgImage(bg);
  }

  function updateBgImage(bg: HTMLElement) {
    const img = bg.querySelector<HTMLImageElement>(`.${IMG_CLASS}`);
    if (!img) return;
    const selected = images.find((i) => i.id === config.selectedImage);
    const wantId = selected && config.enabled ? selected.id : "";
    if (img.dataset.caSrcId === wantId) return;
    img.dataset.caSrcId = wantId;
    if (selected && config.enabled) {
      img.src = selected.dataUrl;
    } else {
      img.removeAttribute("src");
    }
  }

  function applyColors() {
    document.querySelectorAll<HTMLElement>(`[${DATA_ICON}]`).forEach((el) => {
      el.style.color = config.enabled && config.svgColor ? config.svgColor : "";
    });
  }
})();

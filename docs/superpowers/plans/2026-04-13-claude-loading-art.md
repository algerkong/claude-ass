# Claude Loading Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that decorates Claude.ai's sparkle icon with a user-uploaded background image and optionally recolors the icon, configured via a Claude-styled popup.

**Architecture:** TypeScript compiled with plain `tsc`. `content.ts` injects a static `<style>` that uses `:has()` + `::before` pseudo-elements driven by CSS variables on `:root`; it reads config from `chrome.storage` and reapplies on change. `popup.ts` renders a small settings UI that writes directly to `chrome.storage`, which the content script picks up.

**Tech Stack:** TypeScript, `tsc`, Chrome Extension Manifest V3, `@types/chrome`, vanilla DOM (no framework).

**Spec:** `docs/superpowers/specs/2026-04-13-claude-loading-art-design.md`

---

## File Structure

```
chrome-plugin/
├── manifest.json             # MV3 manifest
├── package.json              # tsc + @types/chrome
├── tsconfig.json             # ES2020, strict, outDir=dist
├── .gitignore
├── src/
│   ├── types.ts              # Config, UploadedImage, DEFAULT_CONFIG, storage keys
│   ├── storage.ts            # load/save helpers wrapping chrome.storage
│   ├── content.ts            # style injection + apply() + observer
│   ├── popup.html            # Popup DOM
│   ├── popup.css             # Claude-styled popup
│   └── popup.ts              # Popup logic wired to storage helpers
├── dist/                     # tsc output (gitignored)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/…                    # already exists
```

Each source file has one responsibility:
- `types.ts` — data shapes and defaults, no runtime logic except constant exports
- `storage.ts` — thin async wrappers around `chrome.storage.sync/local` for Config and UploadedImage[]
- `content.ts` — runs on claude.ai; injects CSS, applies config, watches DOM and storage
- `popup.ts` — runs in popup; reads/writes storage, drives DOM

---

## Task 1: Initialize project scaffold

**Files:**
- Create: `chrome-plugin/package.json`
- Create: `chrome-plugin/tsconfig.json`
- Create: `chrome-plugin/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-loading-art",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["chrome"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Note: `module: ES2020` means output is ES modules. Chrome extension content scripts loaded via `manifest.content_scripts` do NOT support ES module imports. We address this in Task 4 by keeping `content.ts` self-contained (no imports) OR by setting that specific file aside. To keep things simple, we use `module: ES2020` and inline content.ts without imports; popup.html will load popup.js as a `<script type="module">`.

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run: `cd chrome-plugin && npm install`
Expected: creates `node_modules/` and `package-lock.json` without errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: scaffold ts project for claude-loading-art"
```

---

## Task 2: Define shared types and defaults

**Files:**
- Create: `chrome-plugin/src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type Config = {
  selectedImage: string;
  bgSize: number;
  bgOpacity: number;
  offsetX: number;
  offsetY: number;
  svgColor: string;
  enabled: boolean;
};

export type UploadedImage = {
  id: string;
  dataUrl: string;
  name: string;
};

export const DEFAULT_CONFIG: Config = {
  selectedImage: "",
  bgSize: 120,
  bgOpacity: 100,
  offsetX: 0,
  offsetY: 0,
  svgColor: "",
  enabled: true,
};

export const CONFIG_KEY = "claudeLoadingArt";
export const IMAGES_KEY = "uploadedImages";
```

- [ ] **Step 2: Verify build**

Run: `cd chrome-plugin && npm run build`
Expected: creates `dist/types.js` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared Config and UploadedImage types"
```

---

## Task 3: Storage helpers

**Files:**
- Create: `chrome-plugin/src/storage.ts`

- [ ] **Step 1: Write `src/storage.ts`**

```ts
import {
  Config,
  UploadedImage,
  DEFAULT_CONFIG,
  CONFIG_KEY,
  IMAGES_KEY,
} from "./types.js";

export async function loadConfig(): Promise<Config> {
  const res = await chrome.storage.sync.get(CONFIG_KEY);
  const stored = (res[CONFIG_KEY] ?? {}) as Partial<Config>;
  return { ...DEFAULT_CONFIG, ...stored };
}

export async function saveConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const next: Config = { ...current, ...patch };
  await chrome.storage.sync.set({ [CONFIG_KEY]: next });
  return next;
}

export async function loadImages(): Promise<UploadedImage[]> {
  const res = await chrome.storage.local.get(IMAGES_KEY);
  const list = res[IMAGES_KEY];
  return Array.isArray(list) ? (list as UploadedImage[]) : [];
}

export async function saveImages(images: UploadedImage[]): Promise<void> {
  await chrome.storage.local.set({ [IMAGES_KEY]: images });
}

export function newImageId(): string {
  return "upload_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
```

Note: imports use `.js` extension because `module: ES2020` output uses ES module spec (Chrome extension popup loads as module and requires explicit extensions).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `dist/storage.js` generated, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/storage.ts
git commit -m "feat: add chrome.storage helpers for config and images"
```

---

## Task 4: Content script

**Files:**
- Create: `chrome-plugin/src/content.ts`

Content scripts loaded via `manifest.content_scripts` are NOT modules, so `content.ts` must not use `import`. It re-declares the small number of constants it needs. This is intentional duplication — a Chrome extension constraint, not a design smell.

- [ ] **Step 1: Write `src/content.ts`**

```ts
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
const ICON_SELECTOR = '.text-accent-brand, [class*="text-brand"]';

declare global {
  interface Window {
    __claude_loading_art__?: boolean;
  }
}

(function main() {
  if (window.__claude_loading_art__) return;
  window.__claude_loading_art__ = true;

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

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.(ICON_SELECTOR)) applyColorTo(node);
        node.querySelectorAll?.(ICON_SELECTOR).forEach(applyColorTo);
      });
    }
  });
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
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.text-accent-brand:has(svg path[d^="m19.6"]) {
  position: relative;
  overflow: visible;
}
.text-accent-brand:has(svg path[d^="m19.6"])::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(
    calc(-50% + var(--ca-ox, 0px)),
    calc(-50% + var(--ca-oy, 0px))
  );
  width: var(--ca-size, 120px);
  height: var(--ca-size, 120px);
  background: var(--ca-image, none) center/contain no-repeat;
  opacity: var(--ca-opacity, 1);
  display: var(--ca-display, none);
  z-index: -1;
  pointer-events: none;
  transition: opacity 0.4s ease-in-out;
}
[inert] .text-accent-brand:has(svg path[d^="m19.6"])::before,
.blur-md .text-accent-brand:has(svg path[d^="m19.6"])::before {
  display: none !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function apply() {
    const root = document.documentElement;
    const img = images.find((i) => i.id === config.selectedImage);
    const hasImage = !!img && config.enabled;

    if (hasImage) {
      root.style.setProperty("--ca-image", `url("${img!.dataUrl}")`);
      root.style.setProperty("--ca-display", "block");
    } else {
      root.style.removeProperty("--ca-image");
      root.style.setProperty("--ca-display", "none");
    }
    root.style.setProperty("--ca-size", `${config.bgSize}px`);
    root.style.setProperty("--ca-opacity", String(config.bgOpacity / 100));
    root.style.setProperty("--ca-ox", `${config.offsetX}px`);
    root.style.setProperty("--ca-oy", `${config.offsetY}px`);

    document.querySelectorAll<HTMLElement>(ICON_SELECTOR).forEach(applyColorTo);
  }

  function applyColorTo(el: Element) {
    if (!(el instanceof HTMLElement)) return;
    el.style.color = config.enabled && config.svgColor ? config.svgColor : "";
  }
})();
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `dist/content.js` generated, no TS errors.

- [ ] **Step 3: Spot-check output**

Open `dist/content.js` and confirm it contains the `main()` IIFE and the CSS string. No `import`/`export` statements should reference other files at runtime (types are erased).

- [ ] **Step 4: Commit**

```bash
git add src/content.ts
git commit -m "feat: content script injects CSS and applies config"
```

---

## Task 5: Manifest and icons

**Files:**
- Create: `chrome-plugin/manifest.json`
- Create: `chrome-plugin/icons/icon16.png`, `icon48.png`, `icon128.png`

- [ ] **Step 1: Generate icons from Claude sparkle SVG**

Create `chrome-plugin/icons/source.svg` with the sparkle path from `docs/plugin-spec.md` / the page structure:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1f1e1d"/>
  <path fill="#d97757" d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"/>
</svg>
```

Render to PNGs using ImageMagick (available on most systems):

```bash
cd chrome-plugin/icons
for size in 16 48 128; do
  convert -background none -resize ${size}x${size} source.svg icon${size}.png
done
```

If ImageMagick is not available, use `rsvg-convert`:

```bash
for size in 16 48 128; do
  rsvg-convert -w $size -h $size source.svg -o icon${size}.png
done
```

Verify files exist:

```bash
ls -l icon16.png icon48.png icon128.png
```

Expected: three PNG files present, non-zero size.

- [ ] **Step 2: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Claude Loading Art",
  "version": "0.1.0",
  "description": "Decorate Claude.ai's sparkle icon with your own background art.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "src/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png"
    }
  },
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["https://claude.ai/*"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json icons/
git commit -m "feat: add MV3 manifest and Claude sparkle icons"
```

---

## Task 6: Popup HTML and CSS (Claude-styled)

**Files:**
- Create: `chrome-plugin/src/popup.html`
- Create: `chrome-plugin/src/popup.css`

This task uses the frontend-design skill's principles: avoid generic AI aesthetics, use Claude's visual language (warm neutrals, the #d97757 accent, rounded cards), and support light/dark via `prefers-color-scheme`.

- [ ] **Step 1: Write `src/popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Claude Loading Art</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header class="hdr">
      <h1 class="hdr__title">Claude Loading Art</h1>
      <label class="toggle">
        <input type="checkbox" id="enabled" />
        <span class="toggle__track"><span class="toggle__thumb"></span></span>
      </label>
    </header>

    <section class="card">
      <h2 class="card__title">Background</h2>
      <div class="preview" id="preview">
        <span class="preview__empty">No image</span>
      </div>
      <div class="thumbs" id="thumbs"></div>
      <label class="btn btn--primary">
        Upload image
        <input type="file" id="upload" accept="image/*" multiple hidden />
      </label>
    </section>

    <section class="card">
      <h2 class="card__title">Position &amp; Style</h2>
      <div class="row">
        <label for="bgSize">Size</label>
        <input type="range" id="bgSize" min="32" max="320" step="1" />
        <output id="bgSizeOut"></output>
      </div>
      <div class="row">
        <label for="bgOpacity">Opacity</label>
        <input type="range" id="bgOpacity" min="0" max="100" step="1" />
        <output id="bgOpacityOut"></output>
      </div>
      <div class="row">
        <label for="offsetX">X offset</label>
        <input type="range" id="offsetX" min="-200" max="200" step="1" />
        <output id="offsetXOut"></output>
      </div>
      <div class="row">
        <label for="offsetY">Y offset</label>
        <input type="range" id="offsetY" min="-200" max="200" step="1" />
        <output id="offsetYOut"></output>
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">Icon color</h2>
      <div class="row row--color">
        <input type="color" id="svgColor" />
        <input type="text" id="svgColorText" placeholder="#d97757 or empty" />
        <button type="button" id="svgColorReset" class="btn btn--ghost">Reset</button>
      </div>
    </section>

    <script type="module" src="../dist/popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `src/popup.css`**

```css
:root {
  --bg: #faf9f7;
  --surface: #ffffff;
  --border: #ece8e1;
  --text: #1f1e1d;
  --text-dim: #6b6760;
  --accent: #d97757;
  --accent-hover: #c4684a;
  --danger: #b4462f;
  --radius: 14px;
  --shadow: 0 1px 2px rgba(31, 30, 29, 0.04),
    0 4px 16px rgba(31, 30, 29, 0.06);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1f1e1d;
    --surface: #262624;
    --border: #34322e;
    --text: #f3f1ec;
    --text-dim: #a39e93;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4),
      0 4px 16px rgba(0, 0, 0, 0.3);
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  color: var(--text);
  background: var(--bg);
}

body {
  width: 340px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 4px;
}
.hdr__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.toggle { position: relative; display: inline-flex; cursor: pointer; }
.toggle input { position: absolute; opacity: 0; inset: 0; }
.toggle__track {
  width: 34px;
  height: 20px;
  background: var(--border);
  border-radius: 999px;
  position: relative;
  transition: background 0.2s;
}
.toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: left 0.2s;
}
.toggle input:checked + .toggle__track { background: var(--accent); }
.toggle input:checked + .toggle__track .toggle__thumb { left: 16px; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin: 0;
}

.preview {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  align-self: center;
}
.preview__empty {
  font-size: 11px;
  color: var(--text-dim);
}

.thumbs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.thumb {
  position: relative;
  aspect-ratio: 1/1;
  border-radius: 8px;
  border: 1px solid var(--border);
  background-size: cover;
  background-position: center;
  cursor: pointer;
}
.thumb--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(217, 119, 87, 0.3);
}
.thumb__del {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: var(--danger);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  padding: 0;
  cursor: pointer;
  display: none;
}
.thumb:hover .thumb__del { display: block; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.btn--primary {
  background: var(--accent);
  color: #fff;
}
.btn--primary:hover { background: var(--accent-hover); }
.btn--ghost {
  background: transparent;
  color: var(--text-dim);
  border-color: var(--border);
}
.btn--ghost:hover { color: var(--text); }

.row {
  display: grid;
  grid-template-columns: 64px 1fr 44px;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.row label { color: var(--text-dim); }
.row output {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  height: 20px;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--border);
  border-radius: 999px;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: -5px;
  cursor: pointer;
  border: 2px solid var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.row--color {
  grid-template-columns: 36px 1fr auto;
}
input[type="color"] {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
input[type="text"] {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
}
input[type="text"]:focus {
  outline: none;
  border-color: var(--accent);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/popup.html src/popup.css
git commit -m "feat: popup markup and Claude-styled css"
```

---

## Task 7: Popup logic

**Files:**
- Create: `chrome-plugin/src/popup.ts`

- [ ] **Step 1: Write `src/popup.ts`**

```ts
import { Config, UploadedImage, DEFAULT_CONFIG } from "./types.js";
import {
  loadConfig,
  saveConfig,
  loadImages,
  saveImages,
  newImageId,
} from "./storage.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

type El = {
  enabled: HTMLInputElement;
  preview: HTMLDivElement;
  thumbs: HTMLDivElement;
  upload: HTMLInputElement;
  bgSize: HTMLInputElement;
  bgSizeOut: HTMLOutputElement;
  bgOpacity: HTMLInputElement;
  bgOpacityOut: HTMLOutputElement;
  offsetX: HTMLInputElement;
  offsetXOut: HTMLOutputElement;
  offsetY: HTMLInputElement;
  offsetYOut: HTMLOutputElement;
  svgColor: HTMLInputElement;
  svgColorText: HTMLInputElement;
  svgColorReset: HTMLButtonElement;
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

let config: Config = { ...DEFAULT_CONFIG };
let images: UploadedImage[] = [];
let el!: El;

document.addEventListener("DOMContentLoaded", () => {
  el = {
    enabled: $("enabled"),
    preview: $("preview"),
    thumbs: $("thumbs"),
    upload: $("upload"),
    bgSize: $("bgSize"),
    bgSizeOut: $("bgSizeOut"),
    bgOpacity: $("bgOpacity"),
    bgOpacityOut: $("bgOpacityOut"),
    offsetX: $("offsetX"),
    offsetXOut: $("offsetXOut"),
    offsetY: $("offsetY"),
    offsetYOut: $("offsetYOut"),
    svgColor: $("svgColor"),
    svgColorText: $("svgColorText"),
    svgColorReset: $("svgColorReset"),
  };
  void init();
});

async function init() {
  [config, images] = await Promise.all([loadConfig(), loadImages()]);
  render();
  wire();
}

function render() {
  el.enabled.checked = config.enabled;
  el.bgSize.value = String(config.bgSize);
  el.bgSizeOut.value = `${config.bgSize}px`;
  el.bgOpacity.value = String(config.bgOpacity);
  el.bgOpacityOut.value = `${config.bgOpacity}%`;
  el.offsetX.value = String(config.offsetX);
  el.offsetXOut.value = `${config.offsetX}px`;
  el.offsetY.value = String(config.offsetY);
  el.offsetYOut.value = `${config.offsetY}px`;
  el.svgColorText.value = config.svgColor;
  el.svgColor.value = /^#[0-9a-f]{6}$/i.test(config.svgColor)
    ? config.svgColor
    : "#d97757";

  renderPreview();
  renderThumbs();
}

function renderPreview() {
  const active = images.find((i) => i.id === config.selectedImage);
  if (active) {
    el.preview.style.backgroundImage = `url("${active.dataUrl}")`;
    el.preview.innerHTML = "";
  } else {
    el.preview.style.backgroundImage = "";
    el.preview.innerHTML = '<span class="preview__empty">No image</span>';
  }
}

function renderThumbs() {
  el.thumbs.innerHTML = "";
  for (const img of images) {
    const div = document.createElement("div");
    div.className = "thumb" + (img.id === config.selectedImage ? " thumb--active" : "");
    div.style.backgroundImage = `url("${img.dataUrl}")`;
    div.title = img.name;
    div.addEventListener("click", () => void select(img.id));

    const del = document.createElement("button");
    del.className = "thumb__del";
    del.textContent = "×";
    del.title = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      void remove(img.id);
    });
    div.appendChild(del);
    el.thumbs.appendChild(div);
  }
}

function wire() {
  el.enabled.addEventListener("change", () => patch({ enabled: el.enabled.checked }));

  bindSlider(el.bgSize, el.bgSizeOut, "bgSize", (v) => `${v}px`);
  bindSlider(el.bgOpacity, el.bgOpacityOut, "bgOpacity", (v) => `${v}%`);
  bindSlider(el.offsetX, el.offsetXOut, "offsetX", (v) => `${v}px`);
  bindSlider(el.offsetY, el.offsetYOut, "offsetY", (v) => `${v}px`);

  el.upload.addEventListener("change", () => void handleUpload());

  el.svgColor.addEventListener("input", () => {
    el.svgColorText.value = el.svgColor.value;
    void patch({ svgColor: el.svgColor.value });
  });
  el.svgColorText.addEventListener("change", () => {
    const v = el.svgColorText.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) el.svgColor.value = v;
    void patch({ svgColor: v });
  });
  el.svgColorReset.addEventListener("click", () => {
    el.svgColorText.value = "";
    el.svgColor.value = "#d97757";
    void patch({ svgColor: "" });
  });
}

function bindSlider(
  input: HTMLInputElement,
  out: HTMLOutputElement,
  key: "bgSize" | "bgOpacity" | "offsetX" | "offsetY",
  fmt: (v: number) => string,
) {
  input.addEventListener("input", () => {
    const v = Number(input.value);
    out.value = fmt(v);
    void patch({ [key]: v } as Partial<Config>);
  });
}

async function patch(p: Partial<Config>) {
  config = await saveConfig(p);
}

async function select(id: string) {
  await patch({ selectedImage: id });
  renderPreview();
  renderThumbs();
}

async function remove(id: string) {
  images = images.filter((i) => i.id !== id);
  await saveImages(images);
  if (config.selectedImage === id) {
    await patch({ selectedImage: images[0]?.id ?? "" });
  }
  renderPreview();
  renderThumbs();
}

async function handleUpload() {
  const files = Array.from(el.upload.files ?? []);
  el.upload.value = "";
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`${file.name} is larger than 4MB and was skipped.`);
      continue;
    }
    const dataUrl = await readAsDataURL(file);
    const img: UploadedImage = { id: newImageId(), dataUrl, name: file.name };
    images.push(img);
    await saveImages(images);
    await patch({ selectedImage: img.id });
  }
  renderPreview();
  renderThumbs();
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `dist/popup.js`, `dist/storage.js`, `dist/types.js` all present. No TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/popup.ts
git commit -m "feat: popup logic wired to chrome.storage"
```

---

## Task 8: End-to-end manual test

This project has no headless test runner — verification is loading the unpacked extension in Chrome and exercising it.

- [ ] **Step 1: Build fresh**

Run: `npm run build`
Expected: clean build, `dist/` contains `content.js`, `popup.js`, `storage.js`, `types.js`.

- [ ] **Step 2: Load unpacked in Chrome**

1. Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-plugin/` directory
5. Confirm the extension loads with no errors (no red error badge on the card)

- [ ] **Step 3: Walk the test checklist**

On `https://claude.ai/`:
1. Fresh install: no visual change on the page (no image yet).
2. Open popup: all controls rendered, "No image" preview.
3. Upload a PNG/JPG. Preview updates, thumbnail appears selected, and the image appears behind the sparkle icon in the greeting "Good evening, …".
4. Drag the Size slider — image resizes live.
5. Drag Opacity — image fades.
6. Drag X/Y offset — image moves.
7. Pick an icon color in the color picker — sparkle icon recolors. Click Reset — color returns.
8. Upload a second image; click the first thumbnail — active thumbnail switches and the background switches.
9. Hover a thumbnail, click ×, delete the currently active image → background switches to remaining image or hides.
10. Toggle Enabled off — image and color override both disappear. Toggle back on — both return.
11. Navigate inside claude.ai (start a new chat, return home) — newly rendered sparkle icons still get the treatment (MutationObserver).
12. Reopen the popup — all values persist.

If any step fails, file the defect and fix before marking this task done.

- [ ] **Step 4: Commit any fixes and tag**

```bash
git add -A
git commit -m "fix: address manual-test findings"   # only if fixes were needed
git tag v0.1.0
```

---

## Self-Review Notes

- Spec coverage: enable/disable ✓ (Task 7 toggle), size/opacity/offsets ✓ (Task 7 sliders), icon color ✓ (Task 7), upload ✓ (Task 7), content script injection + apply + observer ✓ (Task 4), manifest + icons ✓ (Task 5), popup styling per Claude design language ✓ (Task 6), no built-in art ✓ (omitted), no display mode ✓ (only always CSS in Task 4).
- Type consistency: `Config` fields identical between `types.ts` and the re-declared type inside `content.ts`. Storage keys `CONFIG_KEY`/`IMAGES_KEY` agree across files. `bindSlider`'s key union matches `Config` numeric fields.
- Placeholder scan: every step has exact code or exact commands.

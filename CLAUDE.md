# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # once
npm run build            # tsc → dist/*.js (required before loading the unpacked extension)
npm run watch            # tsc -w for iterative development
```

There is no test runner, linter, or bundler. The build is raw `tsc` emitting ES2020 modules into `dist/`. After every change to anything under `src/`, run `npm run build`, then reload the extension at `chrome://extensions` (and hard-reload `claude.ai` for content-script changes).

## Architecture

Manifest V3 Chrome extension that decorates the Claude sparkle icon on `https://claude.ai/*` with a user-uploaded background image.

Three runtime contexts share state exclusively through `chrome.storage`:

```
  popup (src/popup.ts) ──► chrome.storage.sync  [claudeLoadingArt → Config]
                      ──► chrome.storage.local [uploadedImages  → UploadedImage[]]
                                │
                                │ onChanged
                                ▼
  content script (src/content.ts) ──► DOM on claude.ai
```

- **`src/types.ts`** — the `Config` / `UploadedImage` shapes and `CONFIG_KEY` / `IMAGES_KEY`. Both are imported by popup and storage modules; content.ts intentionally re-declares them because it is not an ES module (see manifest).
- **`src/storage.ts`** — thin wrappers around `chrome.storage.sync` (config, 8 KB/item quota) and `chrome.storage.local` (images, no practical limit). Used only from the popup.
- **`src/popup.ts`** — renders and wires the popup UI (`src/popup.html` + `src/popup.css`). Writes to storage through `scheduleSave()` (throttled) and `flushSave()` (commit on interaction end).
- **`src/content.ts`** — injected into claude.ai at `document_idle`. Not a module; `tsc` emits it as a plain script. Guards against double-injection with `window.__claude_loading_art__`.

### How the content script decorates the sparkle

1. `MutationObserver` on `document.documentElement` → rAF-debounced `scanAndTag()`.
2. `scanAndTag` finds any `svg path[d^="m19.6 66.5"]` (the Claude sparkle path), walks up to the `.text-accent-brand.inline-block` sprite container, and up ≤ 4 hops to the nearest `aria-hidden="true"` ancestor — that ancestor becomes the **wrap**.
3. The wrap is stamped with `data-ca-wrap=""` and gets inline styles **only if currently static**:
   `position: relative; isolation: isolate; overflow: visible`. Do not force `z-index: 0` on it — that was an earlier attempt and disrupts Claude's own sprite/rotation animations whose wrapper may already be absolutely positioned.
4. A real `<div class="ca-bg-layer"><img class="ca-bg-img" /></div>` is appended inside the wrap. The `<img>` element is the reason the user's background is delivered via `img.src = dataUrl` rather than CSS: Chrome silently drops multi-MB data URLs assigned to CSS **custom properties** (`setProperty("--ca-image", ...)` returns empty). Small values (`--ca-size`, `--ca-display`, `--ca-ox/oy`, `--ca-opacity`) are still CSS vars on `:root`.
5. Icon colour is applied by setting `el.style.color` on the sprite container (tagged with `data-ca-icon`) — the SVG paths use `fill="currentColor"`.

### Storage write quota

`chrome.storage.sync` caps at **120 writes/minute**. The popup's pointermove / slider `input` / colour-picker `input` can easily fire 60/sec, so those paths must go through `scheduleSave()` (600 ms throttle, merges pending patches into one `set`). `flushSave()` is called on `pointerup` / slider `change` / colour `change` so the final value lands immediately.

### Common pitfalls when editing

- **Do not put the image data URL in a CSS variable.** The popup preview hit the same trap earlier; the fix is `element.style.backgroundImage = \`url("${dataUrl}")\`` (direct property, no custom prop) or an `<img src>`.
- **Do not write to `chrome.storage.sync` from any rapid event.** Use `scheduleSave` / `flushSave`.
- **Do not override the sparkle wrapper's `position` if Claude already set one.** `ensureWrapStyles` reads `getComputedStyle` and only sets `position: relative` when it is `static`.
- **`src/content.ts` is not an ES module.** It must not `import` anything and it must not rely on `export` — types are inlined.

## Docs referenced by this codebase

- `docs/plugin-spec.md` — original product spec (Chinese).
- `docs/superpowers/specs/2026-04-13-claude-loading-art-design.md` — design decisions versus the spec.
- `docs/superpowers/plans/2026-04-13-claude-loading-art.md` — historical implementation plan.

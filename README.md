# Claude Loading Art

A Chrome extension (Manifest V3) that decorates the sparkle icon on [claude.ai](https://claude.ai) with a custom background image of your choosing. Configure size, opacity, position, and the sparkle's own colour from a small popup UI.

## Features

- Upload one or more images (up to 4 MB each) and pick which one to show.
- Live-adjust background **size** (32–800 px) and **opacity** (0–100 %).
- Drag the background in the popup preview to reposition it behind the sparkle (the preview is 1:1 with the real page, so what you see is what you get).
- Change the sparkle icon colour, or reset to Claude's default.
- Global enable/disable toggle.
- All settings sync across your signed-in Chrome instances; images stay in local storage on each device.

## Install (unpacked)

Requires Node.js and npm.

```bash
git clone git@github.com:algerkong/claude-ass.git
cd claude-ass
npm install
npm run build
```

Then in Chrome:

1. Visit `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repository folder.
4. Open `https://claude.ai`. Click the extension icon to open the popup and upload a background image.

After editing any file under `src/`, run `npm run build` again and click the reload icon on the extension in `chrome://extensions`. Hard-reload the Claude tab (⌘/Ctrl + Shift + R) to pick up content-script changes.

## Development

```bash
npm run watch    # tsc in watch mode
```

Source lives in `src/`; compiled output lands in `dist/` (git-ignored). The manifest points at `dist/content.js` and `src/popup.html` (which loads `dist/popup.js`), so the extension can be loaded directly from the repo root.

See [`CLAUDE.md`](./CLAUDE.md) for architecture notes and gotchas.

## Project layout

```
manifest.json            MV3 manifest
src/
  content.ts             Content script (plain script, no imports)
  popup.ts / popup.html / popup.css   Popup UI
  storage.ts             chrome.storage wrappers
  types.ts               Config / UploadedImage types
icons/                   Extension icons (derived from the Claude sparkle)
docs/                    Spec and design notes
```

## Notes

- Matches only `https://claude.ai/*`. No permissions beyond `storage`.
- The background is rendered via an injected `<img>` so large images (multi-MB data URLs) are not silently dropped by the CSS custom-property size limit.
- Popup storage writes are throttled to stay under Chrome's 120 writes/minute `storage.sync` quota.

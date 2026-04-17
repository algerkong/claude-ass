import { Config, UploadedImage, DEFAULT_CONFIG } from "./types.js";
import {
  loadConfig,
  saveConfig,
  loadImages,
  saveImages,
  newImageId,
} from "./storage.js";

const $ = <T extends Element>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as unknown as T;
};

type El = {
  enabled: HTMLInputElement;
  preview: HTMLDivElement;
  thumbs: HTMLDivElement;
  upload: HTMLInputElement;
  drag: HTMLDivElement;
  dragBg: HTMLDivElement;
  bgSize: HTMLInputElement;
  bgSizeOut: HTMLOutputElement;
  bgOpacity: HTMLInputElement;
  bgOpacityOut: HTMLOutputElement;
  resetPos: HTMLButtonElement;
  svgColor: HTMLInputElement;
  svgColorText: HTMLInputElement;
  svgColorReset: HTMLButtonElement;
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// chrome.storage.sync caps at 120 writes/minute. Drag / slider `input` events
// can fire 60+ times per second, which trips the quota within seconds. We
// coalesce rapid patches into one write every THROTTLE_MS, and callers flush
// on interaction end (pointerup / slider change) so the final value lands.
const THROTTLE_MS = 600;
let pendingPatch: Partial<Config> = {};
let saveTimer: number | undefined;
let lastSaveAt = 0;

function scheduleSave(p: Partial<Config>) {
  pendingPatch = { ...pendingPatch, ...p };
  if (saveTimer !== undefined) return;
  const wait = Math.max(0, lastSaveAt + THROTTLE_MS - Date.now());
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    flushSave();
  }, wait);
}

function flushSave() {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (Object.keys(pendingPatch).length === 0) return;
  const toSave = pendingPatch;
  pendingPatch = {};
  lastSaveAt = Date.now();
  void patch(toSave);
}

let config: Config = { ...DEFAULT_CONFIG };
let images: UploadedImage[] = [];
let el!: El;

document.addEventListener("DOMContentLoaded", () => {
  el = {
    enabled: $("enabled"),
    preview: $("preview"),
    thumbs: $("thumbs"),
    upload: $("upload"),
    drag: $("drag"),
    dragBg: $("dragBg"),
    bgSize: $("bgSize"),
    bgSizeOut: $("bgSizeOut"),
    bgOpacity: $("bgOpacity"),
    bgOpacityOut: $("bgOpacityOut"),
    resetPos: $("resetPos"),
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
  el.svgColorText.value = config.svgColor;
  el.svgColor.value = /^#[0-9a-f]{6}$/i.test(config.svgColor)
    ? config.svgColor
    : "#d97757";

  renderPreview();
  renderThumbs();
  renderDrag();
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

function renderDrag() {
  const active = images.find((i) => i.id === config.selectedImage);
  el.dragBg.style.backgroundImage = active ? `url("${active.dataUrl}")` : "";
  el.dragBg.style.opacity = String(config.bgOpacity / 100);

  // 1:1 with the real page: icon stays 32px (from CSS), bg uses real bgSize,
  // offsets are real px. The .drag container has overflow:hidden so a large
  // bg just gets clipped — same as the real sparkle area.
  el.dragBg.style.width = `${config.bgSize}px`;
  el.dragBg.style.height = `${config.bgSize}px`;
  el.dragBg.style.transform =
    `translate(calc(-50% + ${config.offsetX}px), calc(-50% + ${config.offsetY}px))`;
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
  el.enabled.addEventListener("change", () => void patch({ enabled: el.enabled.checked }));

  bindSlider(el.bgSize, el.bgSizeOut, "bgSize", (v) => `${v}px`);
  bindSlider(el.bgOpacity, el.bgOpacityOut, "bgOpacity", (v) => `${v}%`);

  el.upload.addEventListener("change", () => void handleUpload());

  wireDrag();

  el.resetPos.addEventListener("click", () => {
    void patch({ offsetX: 0, offsetY: 0 });
  });

  el.svgColor.addEventListener("input", () => {
    el.svgColorText.value = el.svgColor.value;
    config = { ...config, svgColor: el.svgColor.value };
    scheduleSave({ svgColor: el.svgColor.value });
  });
  el.svgColor.addEventListener("change", flushSave);
  el.svgColorText.addEventListener("change", () => {
    const v = el.svgColorText.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) el.svgColor.value = v;
    flushSave();
    void patch({ svgColor: v });
  });
  el.svgColorReset.addEventListener("click", () => {
    el.svgColorText.value = "";
    el.svgColor.value = "#d97757";
    void patch({ svgColor: "" });
  });
}

function wireDrag() {
  let start: { x: number; y: number; ox: number; oy: number } | null = null;

  el.drag.addEventListener("pointerdown", (e) => {
    if (!images.find((i) => i.id === config.selectedImage)) return;
    start = {
      x: e.clientX,
      y: e.clientY,
      ox: config.offsetX,
      oy: config.offsetY,
    };
    el.drag.setPointerCapture(e.pointerId);
    el.drag.classList.add("is-dragging");
  });

  el.drag.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const ox = clamp(Math.round(start.ox + dx), -400, 400);
    const oy = clamp(Math.round(start.oy + dy), -400, 400);
    config = { ...config, offsetX: ox, offsetY: oy };
    renderDrag();
    scheduleSave({ offsetX: ox, offsetY: oy });
  });

  const end = (e: PointerEvent) => {
    if (!start) return;
    start = null;
    el.drag.classList.remove("is-dragging");
    if (el.drag.hasPointerCapture(e.pointerId)) {
      el.drag.releasePointerCapture(e.pointerId);
    }
    flushSave();
  };
  el.drag.addEventListener("pointerup", end);
  el.drag.addEventListener("pointercancel", end);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function bindSlider(
  input: HTMLInputElement,
  out: HTMLOutputElement,
  key: "bgSize" | "bgOpacity",
  fmt: (v: number) => string,
) {
  input.addEventListener("input", () => {
    const v = Number(input.value);
    out.value = fmt(v);
    config = { ...config, [key]: v };
    renderDrag();
    scheduleSave({ [key]: v } as Partial<Config>);
  });
  input.addEventListener("change", flushSave);
}

async function patch(p: Partial<Config>) {
  config = await saveConfig(p);
  // Keep drag preview in sync if a storage-driven update happens.
  renderDrag();
}

async function select(id: string) {
  await patch({ selectedImage: id });
  renderPreview();
  renderThumbs();
  renderDrag();
}

async function remove(id: string) {
  images = images.filter((i) => i.id !== id);
  await saveImages(images);
  if (config.selectedImage === id) {
    await patch({ selectedImage: images[0]?.id ?? "" });
  }
  renderPreview();
  renderThumbs();
  renderDrag();
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
  renderDrag();
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

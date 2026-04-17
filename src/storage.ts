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

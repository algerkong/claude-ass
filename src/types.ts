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

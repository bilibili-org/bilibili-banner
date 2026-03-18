// ─────────────────────── Banner 引擎相关 ───────────────────────

interface BaseLayer {
  src: string;
  width: number;
  height: number;
  transform: number[]; // [a, b, c, d, tx, ty]
  opacity?: number[]; // [default, LeftMax, RightMax]
  blur?: number | number[]; // number or [default, LeftMax, RightMax]
  xSpeed?: number;
  ySpeed?: number;
  scaleSpeed?: number;
  rotateSpeed?: number;
}

interface ImageLayer extends BaseLayer {
  type: "img";
}

interface VideoLayer extends BaseLayer {
  type: "video";
}

export interface SimpleVideoLayer {
  type: "simple-video";
  src: string;
}

export interface ParticleLayer {
  type: "particle";
  srcs: string[];
  count: number;
  speedRange: [number, number];
  angleRange: [number, number];
  scaleRange: [number, number];
  opacityRange: [number, number];
}

export type MotionLayer = ImageLayer | VideoLayer;

export type Layers = Array<MotionLayer | SimpleVideoLayer | ParticleLayer>;

// ─────────────────────── 数据加载器相关 ───────────────────────

interface ManifestConfig {
  name: string;
  path?: string;
}

export interface BannerManifestEntry {
  date: string;
  configs: ManifestConfig[];
}

export type BannerState = "loading" | "success" | "failed";

export interface BannerDetail {
  name: string;
  path: string;
  layers: Layers;
  state: BannerState;
}

export interface DailyBannerDetail {
  date: string;
  banners: BannerDetail[];
}

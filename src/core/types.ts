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

export interface ParticleLayer {
  type: "particle";
  srcs: string[];
  count: number;
  speedRange: [number, number];
  angleRange: [number, number];
  scaleRange: [number, number];
  opacityRange: [number, number];
}

export type MediaLayer = ImageLayer | VideoLayer;

export type Layers = Array<MediaLayer | ParticleLayer>;

// ─────────────────────── 数据加载器相关 ───────────────────────

export interface BannerRef {
  name: string;
  path: string;
}

export type BannerType =
  | "single-image"
  | "single-video"
  | "multi-layer"
  | "unknown";

export interface BannerConfig extends BannerRef {
  type: BannerType;
  layers: Layers;
}

export interface DailyBannerGroup {
  date: string;
  refs: BannerRef[];
}

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

  // 内部辅助数据
  _baseTransform?: string; // 预处理后的基础矩阵字符串
  _xSpeedCompensated?: number;
  _ySpeedCompensated?: number;
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

export interface BannerDetail {
  name: string;
  path: string;
  layers: Layers;
  /** 加载失败标记，true 时 layers 为空占位，不应触发渲染 */
  failed?: boolean;
}

export interface DailyBannerDetail {
  date: string;
  banners: BannerDetail[];
}

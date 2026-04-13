// V1 Layers ===============================================

interface BaseLayerV1 {
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

interface ImageLayerV1 extends BaseLayerV1 {
  type: "img";
}

interface VideoLayerV1 extends BaseLayerV1 {
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

export type MediaLayerV1 = ImageLayerV1 | VideoLayerV1;

export type LayersV1 = Array<MediaLayerV1 | ParticleLayer>;

export interface MultiLayerV1 {
  version: 1;
  /** 捕获数据时 banner 容器的宽度 */
  captureBannerWidth?: number;
  /** 捕获数据时 banner 容器的高度 */
  captureBannerHeight?: number;
  layers: LayersV1;
}

// V2 Layers ===============================================

export interface Resource {
  src: string;
  id?: number;
}

/** 贝塞尔曲线控制点*/
interface BaseProperty {
  offsetCurve?: [number, number, number, number];
}

/** 标量属性（scale / rotate）*/
export interface ScalarProperty extends BaseProperty {
  initial?: number;
  offset?: number;
}

/** 可折返的标量属性（blur / opacity）*/
export interface WrappableProperty extends ScalarProperty {
  wrap?: "clamp" | "alternate";
}

/** translate 属性*/
export interface TranslateProperty extends BaseProperty {
  initial?: [number, number];
  offset?: [number, number];
}

export interface LayersV2 {
  resources: Resource[];
  scale?: ScalarProperty;
  rotate?: ScalarProperty;
  translate?: TranslateProperty;
  blur?: WrappableProperty;
  opacity?: WrappableProperty;
  id?: number;
  name?: string;
}

export interface MultiLayerV2 {
  version: 2;
  layers: LayersV2[];
}

// Single Layer ===============================================

interface SingleLayer {
  src: string;
}

// Banner Config ===============================================

export type BannerType = "single-image" | "single-video" | "multi-layer";

export interface LogoConfig {
  logo?: {
    src: string;
  };
}

export interface MultiLayerBannerConfigV1 extends BannerRef, LogoConfig {
  type: "multi-layer";
  multiLayer: MultiLayerV1;
}

export interface MultiLayerBannerConfigV2 extends BannerRef, LogoConfig {
  type: "multi-layer";
  multiLayer: MultiLayerV2;
}

export interface SingleBannerConfig extends BannerRef, LogoConfig {
  type: "single-image" | "single-video";
  layer: SingleLayer;
}

export type BannerConfig =
  | MultiLayerBannerConfigV1
  | MultiLayerBannerConfigV2
  | SingleBannerConfig;

// loader ===============================================

export interface BannerRef {
  name: string;
  path: string;
}

export interface DailyBannerGroup {
  date: string;
  refs: BannerRef[];
}

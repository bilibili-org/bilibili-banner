// V1 Banner 类型 ===============================================

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

export type LayersV1 = Array<MediaLayer | ParticleLayer>;

// V2 Banner 类型 ===============================================

export interface V2Source {
  src: string;
  id?: number;
}

/** 贝塞尔曲线控制点*/
interface V2BaseProperty {
  offsetCurve?: [number, number, number, number];
}

/** 标量属性（scale / rotate）*/
export interface V2ScalarProperty extends V2BaseProperty {
  initial?: number;
  offset?: number;
}

/** 可折返的标量属性（blur / opacity）*/
export interface V2WrappableProperty extends V2ScalarProperty {
  wrap?: "clamp" | "alternate";
}

/** translate 属性*/
export interface V2TranslateProperty extends V2BaseProperty {
  initial?: [number, number];
  offset?: [number, number];
}

export interface LayersV2 {
  resources: V2Source[];
  scale?: V2ScalarProperty;
  rotate?: V2ScalarProperty;
  translate?: V2TranslateProperty;
  blur?: V2WrappableProperty;
  opacity?: V2WrappableProperty;
  id?: number;
  name?: string;
}

export type BannerType =
  | "single-image"
  | "single-video"
  | "multi-layer"
  | "unknown";

export interface BannerConfigV1 extends BannerRef {
  version: 1;
  type: BannerType;
  layers: LayersV1;
}

export interface BannerConfigV2 extends BannerRef {
  version: 2;
  layers: LayersV2[];
}

export type BannerConfig = BannerConfigV1 | BannerConfigV2;

// loader ===============================================

export interface BannerRef {
  name: string;
  path: string;
}

export interface DailyBannerGroup {
  date: string;
  refs: BannerRef[];
}

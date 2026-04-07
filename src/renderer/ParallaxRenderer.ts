import type { BannerConfigV1, MediaLayer, ParticleLayer } from "../types";
import type { BaseRenderer } from "./BaseRenderer";
import { releaseVideoElement } from "./helper";
import ParticleSystem from "./ParticleSystem";

interface ParallaxState {
  initX: number;
  moveX: number;
  startTime: number;
  rafId: number;
}

type MotionLayerExtra = MediaLayer & {
  _baseTransform?: string;
  _xSpeedCompensated?: number;
  _ySpeedCompensated?: number;
};

export class ParallaxRenderer implements BaseRenderer {
  private static readonly DEG2RAD: number = 180 / Math.PI;
  private static readonly DEFAULT_ANIMATION_DURATION: number = 300;
  private static readonly DEFAULT_CAPTURE_BANNER_WIDTH: number = 1650;
  private static readonly DEFAULT_CAPTURE_BANNER_HEIGHT: number = 160;

  private _particleSystem: ParticleSystem | null = null;
  private _particleCanvas: HTMLCanvasElement | null = null;
  private bannerContainer: HTMLElement | null = null;

  private layersExtra: MotionLayerExtra[] = [];
  private layers: NodeListOf<HTMLElement> | null = null;
  private widthCompensation: number = 1;
  private heightCompensation: number = 1;
  private captureBannerWidth: number =
    ParallaxRenderer.DEFAULT_CAPTURE_BANNER_WIDTH;
  private captureBannerHeight: number =
    ParallaxRenderer.DEFAULT_CAPTURE_BANNER_HEIGHT;
  private hasParticle: boolean = false;
  private state: ParallaxState = {
    initX: 0,
    moveX: 0,
    startTime: 0,
    rafId: 0,
  };

  private _boundMouseEnter: (e: MouseEvent) => void;
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundMouseLeave: () => void;
  private _boundResize: () => void;
  private _boundBlur: () => void;
  private _resetPosition: (timestamp: DOMHighResTimeStamp) => void;

  constructor() {
    this._boundMouseEnter = this._handleMouseEnter.bind(this);
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseLeave = this._handleMouseLeave.bind(this);
    this._boundResize = this._handleResize.bind(this);
    this._boundBlur = this._handleMouseLeave.bind(this);
    this._resetPosition = this._resetPositionInternal.bind(this);
  }

  public render(container: HTMLElement, bannerConfig?: BannerConfigV1): void {
    if (!bannerConfig) return;

    this.dispose();
    this.bannerContainer = container;
    this.captureBannerWidth =
      bannerConfig.captureBannerWidth && bannerConfig.captureBannerWidth > 0
        ? bannerConfig.captureBannerWidth
        : ParallaxRenderer.DEFAULT_CAPTURE_BANNER_WIDTH;
    this.captureBannerHeight =
      bannerConfig.captureBannerHeight && bannerConfig.captureBannerHeight > 0
        ? bannerConfig.captureBannerHeight
        : ParallaxRenderer.DEFAULT_CAPTURE_BANNER_HEIGHT;

    this.bannerContainer.addEventListener("mouseenter", this._boundMouseEnter);
    this.bannerContainer.addEventListener("mousemove", this._boundMouseMove);
    this.bannerContainer.addEventListener("mouseleave", this._boundMouseLeave);
    window.addEventListener("resize", this._boundResize);
    window.addEventListener("blur", this._boundBlur);

    this._updateLayoutCompensation();

    const motionLayers = bannerConfig.layers.filter(
      (item): item is MediaLayer =>
        item.type === "img" || item.type === "video",
    );
    const particleConfig =
      bannerConfig.layers.find(
        (item): item is ParticleLayer => item.type === "particle",
      ) || null;

    this.hasParticle = !!particleConfig;

    this._initParallaxData(motionLayers);
    this._renderParallax();

    if (particleConfig && this.bannerContainer && this._particleCanvas) {
      const ps = new ParticleSystem(this._particleCanvas, particleConfig);
      this._particleSystem = ps;
      void ps.start().catch((e) => {
        console.error("[ParallaxRenderer] 粒子层初始化失败，已降级跳过。", e);
        if (this._particleSystem === ps) {
          this._particleSystem.dispose();
          this._particleSystem = null;
        }
      });
    }
  }

  private _stopAnimation(): void {
    if (this.state.rafId) {
      cancelAnimationFrame(this.state.rafId);
      this.state.rafId = 0;
    }
  }

  private _getContainerWidth(): number {
    const containerWidth = this.bannerContainer?.clientWidth ?? 0;
    return containerWidth > 0
      ? containerWidth
      : ParallaxRenderer.DEFAULT_CAPTURE_BANNER_WIDTH;
  }

  private _getContainerHeight(): number {
    const containerHeight = this.bannerContainer?.clientHeight ?? 0;
    return containerHeight > 0 ? containerHeight : this.captureBannerHeight;
  }

  private _getMotionRatio(moveX: number): number {
    return Math.min(Math.abs((moveX / this._getContainerWidth()) * 2), 1);
  }

  private _getLayoutCompensation(): number {
    return this.widthCompensation * this.heightCompensation;
  }

  private _updateLayoutCompensation(): void {
    const containerWidth = this._getContainerWidth();
    this.widthCompensation =
      containerWidth > this.captureBannerWidth
        ? containerWidth / this.captureBannerWidth
        : 1;

    const containerHeight = this._getContainerHeight();
    this.heightCompensation = containerHeight / this.captureBannerHeight;
  }

  private _destroyVideos(): void {
    if (this.bannerContainer) {
      const videos = this.bannerContainer.querySelectorAll("video");
      videos.forEach((video) => {
        releaseVideoElement(video);
      });
    }
  }

  public dispose(): void {
    this._stopAnimation();
    this._destroyVideos();
    this._particleSystem?.dispose();
    this._particleSystem = null;
    this._particleCanvas = null;
    if (this.bannerContainer) {
      this.bannerContainer.removeEventListener(
        "mouseenter",
        this._boundMouseEnter,
      );
      this.bannerContainer.removeEventListener(
        "mousemove",
        this._boundMouseMove,
      );
      this.bannerContainer.removeEventListener(
        "mouseleave",
        this._boundMouseLeave,
      );
      this.bannerContainer.innerHTML = "";
    }
    window.removeEventListener("resize", this._boundResize);
    window.removeEventListener("blur", this._boundBlur);

    this.layersExtra = [];
    this.layers = null;
    this.widthCompensation = 1;
    this.heightCompensation = 1;
    this.captureBannerWidth = ParallaxRenderer.DEFAULT_CAPTURE_BANNER_WIDTH;
    this.captureBannerHeight = ParallaxRenderer.DEFAULT_CAPTURE_BANNER_HEIGHT;
  }

  private _createLayerElement(
    item: MediaLayer,
  ): HTMLImageElement | HTMLVideoElement {
    if (item.type === "video") {
      const child = document.createElement("video");
      child.loop = true;
      child.autoplay = true;
      child.muted = true;
      child.playsInline = true;
      child.src = import.meta.env.BASE_URL + item.src.replace(/^\//, "");
      return child;
    } else {
      const child = document.createElement("img");
      child.src = import.meta.env.BASE_URL + item.src.replace(/^\//, "");
      return child;
    }
  }

  private _initParallaxData(layers: MediaLayer[]): void {
    const layoutCompensation = this._getLayoutCompensation();

    this.layersExtra = layers
      .filter((item) => {
        const op = item.opacity;
        return !(op && op[0] === 0 && op[1] === 0 && op[2] === 0);
      })
      .map((item) => {
        const baseTransform = [...item.transform];
        baseTransform[4] *= layoutCompensation;
        baseTransform[5] *= layoutCompensation;

        const _baseTransform = `matrix(${baseTransform[0]}, ${baseTransform[1]}, ${baseTransform[2]}, ${baseTransform[3]}, ${baseTransform[4]}, ${baseTransform[5]})`;

        const op = item.opacity;
        const opacity =
          op && (op[0] !== 1 || op[1] !== 1 || op[2] !== 1) ? op : undefined;

        return {
          ...item,
          opacity,
          _baseTransform,
          _xSpeedCompensated:
            item.xSpeed !== undefined
              ? item.xSpeed * this.heightCompensation
              : undefined,
          _ySpeedCompensated: (item.ySpeed || 0) * this.heightCompensation,
        };
      });
  }

  private _renderParallax(): void {
    if (!this.bannerContainer) return;
    const layoutCompensation = this._getLayoutCompensation();

    if (this.layers && this.layers.length > 0) {
      for (let i = 0; i < this.layers.length; i++) {
        const item = this.layersExtra[i];
        const child = this.layers[i].firstElementChild as HTMLElement;
        if (child) {
          child.style.width = `${item.width * layoutCompensation}px`;
          child.style.height = `${item.height * layoutCompensation}px`;
        }
        if (item._baseTransform) {
          this.layers[i].style.transform = item._baseTransform;
        }
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < this.layersExtra.length; i++) {
      const item = this.layersExtra[i];
      const layer = document.createElement("div");
      layer.className = "layer";
      if (item._baseTransform) {
        layer.style.transform = item._baseTransform;
      }
      if (item.opacity) layer.style.opacity = String(item.opacity[0]);

      const child = this._createLayerElement(item);
      if (item.blur !== undefined) {
        const initialBlur = Array.isArray(item.blur) ? item.blur[0] : item.blur;
        child.style.filter = `blur(${initialBlur}px)`;
      }
      child.style.width = `${item.width * layoutCompensation}px`;
      child.style.height = `${item.height * layoutCompensation}px`;

      layer.appendChild(child);
      fragment.appendChild(layer);
    }

    if (this.bannerContainer) {
      this.bannerContainer.innerHTML = "";
      this.bannerContainer.appendChild(fragment);
      this.layers = this.bannerContainer.querySelectorAll(".layer");

      if (this.hasParticle) {
        const canvas = document.createElement("canvas");
        canvas.width = this.bannerContainer.clientWidth;
        canvas.height = this.bannerContainer.clientHeight;
        canvas.className = "particle-canvas";
        this.bannerContainer.appendChild(canvas);
        this._particleCanvas = canvas;
      }
    }
  }

  private _lerp(start: number, end: number, amt: number): number {
    return (1 - amt) * start + amt * end;
  }

  private _animate(progress?: number): void {
    if (!this.layers || this.layers.length <= 0) return;
    const isHoming = typeof progress === "number";
    const moveX = this.state.moveX;

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const item = this.layersExtra[i];

      const a = item._xSpeedCompensated || 0;

      let currentMoveX = moveX;
      if (isHoming) {
        currentMoveX = this._lerp(moveX, 0, progress as number);
      }

      const move = currentMoveX * a;
      const s = item.scaleSpeed ? item.scaleSpeed * currentMoveX + 1 : 1;
      const g = currentMoveX * (item._ySpeedCompensated || 0);

      let finalTransform = `${item._baseTransform} matrix(${s}, 0, 0, ${s}, ${move}, ${g})`;

      if (item.rotateSpeed) {
        const currentDeg = isHoming
          ? this._lerp(item.rotateSpeed * moveX, 0, progress as number)
          : item.rotateSpeed * moveX;
        finalTransform += ` rotate(${currentDeg * ParallaxRenderer.DEG2RAD}deg)`;
      }

      layer.style.transform = finalTransform;

      if (item.opacity) {
        if (item.opacity.length !== 3) {
          throw new Error(
            `[BannerEngine] Invalid opacity length: expected 3, got ${item.opacity.length}`,
          );
        }
        const opDef = item.opacity[0];
        const opLeft = item.opacity[1];
        const opRight = item.opacity[2];

        const ratio = this._getMotionRatio(currentMoveX);
        const targetOpacity =
          currentMoveX < 0
            ? this._lerp(opDef, opLeft, ratio)
            : this._lerp(opDef, opRight, ratio);

        layer.style.opacity = String(targetOpacity);
      }

      if (Array.isArray(item.blur)) {
        if (item.blur.length !== 3) {
          throw new Error(
            `[BannerEngine] Invalid blur length: expected 3, got ${item.blur.length}`,
          );
        }
        const blurDef = item.blur[0];
        const blurLeft = item.blur[1];
        const blurRight = item.blur[2];

        const ratio = this._getMotionRatio(currentMoveX);
        const targetBlur =
          currentMoveX < 0
            ? this._lerp(blurDef, blurLeft, ratio)
            : this._lerp(blurDef, blurRight, ratio);

        const child = layer.firstElementChild as HTMLElement;
        if (child) {
          child.style.filter = `blur(${targetBlur}px)`;
        }
      }
    }
  }

  private _handleMouseEnter(e: MouseEvent): void {
    this.state.initX = e.pageX;
  }

  private _handleMouseMove(e: MouseEvent): void {
    this.state.moveX = e.pageX - this.state.initX;

    this._stopAnimation();
    this.state.rafId = requestAnimationFrame(() => this._animate());
  }

  private _handleMouseLeave(): void {
    this.state.startTime = 0;
    this._stopAnimation();
    this.state.rafId = requestAnimationFrame(this._resetPosition);
  }

  private _handleResize(): void {
    this._updateLayoutCompensation();
    this._initParallaxData(this.layersExtra);
    this._renderParallax();
    if (this.bannerContainer && this._particleCanvas) {
      this._particleSystem?.resize(
        this.bannerContainer.clientWidth,
        this.bannerContainer.clientHeight,
      );
    }
  }

  private _easeOutQuart(x: number): number {
    return 1 - (1 - x) ** 4;
  }

  private _resetPositionInternal(timestamp: DOMHighResTimeStamp): void {
    if (!this.state.startTime) this.state.startTime = timestamp;
    const elapsed = timestamp - this.state.startTime;
    const progress = Math.min(
      elapsed / ParallaxRenderer.DEFAULT_ANIMATION_DURATION,
      1,
    );
    const easeProgress = this._easeOutQuart(progress);

    this._animate(easeProgress);
    if (progress < 1) {
      this.state.rafId = requestAnimationFrame(this._resetPosition);
    } else {
      this.state.rafId = 0;
      this.state.moveX = 0;
    }
  }
}

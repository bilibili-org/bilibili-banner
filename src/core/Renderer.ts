import ParticleSystem from "./ParticleSystem";
import type {
  BannerDetail,
  MotionLayer,
  ParticleLayer,
  SimpleVideoLayer,
} from "./types";

export interface BaseRenderer {
  render(container: HTMLElement, detail: BannerDetail): void;
  dispose(): void;
}

export class LoadingRenderer implements BaseRenderer {
  public render(container: HTMLElement, _detail: BannerDetail): void {
    container.innerHTML = "";
  }

  public dispose(): void {}
}

export class FailedRenderer implements BaseRenderer {
  public render(container: HTMLElement, _detail: BannerDetail): void {
    container.innerHTML = "";
  }

  public dispose(): void {}
}

export class SimpleVideoRenderer implements BaseRenderer {
  private video: HTMLVideoElement | null = null;
  private wrapper: HTMLElement | null = null;

  public render(container: HTMLElement, detail: BannerDetail): void {
    const simpleVideoItem = detail.layers.find(
      (item): item is SimpleVideoLayer => item.type === "simple-video",
    );
    if (!simpleVideoItem) return;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "simple-video-container";

    this.video = document.createElement("video");
    this.video.src =
      import.meta.env.BASE_URL + simpleVideoItem.src.replace(/^\//, "");
    this.video.loop = true;
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;

    this.wrapper.appendChild(this.video);
    container.innerHTML = "";
    container.appendChild(this.wrapper);
  }

  public dispose(): void {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video = null;
    }
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
  }
}

interface ParallaxState {
  initX: number;
  moveX: number;
  startTime: number;
  rafId: number;
}

type MotionLayerExtra = MotionLayer & {
  _baseTransform?: string;
  _xSpeedCompensated?: number;
  _ySpeedCompensated?: number;
};

export class ParallaxRenderer implements BaseRenderer {
  private static readonly DEG2RAD: number = 180 / Math.PI;
  private static readonly DEFAULT_ANIMATION_DURATION: number = 300;
  private static readonly DEFAULT_SCREEN_WIDTH: number = 1650;

  private bannerContainer: HTMLElement | null = null;
  private layersExtra: MotionLayerExtra[] = [];
  private layers: NodeListOf<HTMLElement> | null = null;
  private viewCompensation: number = 1;

  private _particleSystem: ParticleSystem | null = null;
  private _particleCanvas: HTMLCanvasElement | null = null;

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

  public render(container: HTMLElement, detail: BannerDetail): void {
    this.dispose();
    this.bannerContainer = container;

    this.bannerContainer.addEventListener("mouseenter", this._boundMouseEnter);
    this.bannerContainer.addEventListener("mousemove", this._boundMouseMove);
    this.bannerContainer.addEventListener("mouseleave", this._boundMouseLeave);
    window.addEventListener("resize", this._boundResize);
    window.addEventListener("blur", this._boundBlur);

    this._updateViewCompensation();

    const motionLayers = detail.layers.filter(
      (item): item is MotionLayer =>
        item.type === "img" || item.type === "video",
    );
    const particleConfig =
      detail.layers.find(
        (item): item is ParticleLayer => item.type === "particle",
      ) || null;

    this._initParallaxData(motionLayers);
    this._renderParallax();

    if (particleConfig && this.bannerContainer && this._particleCanvas) {
      const ps = new ParticleSystem(this._particleCanvas, particleConfig);
      this._particleSystem = ps;
      ps.start();
    }
  }

  private _stopAnimation(): void {
    if (this.state.rafId) {
      cancelAnimationFrame(this.state.rafId);
      this.state.rafId = 0;
    }
  }

  private _updateViewCompensation(): void {
    this.viewCompensation =
      window.innerWidth > ParallaxRenderer.DEFAULT_SCREEN_WIDTH
        ? window.innerWidth / ParallaxRenderer.DEFAULT_SCREEN_WIDTH
        : 1;
  }

  private _destroyVideos(): void {
    if (this.bannerContainer) {
      const videos = this.bannerContainer.querySelectorAll("video");
      videos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
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
  }

  private _createLayerElement(
    item: MotionLayer,
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

  private _initParallaxData(layers: MotionLayer[]): void {
    this.layersExtra = layers
      .filter((item) => {
        const op = item.opacity;
        return !(op && op[0] === 0 && op[1] === 0 && op[2] === 0);
      })
      .map((item) => {
        const baseTransform = [...item.transform];
        baseTransform[4] *= this.viewCompensation;
        baseTransform[5] *= this.viewCompensation;

        const _baseTransform = `matrix(${baseTransform[0]}, ${baseTransform[1]}, ${baseTransform[2]}, ${baseTransform[3]}, ${baseTransform[4]}, ${baseTransform[5]})`;

        const op = item.opacity;
        const opacity =
          op && (op[0] !== 1 || op[1] !== 1 || op[2] !== 1) ? op : undefined;

        return {
          ...item,
          opacity,
          _baseTransform,
          _xSpeedCompensated: item.xSpeed,
          _ySpeedCompensated: item.ySpeed || 0,
        };
      });
  }

  private _renderParallax(): void {
    if (!this.bannerContainer) return;

    if (this.layers && this.layers.length > 0) {
      for (let i = 0; i < this.layers.length; i++) {
        const item = this.layersExtra[i];
        const child = this.layers[i].firstElementChild as HTMLElement;
        if (child) {
          child.style.width = `${item.width * this.viewCompensation}px`;
          child.style.height = `${item.height * this.viewCompensation}px`;
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
      child.style.width = `${item.width * this.viewCompensation}px`;
      child.style.height = `${item.height * this.viewCompensation}px`;

      layer.appendChild(child);
      fragment.appendChild(layer);
    }

    if (this.bannerContainer) {
      this.bannerContainer.innerHTML = "";
      this.bannerContainer.appendChild(fragment);
      this.layers = this.bannerContainer.querySelectorAll(".layer");

      const canvas = document.createElement("canvas");
      canvas.width = this.bannerContainer.clientWidth;
      canvas.height = this.bannerContainer.clientHeight;
      canvas.className = "particle-canvas";
      this.bannerContainer.appendChild(canvas);
      this._particleCanvas = canvas;
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

        const ratio = Math.min(
          Math.abs((currentMoveX / window.innerWidth) * 2),
          1,
        );
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

        const ratio = Math.min(
          Math.abs((currentMoveX / window.innerWidth) * 2),
          1,
        );
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
    this._updateViewCompensation();
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

import ParticleSystem from "./ParticleSystem";
import type {
  Layers,
  MotionLayer,
  ParticleLayer,
  SimpleVideoLayer,
} from "./types";

interface EngineState {
  initX: number;
  moveX: number;
  startTime: number;
  rafId: number;
}

interface EngineConfig {
  duration: number;
  baseWidth: number;
}

export default class BannerEngine {
  private container: HTMLElement | null;
  private allLayersData: MotionLayer[] = [];
  private layers: NodeListOf<HTMLElement> | null = null;
  private compensate: number = 1;
  private simpleVideoMode: boolean = false;
  private static readonly DEG2RAD: number = 180 / Math.PI;

  private _particleSystem: ParticleSystem | null = null;
  private _particleCanvas: HTMLCanvasElement | null = null;

  private state: EngineState = {
    initX: 0,
    moveX: 0,
    startTime: 0,
    rafId: 0,
  };

  private config: EngineConfig = {
    duration: 300,
    baseWidth: 1650,
  };

  private _boundMouseEnter: (e: MouseEvent) => void;
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundMouseLeave: () => void;
  private _boundResize: () => void;
  private _boundBlur: () => void;

  /**
   * @param {string} containerSelector - Banner 容器的 CSS 选择器
   */
  constructor(containerSelector: string) {
    this.container = document.querySelector(containerSelector);

    this._boundMouseEnter = this._handleMouseEnter.bind(this);
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseLeave = this._handleMouseLeave.bind(this);
    this._boundResize = this._handleResize.bind(this);
    this._boundBlur = this._handleMouseLeave.bind(this);
    this._resetPosition = this._resetPosition.bind(this);
  }

  /**
   * 启动引擎：绑定全局事件
   */
  public start(): void {
    if (!this.container) return;
    this.container.addEventListener("mouseenter", this._boundMouseEnter);
    this.container.addEventListener("mousemove", this._boundMouseMove);
    this.container.addEventListener("mouseleave", this._boundMouseLeave);
    window.addEventListener("resize", this._boundResize);
    window.addEventListener("blur", this._boundBlur);
  }

  private _stopAnimation(): void {
    if (this.state.rafId) {
      cancelAnimationFrame(this.state.rafId);
      this.state.rafId = 0;
    }
  }

  private _calcCompensate(): void {
    this.compensate =
      window.innerWidth > this.config.baseWidth
        ? window.innerWidth / this.config.baseWidth
        : 1;
  }

  private _destroyVideos(): void {
    if (this.container) {
      const videos = this.container.querySelectorAll("video");
      videos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
      });
    }
  }

  /**
   * 安全销毁：清空DOM，注销事件，取消动画帧，解决内存泄漏
   */
  public destroy(): void {
    this._stopAnimation();
    this._destroyVideos();
    this._particleSystem?.dispose();
    this._particleSystem = null;
    this._particleCanvas = null;
    if (this.container) {
      this.container.removeEventListener("mouseenter", this._boundMouseEnter);
      this.container.removeEventListener("mousemove", this._boundMouseMove);
      this.container.removeEventListener("mouseleave", this._boundMouseLeave);
      this.container.innerHTML = "";
    }
    window.removeEventListener("resize", this._boundResize);
    window.removeEventListener("blur", this._boundBlur);

    this.allLayersData = [];
    this.layers = null;
  }

  /**
   * 更新数据源并重新渲染 (防腐层 + 策略路由)
   * @param {Layers} dto - 必须接受格式化后的标准数据
   */
  public updateData(dto: Layers): void {
    this._stopAnimation();
    this._destroyVideos();
    this._particleSystem?.dispose();
    this._particleSystem = null;
    this._particleCanvas = null;

    this.layers = null;

    const rawPayload = dto;

    // 检测是否存在 simple-video 层，存在则进入单视频模式
    const simpleVideoItem = rawPayload.find(
      (item): item is SimpleVideoLayer => item.type === "simple-video",
    );

    if (simpleVideoItem) {
      this.simpleVideoMode = true;
      this.allLayersData = [];
      this._renderSimpleVideo(simpleVideoItem.src);
      return;
    }

    this.simpleVideoMode = false;
    this._calcCompensate();

    const motionLayers = rawPayload.filter(
      (item): item is MotionLayer =>
        item.type === "img" || item.type === "video",
    );
    const particleConfig =
      rawPayload.find(
        (item): item is ParticleLayer => item.type === "particle",
      ) || null;
    this._initParallaxData(motionLayers);
    this._renderParallax();

    if (particleConfig && this.container && this._particleCanvas) {
      const ps = new ParticleSystem(this._particleCanvas, particleConfig);
      this._particleSystem = ps;
      ps.start();
    }
  }

  /**
   * 显示加载失败占位界面
   */
  public showLoadFailed(): void {
    this._stopAnimation();
    this._destroyVideos();
    this._particleSystem?.dispose();
    this._particleSystem = null;
    this._particleCanvas = null;
    this.layers = null;
    this.allLayersData = [];

    if (!this.container) return;
    this.container.innerHTML = `
      <div class="load-failed-banner">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p class="load-failed-title">Load Failed</p>
      </div>
    `;
  }

  // ─────────────────────── 微观构建工厂 (DOM Factory) ───────────────────────

  private _createLayerElement(
    item: MotionLayer,
  ): HTMLImageElement | HTMLVideoElement {
    if (item.type === "video") {
      const child = document.createElement("video");
      child.loop = true;
      child.autoplay = true;
      child.muted = true;
      child.playsInline = true; // 补齐遗漏的重要移动端播放属性
      child.src = import.meta.env.BASE_URL + item.src.replace(/^\//, "");
      return child;
    } else {
      const child = document.createElement("img");
      child.src = import.meta.env.BASE_URL + item.src.replace(/^\//, "");
      return child;
    }
  }

  private _initParallaxData(layers: MotionLayer[]): void {
    this.allLayersData = layers
      // opacity 三值全为 0 → 该层永久不可见，无需渲染
      .filter((item) => {
        const op = item.opacity;
        return !(op && op[0] === 0 && op[1] === 0 && op[2] === 0);
      })
      .map((item) => {
        const baseTransform = [...item.transform];
        baseTransform[4] *= this.compensate;
        baseTransform[5] *= this.compensate;

        // 预先组装最内层的基础矩阵变换字符串备用
        const _baseTransform = `matrix(${baseTransform[0]}, ${baseTransform[1]}, ${baseTransform[2]}, ${baseTransform[3]}, ${baseTransform[4]}, ${baseTransform[5]})`;

        // opacity 三值全为 1 → 恒显示，移除字段使 _animate 直接跳过
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

  /**
   * 单视频模式渲染管线
   */
  private _renderSimpleVideo(src: string): void {
    if (!this.container) return;
    const wrapper = document.createElement("div");
    wrapper.className = "simple-video-container";

    const video = document.createElement("video");
    video.src = import.meta.env.BASE_URL + src.replace(/^\//, "");
    video.loop = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    wrapper.appendChild(video);
    if (this.container) {
      this.container.innerHTML = "";
      this.container.appendChild(wrapper);
    }
  }

  /**
   * 多图层视差渲染管线
   */
  private _renderParallax(): void {
    if (!this.container) return;

    // 窗口尺寸变化时的快速更新
    if (this.layers && this.layers.length > 0) {
      for (let i = 0; i < this.layers.length; i++) {
        const item = this.allLayersData[i];
        const child = this.layers[i].firstElementChild as HTMLElement;
        if (child) {
          child.style.width = `${item.width * this.compensate}px`;
          child.style.height = `${item.height * this.compensate}px`;
        }
        if (item._baseTransform) {
          this.layers[i].style.transform = item._baseTransform;
        }
      }
      return;
    }

    // 首次渲染
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < this.allLayersData.length; i++) {
      const item = this.allLayersData[i];
      const layer = document.createElement("div");
      layer.className = "layer";
      if (item._baseTransform) {
        layer.style.transform = item._baseTransform;
      }
      if (item.opacity) layer.style.opacity = String(item.opacity[0]);

      // 启用制造工厂
      const child = this._createLayerElement(item);
      if (item.blur !== undefined) {
        const initialBlur = Array.isArray(item.blur) ? item.blur[0] : item.blur;
        child.style.filter = `blur(${initialBlur}px)`;
      }
      child.style.width = `${item.width * this.compensate}px`;
      child.style.height = `${item.height * this.compensate}px`;

      layer.appendChild(child);
      fragment.appendChild(layer);
    }

    if (this.container) {
      this.container.innerHTML = "";
      this.container.appendChild(fragment);
      this.layers = this.container.querySelectorAll(".layer");

      // 创建粒子画布（浮层，不干扰鼠标交互）
      const canvas = document.createElement("canvas");
      canvas.width = this.container.clientWidth;
      canvas.height = this.container.clientHeight;
      canvas.className = "particle-canvas";
      this.container.appendChild(canvas);
      this._particleCanvas = canvas;
    }
  }

  /**
   * 线性插值
   */
  private _lerp(start: number, end: number, amt: number): number {
    return (1 - amt) * start + amt * end;
  }

  /**
   * 物理动画引擎（脱离 DOMMatrix，纯数值运算）
   * @param {number} [progress] - 自动回正帧进度 0-1
   */
  private _animate(progress?: number): void {
    if (!this.layers || this.layers.length <= 0) return;
    const isHoming = typeof progress === "number";
    const moveX = this.state.moveX;

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const item = this.allLayersData[i];

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
        finalTransform += ` rotate(${currentDeg * BannerEngine.DEG2RAD}deg)`;
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

      // 处理动态 blur
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

  // ─────────────────────── 鼠标及系统事件处理器 ───────────────────────

  private _handleMouseEnter(e: MouseEvent): void {
    if (this.simpleVideoMode) return;
    this.state.initX = e.pageX;
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (this.simpleVideoMode) return;
    this.state.moveX = e.pageX - this.state.initX;

    this._stopAnimation();
    this.state.rafId = requestAnimationFrame(() => this._animate());
  }

  private _handleMouseLeave(): void {
    if (this.simpleVideoMode) return;
    this.state.startTime = 0;
    this._stopAnimation();
    this.state.rafId = requestAnimationFrame(this._resetPosition);
  }

  private _handleResize(): void {
    if (this.simpleVideoMode) return;
    this._calcCompensate();
    this._initParallaxData(this.allLayersData);
    this._renderParallax();
    if (this.container && this._particleCanvas) {
      this._particleSystem?.resize(
        this.container.clientWidth,
        this.container.clientHeight,
      );
    }
  }

  private _easeOutQuart(x: number): number {
    return 1 - (1 - x) ** 4;
  }

  private _resetPosition(timestamp: DOMHighResTimeStamp): void {
    if (!this.state.startTime) this.state.startTime = timestamp;
    const elapsed = timestamp - this.state.startTime;
    const progress = Math.min(elapsed / this.config.duration, 1);
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

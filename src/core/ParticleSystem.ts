import type { ParticleLayer } from "./types";

interface Particle {
  image: HTMLImageElement;
  x: number;
  y: number;
  speed: number;
  drift: number; // 水平漂移速度 px/frame
  scale: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export default class ParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: ParticleLayer;
  private particles: Particle[] = [];
  private images: HTMLImageElement[] = [];
  private rafId: number = 0;
  private disposed: boolean = false;

  constructor(canvas: HTMLCanvasElement, config: ParticleLayer) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not get 2D context from canvas");
    }

    this.ctx = context;
    this.config = config;
  }

  /**
   * 异步预加载图片，加载完成后自动开始动画
   */
  public async start(): Promise<void> {
    await this._loadImages();
    if (this.disposed) return;
    this._initParticles();
    this._tick();
  }

  /**
   * 停止动画帧并清空 canvas
   */
  public dispose(): void {
    this.disposed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles = [];
    this.images = [];
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    // 粒子的 x 范围也随之适配
    for (const p of this.particles) {
      if (p.x > width) p.x = rand(0, width);
    }
  }

  private async _loadImages(): Promise<void> {
    const loads = this.config.srcs.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = import.meta.env.BASE_URL + src.replace(/^\//, "");
        }),
    );
    this.images = await Promise.all(loads);
  }

  private _initParticles(): void {
    const { count, speedRange, angleRange, scaleRange, opacityRange } =
      this.config;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.particles = Array.from({ length: count }, () => {
      const img = this.images[Math.floor(Math.random() * this.images.length)];
      const scale = rand(scaleRange[0], scaleRange[1]);
      const angleDeg = rand(angleRange[0], angleRange[1]);
      const speed = rand(speedRange[0], speedRange[1]);
      // 将角度转换成 x/y 分量的速度比例
      const drift = speed * Math.tan((angleDeg * Math.PI) / 180);

      return {
        image: img,
        x: rand(0, w),
        y: rand(-h, 0), // 初始分散在视口上方，让落点时机错开
        speed,
        drift,
        scale,
        opacity: rand(opacityRange[0], opacityRange[1]),
        rotation: rand(0, Math.PI * 2),
        rotationSpeed: rand(-0.02, 0.02),
        width: img.naturalWidth * scale,
        height: img.naturalHeight * scale,
      } as Particle;
    });
  }

  private _tick = (): void => {
    if (this.disposed) return;

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    for (const p of this.particles) {
      p.y += p.speed;
      p.x += p.drift;
      p.rotation += p.rotationSpeed;

      // 超出左右边界则从对侧重新进入（环形穿越）
      if (p.y > height + p.height) {
        p.y = -p.height;
        p.x = rand(0, width);
      }

      if (p.x > width + p.width) p.x = -p.width;
      else if (p.x < -p.width) p.x = width;

      this.ctx.save();
      this.ctx.globalAlpha = p.opacity;
      this.ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
      this.ctx.rotate(p.rotation);
      this.ctx.drawImage(
        p.image,
        -p.width / 2,
        -p.height / 2,
        p.width,
        p.height,
      );
      this.ctx.restore();
    }

    this.rafId = requestAnimationFrame(this._tick);
  };
}

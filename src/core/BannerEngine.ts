import { BannerLoader } from "./DataLoader";
import {
  type BaseRenderer,
  FailedRenderer,
  LoadingRenderer,
  ParallaxRenderer,
  SingleImageRenderer,
  SingleVideoRenderer,
} from "./Renderer";
import type { BannerConfig, BannerRef } from "./types";

type BannerViewState = "idle" | "loading" | "success" | "failed";

export default class BannerEngine {
  private bannerContainer: HTMLElement | null;
  private animatedBanner: HTMLElement | null;
  private readonly loader: BannerLoader = new BannerLoader();
  private renderer: BaseRenderer | null = null;

  private failedBanners: Set<string> = new Set();
  private currentPath = "";
  private currentState: BannerViewState = "idle";
  private currentBanner: BannerConfig | null = null;
  private requestId = 0;

  constructor() {
    this.bannerContainer = document.getElementById("banner-container");
    this.animatedBanner =
      this.bannerContainer?.querySelector(".animated-banner") || null;
  }

  private _updateViewState(state: Exclude<BannerViewState, "idle">): void {
    if (!this.bannerContainer) return;
    this.bannerContainer.classList.remove(
      "is-loading",
      "is-success",
      "is-failed",
    );
    this.bannerContainer.classList.add(`is-${state}`);
  }

  private _render(state: BannerViewState, banner?: BannerConfig): void {
    this.currentState = state;
    this.currentBanner = banner ?? null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (!this.animatedBanner) return;

    if (this.currentState === "idle") {
      return;
    }

    this.renderer = this._createRenderer(this.currentBanner);

    if (this.renderer) {
      this.renderer.render(
        this.animatedBanner,
        this.currentBanner ?? undefined,
      );
    }
  }

  private _createRenderer(banner: BannerConfig | null): BaseRenderer | null {
    if (this.currentState === "loading") {
      this._updateViewState("loading");
      return new LoadingRenderer();
    }

    if (this.currentState === "failed") {
      this._updateViewState("failed");
      return new FailedRenderer();
    }

    if (this.currentState === "success" && banner) {
      this._updateViewState("success");
      switch (banner.type) {
        case "single-image":
          return new SingleImageRenderer();
        case "single-video":
          return new SingleVideoRenderer();
        case "multi-layer":
          return new ParallaxRenderer();
        default:
          return new FailedRenderer();
      }
    }
    return null;
  }

  public async switch(ref: BannerRef): Promise<void> {
    if (this.currentPath === ref.path) {
      return;
    }

    this.currentPath = ref.path;

    if (this.failedBanners.has(ref.path)) {
      this._render("failed");
      return;
    }

    const cachedBanner = this.loader.getCached(ref.path);
    if (cachedBanner) {
      this._render("success", cachedBanner);
      return;
    }

    const requestId = ++this.requestId;
    this._render("loading");

    try {
      const banner = await this.loader.load(ref);
      if (requestId !== this.requestId || this.currentPath !== ref.path) {
        return;
      }

      this._render("success", banner);
    } catch (e) {
      if (requestId !== this.requestId || this.currentPath !== ref.path) {
        return;
      }

      console.error(`[BannerEngine] 无法加载 Banner 配置: ${ref.path}\n`, e);
      this.failedBanners.add(ref.path);
      this._render("failed");
    }
  }
}

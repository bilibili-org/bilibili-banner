import {
  type BaseRenderer,
  FailedRenderer,
  LoadingRenderer,
  ParallaxRenderer,
  SingleImageRenderer,
  SingleVideoRenderer,
} from "./Renderer";
import type { BannerDetail } from "./types";

export default class BannerEngine {
  private bannerContainer: HTMLElement | null;
  private animatedBanner: HTMLElement | null;
  private renderer: BaseRenderer | null = null;

  constructor() {
    this.bannerContainer = document.querySelector(".banner-container");
    this.animatedBanner =
      this.bannerContainer?.querySelector(".animated-banner") || null;
  }

  private _updateViewState(state: "loading" | "success" | "failed"): void {
    if (!this.bannerContainer) return;
    this.bannerContainer.classList.remove(
      "is-loading",
      "is-success",
      "is-failed",
    );
    this.bannerContainer.classList.add(`is-${state}`);
  }

  public render(detail: BannerDetail): void {
    this._updateViewState(detail.state);

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (!this.animatedBanner) return;

    if (detail.state === "loading") {
      this.renderer = new LoadingRenderer();
    } else if (detail.state === "failed") {
      this.renderer = new FailedRenderer();
    } else if (detail.state === "success") {
      switch (detail.type) {
        case "single-image":
          this.renderer = new SingleImageRenderer();
          break;
        case "single-video":
          this.renderer = new SingleVideoRenderer();
          break;
        case "multi-layer":
          this.renderer = new ParallaxRenderer();
          break;
        default:
          this.renderer = new FailedRenderer();
      }
    }

    if (this.renderer) {
      this.renderer.render(this.animatedBanner, detail);
    }
  }
}

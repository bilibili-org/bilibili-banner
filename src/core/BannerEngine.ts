import {
  type BaseRenderer,
  FailedRenderer,
  LoadingRenderer,
  ParallaxRenderer,
  SimpleVideoRenderer,
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
      const isSimpleVideo = detail.layers.some(
        (l) => l.type === "simple-video",
      );

      if (isSimpleVideo) {
        this.renderer = new SimpleVideoRenderer();
      } else {
        this.renderer = new ParallaxRenderer();
      }
    }

    if (this.renderer) {
      this.renderer.render(this.animatedBanner, detail);
    }
  }
}

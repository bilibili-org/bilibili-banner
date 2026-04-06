import type { BannerConfigV1, MediaLayer } from "../types";
import type { BaseRenderer } from "./BaseRenderer";
import { releaseVideoElement } from "./helper";

export class SingleVideoRenderer implements BaseRenderer {
  private wrapper: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;

  public render(container: HTMLElement, bannerConfig?: BannerConfigV1): void {
    if (!bannerConfig) return;

    const singleVideoItem = bannerConfig.layers.find(
      (item): item is MediaLayer => item.type === "video",
    );
    if (!singleVideoItem) return;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "single-video-container";

    this.video = document.createElement("video");
    this.video.src =
      import.meta.env.BASE_URL + singleVideoItem.src.replace(/^\//, "");
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
      releaseVideoElement(this.video);
      this.video = null;
    }
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
  }
}

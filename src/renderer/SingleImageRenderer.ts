import type { BannerConfigV1, MediaLayer } from "../types";
import type { BaseRenderer } from "./BaseRenderer";

export class SingleImageRenderer implements BaseRenderer {
  private wrapper: HTMLElement | null = null;
  private img: HTMLImageElement | null = null;

  public render(container: HTMLElement, bannerConfig?: BannerConfigV1): void {
    if (!bannerConfig) return;

    const singleImageItem = bannerConfig.layers.find(
      (item): item is MediaLayer => item.type === "img",
    );
    if (!singleImageItem) return;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "single-image-container";

    this.img = document.createElement("img");
    this.img.src =
      import.meta.env.BASE_URL + singleImageItem.src.replace(/^\//, "");

    this.wrapper.appendChild(this.img);
    container.innerHTML = "";
    container.appendChild(this.wrapper);
  }

  public dispose(): void {
    if (this.img) {
      this.img.removeAttribute("src");
      this.img = null;
    }
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
  }
}

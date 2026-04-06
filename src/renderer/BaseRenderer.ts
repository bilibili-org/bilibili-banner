import type { BannerConfig } from "../types";

export interface BaseRenderer {
  render(container: HTMLElement, bannerConfig?: BannerConfig): void;
  dispose(): void;
}

export class LoadingRenderer implements BaseRenderer {
  public render(container: HTMLElement): void {
    container.innerHTML = "";
  }

  public dispose(): void {}
}

export class FailedRenderer implements BaseRenderer {
  public render(container: HTMLElement): void {
    container.innerHTML = "";
  }

  public dispose(): void {}
}

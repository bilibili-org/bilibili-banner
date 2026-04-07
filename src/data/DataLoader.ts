import type { BannerConfig, BannerRef } from "../types";

export class BannerLoader {
  private bannerCache: Map<string, BannerConfig> = new Map();

  public getCached(path: string): BannerConfig | undefined {
    return this.bannerCache.get(path);
  }

  public async load(ref: BannerRef): Promise<BannerConfig> {
    const cachedBanner = this.bannerCache.get(ref.path);
    if (cachedBanner) {
      return cachedBanner;
    }

    const banner = await parseBannerData(ref);
    this.bannerCache.set(ref.path, banner);
    return banner;
  }
}
const VALID_BANNER_TYPES = ["single-image", "single-video", "multi-layer"];

async function parseBannerData(ref: BannerRef): Promise<BannerConfig> {
  const url = `${import.meta.env.BASE_URL}assets/${ref.path}/data.json`;
  const res = await fetch(url);
  const rawData = await res.json();

  if (!rawData.type || !VALID_BANNER_TYPES.includes(rawData.type)) {
    throw new Error(
      `[BannerDataLoader] 数据格式错误，发现未知 Banner 类型: ${rawData.type}`,
    );
  }

  return {
    ...ref,
    ...rawData,
  } as BannerConfig;
}

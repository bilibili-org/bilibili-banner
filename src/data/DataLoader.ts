import type {
  BannerConfig,
  BannerRef,
  LayersV1,
  MediaLayer,
  ParticleLayer,
} from "../types";

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

async function parseBannerData(ref: BannerRef): Promise<BannerConfig> {
  const url = `${import.meta.env.BASE_URL}assets/${ref.path}/data.json`;
  const res = await fetch(url);
  const rawData = await res.json();

  if (Number(rawData.version) === 2) {
    return {
      ...ref,
      version: 2,
      layers: rawData.layers,
    };
  } else if (Number(rawData.version) === 1) {
    return {
      ...ref,
      version: 1,
      type: rawData.type,
      layers: parseLayerData(rawData.layers),
    };
  }

  throw new Error(
    `[BannerDataLoader] 数据格式错误，发现未知版本: ${rawData.version}`,
  );
}

function parseLayerData(rawData: unknown): LayersV1 {
  if (!Array.isArray(rawData)) {
    throw new Error("[BannerDataLoader] 数据格式错误");
  }

  const layers: LayersV1 = [];
  for (const item of rawData) {
    switch (item.type) {
      case "particle":
        layers.push(item as ParticleLayer);
        break;
      case "video":
      case "img":
        layers.push(item as MediaLayer);
        break;
      default:
        throw new Error(`[BannerDataLoader] 未知图层类型: ${item.type}`);
    }
  }

  if (layers.length === 0) {
    throw new Error(
      "[BannerDataLoader] 校验失败: 配置文件中没有发现有效的图层数据",
    );
  }

  return layers;
}

import type {
  BannerConfig,
  BannerRef,
  Layers,
  MediaLayer,
  ParticleLayer,
} from "./types";

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

  return {
    ...ref,
    type: rawData.type,
    layers: parseLayerData(rawData.layers),
  };
}

function parseLayerData(rawData: unknown): Layers {
  if (!Array.isArray(rawData)) {
    throw new Error("[BannerDataLoader] 数据格式错误: 期望数组类型层配置");
  }

  const layers: Layers = [];
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
        throw new Error(`[BannerDataLoader] 未知类型数据: ${item.type}`);
    }
  }

  if (layers.length === 0) {
    throw new Error(
      "[BannerDataLoader] 校验失败: 配置文件中没有发现有效的图层数据",
    );
  }

  return layers;
}

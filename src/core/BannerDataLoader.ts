import BANNER_MANIFEST_JSON from "../data/banner.json";
import type {
  BannerDetail,
  BannerManifestEntry,
  DailyBannerDetail,
  Layers,
  MotionLayer,
  ParticleLayer,
  SimpleVideoLayer,
} from "./types";

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
      case "simple-video":
        layers.push(item as SimpleVideoLayer);
        break;
      case "video":
      case "img":
        layers.push(item as MotionLayer);
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

/**
 * 仅加载 Banner 元数据列表（不包含具体的图层数据）
 */
export async function loadBannerManifest(): Promise<DailyBannerDetail[]> {
  const bannerManifest = BANNER_MANIFEST_JSON as BannerManifestEntry[];

  return bannerManifest.map((entry) => {
    const banners: BannerDetail[] = entry.configs.map((v) => ({
      name: v.name,
      path: v.path || entry.date,
      layers: [], // 初始为空，按需加载
      state: "loading",
    }));

    return {
      date: entry.date,
      banners: banners,
    };
  });
}

export async function fetchLayers(path: string): Promise<Layers> {
  const url = `${import.meta.env.BASE_URL}assets/${path}/data.json`;
  const res = await fetch(url);
  const rawData = await res.json();
  return parseLayerData(rawData);
}

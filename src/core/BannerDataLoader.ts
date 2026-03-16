import BANNER_MANIFEST_JSON from "../data/banner.json";
import type {
  Banner,
  BannerManifest,
  DailyBanner,
  Layers,
  MotionLayer,
  ParticleLayer,
  SimpleVideoLayer,
} from "./types";

export const BANNER_MANIFEST = BANNER_MANIFEST_JSON as BannerManifest[];

function parseLayerData(rawData: unknown): Layers {
  if (!Array.isArray(rawData)) {
    throw new Error("[BannerDataLoader] 数据格式错误: 期望数组类型层配置");
  }

  // biome-ignore lint/suspicious/noExplicitAny: rawData 来源为 JSON，item 类型由内部 switch 逻辑根据 type 字段动态收窄
  const layers = rawData.reduce((acc: Layers, item: any) => {
    const { type } = item;

    switch (type) {
      case "particle":
        acc.push(item as ParticleLayer);
        break;
      case "simple-video":
        acc.push(item as SimpleVideoLayer);
        break;
      case "video":
      case "img":
        acc.push(item as MotionLayer);
        break;
      default:
        throw new Error(`[BannerDataLoader] 未知类型数据: ${type}`);
    }

    return acc;
  }, []);

  if (layers.length === 0) {
    throw new Error(
      "[BannerDataLoader] 校验失败: 配置文件中没有发现有效的图层数据",
    );
  }

  return layers;
}

export async function loadBanners(): Promise<DailyBanner[]> {
  const tasks = BANNER_MANIFEST.map(async (entry) => {
    const innerLoadTasks = entry.configs.map(async (v) => {
      const fetchPath = v.path || entry.date;
      const url = `${import.meta.env.BASE_URL}assets/${fetchPath}/data.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawData = await res.json();
      return {
        name: v.name,
        path: fetchPath,
        layers: parseLayerData(rawData),
      } as Banner;
    });

    const results = await Promise.allSettled(innerLoadTasks);

    const banners: Banner[] = results.map((result, idx) => {
      if (result.status === "fulfilled") {
        return result.value;
      }

      const fetchPath = entry.configs[idx].path || entry.date;
      const url = `${import.meta.env.BASE_URL}assets/${fetchPath}/data.json`;
      console.error(
        `[BannerDataLoader] 配置文件加载失败：${url}`,
        result.reason,
      );
      return {
        name: entry.configs[idx].name,
        path: fetchPath,
        layers: [],
        failed: true,
      } as Banner;
    });

    return {
      date: entry.date,
      banners: banners,
    } as DailyBanner;
  });

  return Promise.all(tasks);
}

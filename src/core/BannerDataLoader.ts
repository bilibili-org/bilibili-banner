import type {
  ParallaxLayer,
  ParticleLayerConfig,
  StandardBannerData,
} from "./BannerEngine";

/**
 * Banner 数据加载器
 * 通过静态清单（MANIFEST）统一管理所有 Banner 元数据，
 * 并提供 load() 方法并行拉取所有 JSON 数据。
 *
 * 新增一期 Banner 时，只需在 MANIFEST 末尾追加一条记录即可。
 */

// 变体定义接口
export interface VariantEntry {
  name: string;
  path?: string;
  data?: unknown; // 解析后的原始JSON数据，将作为未知结构向下传递
}

// 原始清单数据结构
export interface ManifestEntry {
  date: string;
  variants: VariantEntry[];
}

export interface LoadedVariant {
  name: string;
  path: string;
  data: StandardBannerData;
  /** 加载失败标记，true 时 data 为空占位，不应触发渲染 */
  failed?: boolean;
}

export interface LoadedBannerData {
  date: string;
  variants: LoadedVariant[];
}

import MANIFEST_JSON from "../data/banners.json";

export default class BannerDataLoader {
  public static readonly MANIFEST: ManifestEntry[] =
    MANIFEST_JSON as ManifestEntry[];

  /**
   * 按新的结构统一并行加载所有变体的数据。
   * @returns {Promise<LoadedBannerData[]>}
   */
  public async load(): Promise<LoadedBannerData[]> {
    const tasks = BannerDataLoader.MANIFEST.map(async (entry) => {
      const variantTasks = entry.variants.map((v) => {
        const fetchPath = v.path || entry.date;
        const url = `${import.meta.env.BASE_URL}assets/${fetchPath}/data.json`;
        return fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then(
            (rawData) =>
              ({
                name: v.name,
                path: fetchPath,
                data: this._normalizeData(rawData),
              }) as LoadedVariant,
          );
      });

      const results = await Promise.allSettled(variantTasks);
      const resolvedVariants: LoadedVariant[] = results.map((result, idx) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        const fetchPath = entry.variants[idx].path || entry.date;
        const url = `${import.meta.env.BASE_URL}assets/${fetchPath}/data.json`;
        console.error(
          `[BannerDataLoader] 配置文件加载失败：${url}`,
          result.reason,
        );
        return {
          name: entry.variants[idx].name,
          path: fetchPath,
          data: { type: "parallax", payload: [] },
          failed: true,
        } as LoadedVariant;
      });

      return {
        date: entry.date,
        variants: resolvedVariants,
      } as LoadedBannerData;
    });

    return Promise.all(tasks);
  }

  private _normalizeData(rawData: unknown): StandardBannerData {
    if (
      rawData &&
      typeof rawData === "object" &&
      !Array.isArray(rawData) &&
      (rawData as { mode?: string }).mode === "simple-video"
    ) {
      return {
        type: "simple-video",
        payload: {
          mode: "simple-video",
          src: (rawData as { src: string }).src,
        },
      };
    }

    if (Array.isArray(rawData)) {
      const payload = rawData.map((item) => {
        // 粒子层配置直接透传
        if (item.type === "particle") {
          return item as ParticleLayerConfig;
        }
        const isVideo = item.tagName === "video";
        return {
          ...item,
          type: isVideo ? "video" : "image",
        } as ParallaxLayer;
      });
      return {
        type: "parallax",
        payload,
      };
    }

    return { type: "parallax", payload: [] };
  }
}

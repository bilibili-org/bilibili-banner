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

export default class BannerDataLoader {
  /**
   * 所有 Banner 元数据清单，按时间升序排列。
   * - date: 上线日期（YYYY-MM-DD），用于时间轴分组显示
   * - variants: 包含该日期下所有变体的数组。
   *     - name: 变体名称，也是单变体时在时间轴上展示的默认名字
   *     - path: (可选) 数据目录名。若不填则默认使用外层 date
   */
  public static readonly MANIFEST: ManifestEntry[] = [
    {
      date: "2020-10-01",
      variants: [{ name: "仲秋流金", path: "2020-10-01-autumn" }],
    },
    {
      date: "2021-02-17",
      variants: [{ name: "冬日公园" }],
    },
    {
      date: "2021-04-12",
      variants: [{ name: "河畔春游", path: "2021-04-12-spring" }],
    },
    {
      date: "2021-05-26",
      variants: [
        { name: "倚窗闲话", path: "2021-05-26-1-summer-noon-chat" },
        { name: "凭栏听风", path: "2021-05-26-2-balcony-windmill" },
        { name: "楼台观雨", path: "2021-05-26-3" },
        { name: "雨天偷闲", path: "2021-05-26-4" },
        { name: "雨霁黄昏前", path: "2021-05-26-5" },
        { name: "闲逐晚霞", path: "2021-05-26-6" },
      ],
    },
    {
      date: "2021-05-28",
      variants: [
        { name: "花火照颜", path: "2021-05-28-1-sparkler-night" },
        {
          name: "惊雷欢趣",
          path: "2021-05-28-2-thunderstorm-night",
        },
        { name: "极目远眺", path: "2021-05-28-3-starlit-night" },
      ],
    },
    {
      date: "2021-08-09",
      variants: [
        { name: "金秋飨宴", path: "2021-08-09-morning" },
        { name: "暮色微醺", path: "2021-08-09-evening" },
        { name: "萤火清梦", path: "2021-08-09-night" },
      ],
    },
    {
      date: "2021-12-03",
      variants: [
        {
          name: "极地筑梦",
          path: "2021-12-03-1-morning",
        },
        {
          name: "极地垂钓",
          path: "2021-12-03-2-antarctica-expedition",
        },
        {
          name: "冰海寒夜",
          path: "2021-12-03-3-antarctica-fire-night",
        },
      ],
    },
    { date: "2022-03-14", variants: [{ name: "风叶穿行" }] },
    { date: "2023-03-01", variants: [{ name: "课间小憩" }] },
    { date: "2023-03-31", variants: [{ name: "草木营建工记" }] },
    { date: "2023-05-08", variants: [{ name: "劳作清余" }] },
    { date: "2023-06-12", variants: [{ name: "微澜篝火欢" }] },
    { date: "2023-07-18", variants: [{ name: "幽涧萤光会" }] },
    { date: "2023-08-13", variants: [{ name: "碧海潜游" }] },
    { date: "2023-08-21", variants: [{ name: "沉船浮岛" }] },
    { date: "2023-10-01", variants: [{ name: "叶舟游江" }] },
    { date: "2023-10-26", variants: [{ name: "林间秋藏" }] },
    { date: "2023-11-17", variants: [{ name: "田野牧风" }] },
    { date: "2023-12-12", variants: [{ name: "冬湖嬉冰" }] },
    { date: "2024-02-01", variants: [{ name: "雪夜围炉 - 共包新岁" }] },
    { date: "2024-06-06", variants: [{ name: "春野骑行 - 橘猫电话亭" }] },
    { date: "2024-06-26", variants: [{ name: "海洋机场 - 启程远洋" }] },
    { date: "2024-09-26", variants: [{ name: "魔法少女 - 飞掠高架桥" }] },
    { date: "2024-12-26", variants: [{ name: "龙吟雪岭 - 缆车飞驰" }] },
    { date: "2025-04-05", variants: [{ name: "蒲英絮舞 - 掠影逐云" }] },
    { date: "2025-06-15", variants: [{ name: "清凉一夏 - 水漫街头" }] },
    { date: "2025-09-10", variants: [{ name: "弯月流星 - 手捧星光" }] },
    { date: "2026-01-09", variants: [{ name: "雪林候车 - 学子归途" }] },

    // NEW_DATA_PLACEHOLDER
  ];

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

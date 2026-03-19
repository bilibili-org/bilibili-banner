import "./styles/index.css";
import BannerEngine from "./core/BannerEngine";
import { loadBannerManifest, parseBannerData } from "./core/DataLoader";
import type { BannerDetail } from "./core/types";
import BannerTimeLine from "./ui/BannerTimeLine";
import YearSelector from "./ui/YearSelector";

const engine = new BannerEngine();

const PERSIST_KEY = "last_banner_path";

let currentActivePath = "";

async function updateBanner(bannerDetail: BannerDetail) {
  if (currentActivePath === bannerDetail.path) {
    return;
  }

  currentActivePath = bannerDetail.path;
  engine.render(bannerDetail);

  if (bannerDetail.state === "loading") {
    try {
      const { type, layers } = await parseBannerData(bannerDetail.path);
      bannerDetail.type = type;
      bannerDetail.layers = layers;
      bannerDetail.state = "success";
    } catch (e) {
      console.error(`[Main] 无法加载 Banner 配置: ${bannerDetail.path}`, e);
      bannerDetail.state = "failed";
    }
  }

  if (currentActivePath === bannerDetail.path) {
    engine.render(bannerDetail);
    localStorage.setItem(PERSIST_KEY, bannerDetail.path);
  }
}

loadBannerManifest()
  .then((data) => {
    const savedPath = localStorage.getItem(PERSIST_KEY) || "";
    let initialYear = "";
    let initialVariant: BannerDetail | undefined;

    if (savedPath) {
      const matchedDaily = data.find((item) =>
        item.banners.some((v) => v.path === savedPath),
      );
      if (matchedDaily) {
        initialYear = matchedDaily.date.split("-")[0];
        initialVariant = matchedDaily.banners.find((v) => v.path === savedPath);
      }
    }

    const bannerTimeLine = new BannerTimeLine({
      containerId: "selectBox",
      onVariantSelect: (variant) => {
        updateBanner(variant);
      },
    });

    const yearSelector = new YearSelector({
      containerId: "yearBox",
      onYearChange: (year) => {
        const filteredData = data.filter((item) => item.date.startsWith(year));
        const currentSavedPath = localStorage.getItem(PERSIST_KEY) || "";
        const targetPathForYear = currentSavedPath.startsWith(year)
          ? currentSavedPath
          : undefined;
        bannerTimeLine.render(filteredData, targetPathForYear);
      },
    });

    const years = [...new Set(data.map((item) => item.date.split("-")[0]))];
    const defaultYear = initialYear || years[years.length - 1];
    yearSelector.init(years, defaultYear);

    // 如果没有有效的 initialVariant，则默认加载当前年份的第一个 Banner
    if (!initialVariant) {
      const currentYearData = data.filter((item) =>
        item.date.startsWith(defaultYear),
      );
      if (currentYearData.length > 0 && currentYearData[0].banners.length > 0) {
        initialVariant = currentYearData[0].banners[0];
      }
    }

    if (initialVariant) {
      updateBanner(initialVariant);
    }
  })
  .catch((e) => console.error("Banner metadata loading failed", e));

import "./styles/index.css";
import { loadBanners } from "./core/BannerDataLoader";
import BannerEngine from "./core/BannerEngine";
import BannerTimeLine from "./ui/BannerTimeLine";
import YearSelector from "./ui/YearSelector";

const engine = new BannerEngine("#app");

const PERSIST_KEY = "last_banner_path";

engine.start();

loadBanners()
  .then((data) => {
    const savedPath = localStorage.getItem(PERSIST_KEY) || "";
    let initialYear = "";
    if (savedPath) {
      const matched = data.find((item) =>
        item.banners.some((v) => v.path === savedPath),
      );
      if (matched) initialYear = matched.date.split("-")[0];
    }

    const bannerTimeLine = new BannerTimeLine({
      containerId: "selectBox",
      onVariantSelect: (variant) => {
        if (variant.failed) {
          engine.showLoadFailed(variant.path);
        } else {
          engine.updateData(variant.layers);
        }
        localStorage.setItem(PERSIST_KEY, variant.path);
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
    yearSelector.init(years, initialYear || years[years.length - 1]);
  })
  .catch((e) => console.error("Banner metadata loading failed", e));

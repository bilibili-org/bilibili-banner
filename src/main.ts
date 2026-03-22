import "./styles/index.css";
import BannerEngine from "./core/BannerEngine";
import type { DailyBannerGroup } from "./core/types";
import BANNER_MANIFEST_JSON from "./data/banner.json";
import BannerNavigation, {
  BANNER_NAV_SWITCH_EVENT,
  type BannerNavSwitchDetail,
} from "./ui/BannerNavigation";

const BANNER_MANIFEST = BANNER_MANIFEST_JSON as DailyBannerGroup[];

try {
  const engine = new BannerEngine();
  const nav = new BannerNavigation(BANNER_MANIFEST);

  nav.addEventListener(BANNER_NAV_SWITCH_EVENT, (event: Event) => {
    const { ref } = (event as CustomEvent<BannerNavSwitchDetail>).detail;
    void engine.switch(ref);
  });

  nav.switch();
} catch (e) {
  console.error("Banner metadata loading failed", e);
}

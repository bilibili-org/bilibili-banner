import type { BannerRef, DailyBannerGroup } from "../types";
import BannerTimeLine from "./BannerTimeLine";
import YearSelector from "./YearSelector";

export const BANNER_NAV_SWITCH_EVENT = "switch";

export interface BannerNavSwitchDetail {
  ref: BannerRef;
}

interface NavigationIndexes {
  pathToBannerRef: Map<string, BannerRef>;
  yearToLatestPath: Map<string, string>;
  years: string[];
}

function buildIndexes(groups: DailyBannerGroup[]): NavigationIndexes {
  const pathToBannerRef = new Map<string, BannerRef>();
  const yearToLatestPath = new Map<string, string>();
  const years: string[] = [];

  for (const group of groups) {
    if (group.refs.length === 0) {
      continue;
    }

    const year = group.date.split("-")[0];
    if (!yearToLatestPath.has(year)) {
      years.push(year);
    }

    yearToLatestPath.set(year, group.refs[0].path);

    for (const ref of group.refs) {
      pathToBannerRef.set(ref.path, ref);
    }
  }

  return {
    pathToBannerRef,
    yearToLatestPath,
    years,
  };
}

export default class BannerNavigation extends EventTarget {
  private readonly yearSelector: YearSelector;
  private readonly bannerTimeLine: BannerTimeLine;
  private readonly groups: DailyBannerGroup[];
  private readonly pathToBannerRef: Map<string, BannerRef>;
  private readonly yearToLatestPath: Map<string, string>;
  private readonly yearToLastVisitedPath: Map<string, string> = new Map();
  private activeBannerPath = "";

  constructor(groups: DailyBannerGroup[]) {
    super();

    const indexes = buildIndexes(groups);
    this.groups = groups;
    this.pathToBannerRef = indexes.pathToBannerRef;
    this.yearToLatestPath = indexes.yearToLatestPath;

    this.yearSelector = new YearSelector({
      containerId: "yearBox",
      onYearChange: (year) => {
        const targetPath = this._resolvePathForYear(year);
        if (targetPath) {
          this.switch(targetPath);
        }
      },
    });

    this.bannerTimeLine = new BannerTimeLine({
      containerId: "selectBox",
      onVariantSelect: (variant) => {
        this.switch(variant.path);
      },
    });

    if (indexes.years.length > 0) {
      this.yearSelector.init(
        indexes.years,
        indexes.years[indexes.years.length - 1],
      );
    }
  }

  public switch(requestedPath?: string): void {
    const nextPath = this._resolvePath(requestedPath);
    if (!nextPath) {
      return;
    }

    if (this.activeBannerPath === nextPath) {
      return;
    }

    const targetYear = this._findYearByPath(nextPath);
    const currentYear = this.activeBannerPath
      ? this._findYearByPath(this.activeBannerPath)
      : undefined;
    const targetRef = this.pathToBannerRef.get(nextPath);
    const targetGroups = targetYear ? this._getGroupsByYear(targetYear) : [];

    if (!targetYear || !targetRef || targetGroups.length === 0) {
      return;
    }

    this.yearSelector.setActiveYear(targetYear);
    if (currentYear === targetYear) {
      this.bannerTimeLine.setActiveVariant(nextPath);
    } else {
      this.bannerTimeLine.render(targetGroups, nextPath);
    }
    this.activeBannerPath = nextPath;
    this.yearToLastVisitedPath.set(targetYear, nextPath);

    this.dispatchEvent(
      new CustomEvent<BannerNavSwitchDetail>(BANNER_NAV_SWITCH_EVENT, {
        detail: { ref: targetRef },
      }),
    );
  }

  public destroy(): void {
    this.bannerTimeLine.destroy();
    this.yearSelector.destroy();
  }

  private _resolvePath(requestedPath?: string): string | undefined {
    if (requestedPath && this.pathToBannerRef.has(requestedPath)) {
      return requestedPath;
    }

    return this._getLatestBannerPath();
  }

  private _resolvePathForYear(year: string): string | undefined {
    return (
      this.yearToLastVisitedPath.get(year) || this.yearToLatestPath.get(year)
    );
  }

  private _findYearByPath(path: string): string | undefined {
    const matchedGroup = this.groups.find((group) =>
      group.refs.some((banner) => banner.path === path),
    );

    return matchedGroup?.date.split("-")[0];
  }

  private _getGroupsByYear(year: string): DailyBannerGroup[] {
    return this.groups.filter((group) => group.date.startsWith(year));
  }

  private _getLatestBannerPath(): string | undefined {
    for (let index = this.groups.length - 1; index >= 0; index -= 1) {
      const latestRef = this.groups[index]?.refs[0];
      if (latestRef) {
        return latestRef.path;
      }
    }

    return undefined;
  }
}

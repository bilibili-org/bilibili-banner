import type { BannerRef, DailyBannerGroup } from "../types";

export interface BannerTimeLineOptions {
  containerId?: string;
  onVariantSelect?: (variant: BannerRef) => void;
}

export default class BannerTimeLine {
  private container: HTMLElement | null;
  private _bodyDropdowns: HTMLDivElement[] = [];
  private onVariantSelect?: (variant: BannerRef) => void;
  private _itemDataMap: WeakMap<HTMLElement, DailyBannerGroup> = new WeakMap();
  private _activeDropdownTimer?: number;
  private activePath = "";

  private _boundHandleClick: (e: MouseEvent) => void;
  private _boundHandleMouseOver: (e: MouseEvent) => void;
  private _boundHandleMouseOut: (e: MouseEvent) => void;
  private _boundHandleWheel: (e: WheelEvent) => void;

  constructor(options: BannerTimeLineOptions = {}) {
    this.container = document.getElementById(
      options.containerId || "selectBox",
    );
    this.onVariantSelect = options.onVariantSelect;

    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleMouseOver = this._handleMouseOver.bind(this);
    this._boundHandleMouseOut = this._handleMouseOut.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);

    this._setupScrollWheel();
    this._setupEventDelegation();
  }

  public destroy(): void {
    this._cleanupDropdowns();
    if (this.container) {
      this.container.removeEventListener("click", this._boundHandleClick);
      this.container.removeEventListener(
        "mouseover",
        this._boundHandleMouseOver,
      );
      this.container.removeEventListener("mouseout", this._boundHandleMouseOut);
      this.container.removeEventListener("wheel", this._boundHandleWheel);
      this.container.innerHTML = "";
    }
    this._itemDataMap = new WeakMap();
    this.onVariantSelect = undefined;
  }

  /**
   * 接收过滤好的特定年份的变体数据进行渲染
   * @param {LoadedBannerData[]} filteredData
   * @param {string} [targetPath] - 期望初始选中的变体路径
   */
  public render(
    filteredData: DailyBannerGroup[],
    targetPath?: string,
  ): BannerRef | undefined {
    if (!this.container) return;

    this._cleanupDropdowns();
    this.container.innerHTML = "";

    if (filteredData.length === 0) {
      this.activePath = "";
      return undefined;
    }

    const activeRef = this._resolveActiveBanner(filteredData, targetPath);
    this.activePath = activeRef.path;

    filteredData.forEach((item) => {
      const itemEl = this._createTimelineItem(item);
      this.container?.appendChild(itemEl);

      if (item.refs.some((banner) => banner.path === activeRef.path)) {
        setTimeout(() => {
          itemEl.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }, 100);
      }
    });

    return activeRef;
  }

  public setActiveVariant(targetPath: string): BannerRef | undefined {
    if (!this.container) {
      return undefined;
    }

    let matchedVariant: BannerRef | undefined;

    this.container.querySelectorAll(".timeline-item").forEach((element) => {
      const itemEl = element as HTMLElement;
      const itemData = this._itemDataMap.get(itemEl);
      if (!itemData) {
        return;
      }

      const variant =
        itemData.refs.find((banner) => banner.path === targetPath) ?? undefined;
      if (variant) {
        matchedVariant = variant;
      }
    });

    if (!matchedVariant) {
      return undefined;
    }

    this.activePath = matchedVariant.path;
    this._syncRenderedState();
    return matchedVariant;
  }

  private _cleanupDropdowns(): void {
    window.clearTimeout(this._activeDropdownTimer);
    this._bodyDropdowns.forEach((d) => {
      d.removeEventListener("mouseenter", this._clearTimerBound);
      d.removeEventListener("mouseleave", this._hideDropdownScheduledBound);
      d.remove();
    });
    this._bodyDropdowns = [];
    this._itemDataMap = new WeakMap();
  }

  private _clearTimerBound = () =>
    window.clearTimeout(this._activeDropdownTimer);
  private _hideDropdownScheduledBound = () => this._hideDropdownScheduled();

  private _createTimelineItem(item: DailyBannerGroup): HTMLDivElement {
    const activeVariantIndex = Math.max(
      item.refs.findIndex((banner) => banner.path === this.activePath),
      0,
    );
    const activeBanner = item.refs[activeVariantIndex];
    const isActive = activeBanner.path === this.activePath;

    const itemEl = document.createElement("div");
    itemEl.className = `timeline-item ${isActive ? "active" : ""}`;

    const content = document.createElement("div");
    content.className = "item-content";

    const dateStr = document.createElement("span");
    dateStr.className = "item-date";
    dateStr.innerText = item.date;

    const name = document.createElement("span");
    name.className = "item-name";

    const nameText = document.createElement("span");
    nameText.innerText = activeBanner.name;
    name.appendChild(nameText);

    content.appendChild(dateStr);
    content.appendChild(name);
    itemEl.appendChild(content);

    if (item.refs.length > 1) {
      itemEl.classList.add("has-variants");

      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      arrow.setAttribute("width", "10");
      arrow.setAttribute("height", "10");
      arrow.setAttribute("viewBox", "0 0 9 9");
      arrow.setAttribute("fill", "none");
      arrow.classList.add("variant-arrow");
      arrow.innerHTML = `<path fill-rule="evenodd" clip-rule="evenodd" d="M7.50588 3.40623C7.40825 3.3086 7.24996 3.3086 7.15232 3.40623L4.41244 6.14612L1.67255 3.40623C1.57491 3.3086 1.41662 3.3086 1.31899 3.40623C1.22136 3.50386 1.22136 3.66215 1.31899 3.75978L4.11781 6.5586C4.28053 6.72132 4.54434 6.72132 4.70706 6.5586L7.50588 3.75978C7.60351 3.66215 7.60351 3.50386 7.50588 3.40623Z" fill="currentColor"/>`;
      name.appendChild(arrow);

      const dropdownId = `dropdown-${Math.random().toString(36).substr(2, 9)}`;
      itemEl.dataset.dropdownId = dropdownId;
      const dropdown = document.createElement("div");
      dropdown.id = dropdownId;
      dropdown.className = "variant-dropdown";

      item.refs.forEach((variant: BannerRef) => {
        const btn = document.createElement("div");
        btn.className = `variant-item ${variant.path === this.activePath ? "active" : ""}`;
        btn.innerText = variant.name;
        btn.dataset.path = variant.path;

        btn.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          this._activateVariant(variant, btn);
        });

        dropdown.appendChild(btn);
      });

      const app = document.getElementById("app");
      app?.appendChild(dropdown);
      this._bodyDropdowns.push(dropdown);

      dropdown.addEventListener("mouseenter", this._clearTimerBound);
      dropdown.addEventListener("mouseleave", this._hideDropdownScheduledBound);
    }

    itemEl.dataset.index = isActive ? "active" : "";
    this._itemDataMap.set(itemEl, item);
    return itemEl;
  }

  private _setupEventDelegation(): void {
    if (!this.container) return;

    this.container.addEventListener("click", this._boundHandleClick);
    this.container.addEventListener("mouseover", this._boundHandleMouseOver);
    this.container.addEventListener("mouseout", this._boundHandleMouseOut);
  }

  private _handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item") as HTMLElement;
    if (!itemEl) return;

    const itemData = this._itemDataMap.get(itemEl);
    if (!itemData) return;

    const firstVariant = itemData.refs[0];
    const dropdownId = itemEl.dataset.dropdownId;
    const dropdown = dropdownId
      ? (document.getElementById(dropdownId) as HTMLDivElement | null)
      : null;
    const firstVariantButton = dropdown?.querySelector(
      ".variant-item",
    ) as HTMLDivElement | null;

    this._activateVariant(firstVariant, firstVariantButton ?? undefined);
  }

  private _handleMouseOver(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item.has-variants") as HTMLElement;

    if (itemEl && !itemEl.contains(e.relatedTarget as Node)) {
      this._showDropdownFor(itemEl);
    }
  }

  private _handleMouseOut(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item.has-variants") as HTMLElement;

    if (itemEl && !itemEl.contains(e.relatedTarget as Node)) {
      this._hideDropdownScheduled();
    }
  }

  private _showDropdownFor(itemEl: HTMLElement): void {
    window.clearTimeout(this._activeDropdownTimer);

    this._bodyDropdowns.forEach((d) => {
      d.classList.remove("visible");
    });

    const dropdownId = itemEl.dataset.dropdownId;
    if (!dropdownId) return;

    const dropdown = document.getElementById(dropdownId) as HTMLDivElement;
    if (!dropdown) return;

    const rect = itemEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${rect.left + rect.width / 2}px`;
    dropdown.classList.add("visible");
  }

  private _hideDropdownScheduled(): void {
    window.clearTimeout(this._activeDropdownTimer);
    this._activeDropdownTimer = window.setTimeout(() => {
      this._bodyDropdowns.forEach((d) => {
        d.classList.remove("visible");
      });
    }, 150);
  }

  private _setupScrollWheel(): void {
    const box = this.container;
    if (!box) return;
    box.addEventListener("wheel", this._boundHandleWheel);
  }

  private _handleWheel(e: WheelEvent): void {
    const box = this.container;
    if (!box) return;
    if (e.deltaY !== 0) {
      e.preventDefault();
      box.scrollLeft += e.deltaY;
    }
  }

  private _resolveActiveBanner(
    filteredData: DailyBannerGroup[],
    targetPath?: string,
  ): BannerRef {
    if (targetPath) {
      for (const item of filteredData) {
        const matchedBanner = item.refs.find(
          (banner) => banner.path === targetPath,
        );
        if (matchedBanner) {
          return matchedBanner;
        }
      }
    }

    const fallbackItem = filteredData[filteredData.length - 1];
    return fallbackItem.refs[0];
  }

  private _syncRenderedState(): void {
    if (!this.container) {
      return;
    }

    this.container.querySelectorAll(".timeline-item").forEach((element) => {
      const itemEl = element as HTMLElement;
      const itemData = this._itemDataMap.get(itemEl);
      if (!itemData) {
        return;
      }

      const activeVariantIndex = Math.max(
        itemData.refs.findIndex((banner) => banner.path === this.activePath),
        0,
      );
      const activeBanner = itemData.refs[activeVariantIndex];
      const isActive = activeBanner.path === this.activePath;

      itemEl.classList.toggle("active", isActive);

      const nameText = itemEl.querySelector(
        ".item-name > span",
      ) as HTMLElement | null;
      if (nameText) {
        nameText.innerText = activeBanner.name;
      }

      const dropdownId = itemEl.dataset.dropdownId;
      const dropdown = dropdownId
        ? (document.getElementById(dropdownId) as HTMLDivElement | null)
        : null;
      dropdown?.querySelectorAll(".variant-item").forEach((dropdownItem) => {
        const variantEl = dropdownItem as HTMLElement;
        variantEl.classList.toggle(
          "active",
          variantEl.dataset.path === this.activePath,
        );
      });
    });
  }

  private _activateVariant(
    variant: BannerRef,
    activeButton?: HTMLElement,
  ): void {
    this.activePath = variant.path;
    this._syncRenderedState();
    activeButton?.classList.add("active");

    if (this.onVariantSelect) {
      this.onVariantSelect(variant);
    }
  }
}

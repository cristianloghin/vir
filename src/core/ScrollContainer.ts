import { ItemMeasurement } from "../types";

export class ScrollContainer {
  private scrollContainerElement: HTMLElement | null = null;
  private containerHeight = 0;

  // The list's own content element and its distance from the top of the
  // scroll container's content. The list may sit below other content in an
  // external container (a page header, say), so container scrollTop and
  // list coordinates differ by this much. Zero for the internal container.
  private listElement: HTMLElement | null = null;
  private listOffset = 0;

  private showScrollToTop = false;
  private scrollTop = 0;
  private lastKnownScrollTop = 0;
  private scrollTopRatio = 0;

  private resizeObserver: ResizeObserver | null = null;
  private scrollEventCleanup: (() => void) | null = null;

  constructor(
    private getOrderedIds: () => string[],
    private notify: () => void,
    private getTotalHeight: () => number,
    private defaultItemHeight: number,
    private gap: number
  ) {}

  init = (element: HTMLElement) => {
    // Clean up previous scroll event listeners
    if (this.scrollEventCleanup) {
      this.scrollEventCleanup();
      this.scrollEventCleanup = null;
    }

    this.scrollContainerElement = element;

    if (element) {
      this.containerHeight = element.clientHeight;
      this.measureListOffset();

      // Set up scroll event listener for external container
      const handleExternalScroll = () => {
        requestAnimationFrame(() => {
          if (!this.scrollContainerElement) return;
          // Content above the list can change height without a container
          // resize (a header condensing on scroll), so re-measure per frame.
          // Rects are cheap here: scrolling does not dirty layout. A changed
          // offset must apply even when scrollTop itself did not move.
          const offsetChanged = this.measureListOffset();
          this.syncScroll(this.scrollContainerElement.scrollTop, offsetChanged);
        });
      };

      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          if (newHeight !== this.containerHeight && newHeight > 0) {
            const oldTotalHeight = this.getTotalHeight();
            // Capture the pre-resize ratio in a local. A scroll event firing
            // before the deferred rAF runs calls updateScrollTopRatio and would
            // otherwise clobber this.scrollTopRatio, restoring the wrong offset.
            const ratio =
              oldTotalHeight > 0
                ? this.scrollTop /
                  Math.max(1, oldTotalHeight - this.containerHeight)
                : this.scrollTopRatio;
            this.scrollTopRatio = ratio;

            this.containerHeight = newHeight;
            if (this.measureListOffset()) this.applyScrollTop();

            requestAnimationFrame(() => {
              const targetElement = this.scrollContainerElement;
              if (targetElement && ratio > 0) {
                const newTotalHeight = this.getTotalHeight();
                const newScrollTop =
                  ratio * Math.max(0, newTotalHeight - this.containerHeight);
                targetElement.scrollTop = Math.max(0, newScrollTop);
              }
            });

            this.notify();
          }
        }
      });

      element.addEventListener("scroll", handleExternalScroll, {
        passive: true,
      });

      // Initial scroll calculation
      handleExternalScroll();

      // Set properties individually: assigning a string to `style` replaces
      // the element's entire cssText, wiping inline styles applied by React
      // (e.g. `height: 100%`) or by the consumer on an external container.
      const style = this.scrollContainerElement.style;
      style.overflow = "scroll";
      style.scrollbarGutter = "stable";
      style.overscrollBehavior = "contain";

      this.resizeObserver.observe(this.scrollContainerElement);
      this.notify();

      this.scrollEventCleanup = () => {
        element.removeEventListener("scroll", handleExternalScroll);
        this.resizeObserver?.disconnect();
      };
    }
  };

  // Takes the container's raw scrollTop; everything downstream works in list
  // coordinates, so the list offset is subtracted here.
  handleScroll = (scrollTop: number) => this.syncScroll(scrollTop);

  /**
   * The element holding the list's items. Once set, its position inside the
   * scroll container is measured so the list can sit below other content.
   * Optional: without it the list is assumed to start at the container's top.
   */
  setListElement = (element: HTMLElement | null) => {
    if (element === this.listElement) return;
    this.listElement = element;
    if (this.measureListOffset()) this.syncScroll(this.lastKnownScrollTop, true);
  };

  getListOffset = () => this.listOffset;

  scrollToTop = () => this.scrollToPosition(0);

  scrollToItemById = (itemId: string, measurement?: ItemMeasurement) => {
    if (!this.scrollContainerElement) return;

    if (!measurement) {
      const orderedIds = this.getOrderedIds();
      const itemIndex = orderedIds.findIndex((id) => id === itemId);

      if (itemIndex !== -1) {
        // Estimate the offset with the gap included, matching how
        // buildMeasurements lays unmeasured items out.
        this.scrollToPosition(
          itemIndex * (this.defaultItemHeight + this.gap),
          false
        );
      }
      return;
    }

    // Scroll the minimum needed to bring the item into view.
    const { top: itemTop, height: itemHeight } = measurement;
    const viewTop = this.scrollTop;
    const viewBottom = viewTop + this.containerHeight;

    let targetScrollTop;
    if (itemTop < viewTop) {
      targetScrollTop = itemTop;
    } else if (itemTop + itemHeight > viewBottom) {
      targetScrollTop = itemTop + itemHeight - this.containerHeight;
    } else {
      return; // already visible
    }

    const totalHeight = this.getTotalHeight();
    const maxScrollTop = Math.max(0, totalHeight - this.containerHeight);
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

    this.scrollToPosition(targetScrollTop);
  };

  getContainerHeight = () => this.containerHeight;
  getScrollTop = () => this.scrollTop;
  getShowScroll = () => this.showScrollToTop;

  private syncScroll = (scrollTop: number, force = false) => {
    if (!force && Math.abs(scrollTop - this.lastKnownScrollTop) < 1) return;

    this.lastKnownScrollTop = scrollTop;
    this.applyScrollTop();
    this.notify();
  };

  // Re-derive the list-space scrollTop from the last raw value and offset.
  private applyScrollTop = () => {
    this.scrollTop = this.lastKnownScrollTop - this.listOffset;
    this.showScrollToTop = this.scrollTop > 200;
    this.updateScrollTopRatio();
  };

  // Distance from the top of the container's scrollable content to the top
  // of the list element. Measured from bounding rects plus the current
  // scrollTop, which is invariant while scrolling. Returns whether it changed.
  private measureListOffset = (): boolean => {
    const container = this.scrollContainerElement;
    const list = this.listElement;
    let offset = 0;
    if (container && list) {
      const containerRect = container.getBoundingClientRect();
      // An empty rect means no layout is available (detached node, or a
      // non-rendering environment such as jsdom); keep the offset at zero
      // rather than deriving one from scrollTop alone.
      if (containerRect.width !== 0 || containerRect.height !== 0) {
        const listRect = list.getBoundingClientRect();
        offset =
          listRect.top -
          containerRect.top -
          container.clientTop +
          container.scrollTop;
      }
    }
    if (offset === this.listOffset) return false;
    this.listOffset = offset;
    return true;
  };

  private updateScrollTopRatio = () => {
    const totalHeight = this.getTotalHeight();
    if (totalHeight > this.containerHeight) {
      this.scrollTopRatio =
        this.scrollTop / Math.max(1, totalHeight - this.containerHeight);
    }
  };

  // `top` is in list coordinates; the container scrolls by the offset more.
  private scrollToPosition = (top: number, smooth = true) => {
    if (this.scrollContainerElement) {
      this.scrollContainerElement.scrollTo({
        top: top + this.listOffset,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  };

  cleanup = () => {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.scrollEventCleanup) {
      this.scrollEventCleanup();
      this.scrollEventCleanup = null;
    }

    this.scrollContainerElement = null;
    this.listOffset = 0;
  };
}

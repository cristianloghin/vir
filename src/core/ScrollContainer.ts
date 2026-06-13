import { ItemMeasurement } from "../types";

export class ScrollContainer {
  private scrollContainerElement: HTMLElement | null = null;
  private containerHeight = 0;

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

      // Set up scroll event listener for external container
      const handleExternalScroll = () => {
        requestAnimationFrame(() => {
          if (!this.scrollContainerElement) return;
          const scrollTop = this.scrollContainerElement.scrollTop;
          this.handleScroll(scrollTop);
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

  handleScroll = (scrollTop: number) => {
    if (Math.abs(scrollTop - this.lastKnownScrollTop) < 1) return;

    this.scrollTop = scrollTop;
    this.lastKnownScrollTop = scrollTop;
    this.showScrollToTop = scrollTop > 200;

    this.updateScrollTopRatio();
    this.notify();
  };

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

  private updateScrollTopRatio = () => {
    const totalHeight = this.getTotalHeight();
    if (totalHeight > this.containerHeight) {
      this.scrollTopRatio =
        this.scrollTop / Math.max(1, totalHeight - this.containerHeight);
    }
  };

  private scrollToPosition = (top: number, smooth = true) => {
    if (this.scrollContainerElement) {
      this.scrollContainerElement.scrollTo({
        top,
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
  };
}

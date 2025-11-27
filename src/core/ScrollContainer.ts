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
    private defaultItemHeight: number
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
            if (oldTotalHeight > 0) {
              this.scrollTopRatio =
                this.scrollTop /
                Math.max(1, oldTotalHeight - this.containerHeight);
            }

            this.containerHeight = newHeight;

            requestAnimationFrame(() => {
              const targetElement = this.scrollContainerElement;
              if (targetElement && this.scrollTopRatio > 0) {
                const newTotalHeight = this.getTotalHeight();
                const newScrollTop =
                  this.scrollTopRatio *
                  Math.max(0, newTotalHeight - this.containerHeight);
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

      this.scrollContainerElement.style = `overflow: scroll; will-change: scroll-position; scrollbar-gutter: stable; overscroll-behavior: contain`;

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

  scrollToItemById = (
    itemId: string,
    isMaximized: boolean,
    measurement?: ItemMeasurement
  ) => {
    if (!this.scrollContainerElement) return;

    if (!measurement) {
      const orderedIds = this.getOrderedIds();
      const itemIndex = orderedIds.findIndex((id) => id === itemId);

      if (itemIndex !== -1) {
        this.scrollToPosition(itemIndex * this.defaultItemHeight, false);
      }
      return;
    }

    // Scroll to center the item if it's maximized, otherwise just make it visible
    const { top: itemTop, height: itemHeight } = measurement;
    const viewTop = this.scrollTop;
    const viewBottom = viewTop + this.containerHeight;

    let targetScrollTop;

    if (isMaximized) {
      // Center the maximized item
      targetScrollTop = itemTop - (this.containerHeight - itemHeight) / 2;
    } else {
      if (itemTop < viewTop) {
        targetScrollTop = itemTop;
      } else if (itemTop + itemHeight > viewBottom) {
        targetScrollTop = itemTop + itemHeight - this.containerHeight;
      } else {
        return; // Already visible
      }
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

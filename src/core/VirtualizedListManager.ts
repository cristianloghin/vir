import {
  DataProvider,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  MaximizationConfig,
} from "../types";

export class VirtualizedListManager<T = any> {
  private uuid: string;

  private dataProvider: DataProvider<T>;
  private defaultItemHeight: number;
  private gap: number;

  private heights: number[] = [];
  private offsets: number[] = [0];

  private containerHeight = 0;
  private scrollTop = 0;
  private maximizedItemIndex: number | null = null;
  private overscan = 5;
  private subscribers = new Set<() => void>();
  private resizeObserver: ResizeObserver | null = null;

  private scrollContainerElement: HTMLElement | null = null;
  private scrollEventCleanup: (() => void) | null = null;

  private showScrollToTop = false;
  private isInitialized = false;
  private lastKnownScrollTop = 0;
  private scrollTopRatio = 0;
  private notifyScheduled = false;
  private dataUnsubscribe: (() => void) | null = null;

  // Configuration
  private maximizationConfig: MaximizationConfig;

  constructor(
    dataProvider: DataProvider<T>,
    config: VirtualizedListConfig = {}
  ) {
    this.dataProvider = dataProvider;

    this.defaultItemHeight = config.defaultItemHeight ?? 100;
    this.gap = config.gap ?? 0;

    // Set default maximization config
    this.maximizationConfig = {
      mode: "fixed",
      containerPercentage: 0.8,
      clipOverflow: true,
      neighborSpace: 120,
      ...config.maximization,
    };

    this.uuid = Math.random().toString(36).substring(2, 10);
    console.info("🆕 Created VirtualizedListManager", this.uuid);
  }

  private setupDataSubscription() {
    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
    }

    this.dataUnsubscribe = this.dataProvider.subscribe(() => {
      this.notify();
    });
  }

  private scrollToItem(index: number) {
    if (!this.scrollContainerElement) return;

    if (this.offsets[index] === undefined) return;

    const itemTop = this.offsets[index];
    this.scrollContainerElement.scrollTo({
      top: itemTop,
      behavior: "smooth",
    });
  }

  // Rest of the manager methods remain the same...
  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  private notify() {
    if (!this.notifyScheduled) {
      this.notifyScheduled = true;
      Promise.resolve().then(() => {
        this.notifyScheduled = false;
        this.subscribers.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            console.error("Error in virtualized list subscriber:", error);
          }
        });
      });
    }
  }

  setScrollContainer(element: HTMLElement) {
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

      this.resizeObserver.observe(this.scrollContainerElement);
      this.isInitialized = true;
      this.notify();

      this.scrollEventCleanup = () => {
        console.info("Cleaned up scroll listener", this.uuid);
        element.removeEventListener("scroll", handleExternalScroll);
        this.resizeObserver?.disconnect();
      };
    }
  }

  handleScroll = (scrollTop: number) => {
    if (Math.abs(scrollTop - this.lastKnownScrollTop) < 1) {
      return;
    }

    this.scrollTop = scrollTop;
    this.lastKnownScrollTop = scrollTop;
    this.showScrollToTop = scrollTop > 200;

    const totalHeight = this.getTotalHeight();
    if (totalHeight > this.containerHeight) {
      this.scrollTopRatio =
        scrollTop / Math.max(1, totalHeight - this.containerHeight);
    }

    this.notify();
  };

  setItemHeight = (id: string, index: number, height: number) => {
    if (height !== this.heights[index]) {
      this.heights[index] = height;
      this.buildOffsets(index);
    }
  };

  private buildOffsets = (fromIndex: number = 0) => {
    const heightsLength = this.heights.length;

    // Ensure offsets array is the right size
    this.offsets.length = heightsLength + 1;

    // Get starting offset
    let offset = fromIndex > 0 ? this.offsets[fromIndex] : 0;

    // Use a single loop with direct array access
    for (let i = fromIndex; i < heightsLength; i++) {
      offset += this.heights[i] + this.gap;
      this.offsets[i + 1] = offset;
    }

    requestAnimationFrame(() => {
      this.notify();
    });
  };

  private findFirstVisible = (scrollTop: number) => {
    let left = 0,
      right = this.offsets.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.offsets[mid] < scrollTop) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  };

  private findLastVisible = (scrollBottom: number) => {
    let left = 0,
      right = this.offsets.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (this.offsets[mid] <= scrollBottom) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }
    return left;
  };

  private getTotalHeight = () => {
    const totalCount = this.dataProvider.getTotalCount();

    if (this.offsets.length > 1) {
      // Return last offset
      return this.offsets[this.offsets.length - 1];
    }

    // Fallback to estimated height
    const totalGaps = Math.max(0, totalCount - 1) * this.gap;
    return totalCount * this.defaultItemHeight + totalGaps;
  };

  toggleMaximize(index: number) {
    if (this.maximizedItemIndex === index) {
      this.maximizedItemIndex = null;
    } else {
      this.maximizedItemIndex = index;
      requestAnimationFrame(() => {
        this.scrollToItem(index);
      });
    }

    this.notify();
  }

  private calculateMaximizedHeight(customHeight?: number): number {
    const config = this.maximizationConfig;

    // Custom height takes precedence
    if (customHeight) {
      return customHeight;
    }

    switch (config.mode) {
      case "natural":
        // Return 0 to indicate natural height should be used
        return 0;

      case "custom":
        return config.maxHeight || this.containerHeight * 0.8;

      case "percentage":
        const percentage = config.containerPercentage || 0.8;
        let maxHeight = this.containerHeight * percentage;
        const neighborSpace = config.neighborSpace ?? 120;
        if (maxHeight > this.containerHeight - neighborSpace) {
          maxHeight = this.containerHeight - neighborSpace;
        }
        return Math.max(maxHeight, 200);

      case "fixed":
      default:
        let fixedHeight =
          this.containerHeight * (config.containerPercentage || 0.8);
        const space = config.neighborSpace ?? 120;
        if (fixedHeight > this.containerHeight - space) {
          fixedHeight = this.containerHeight - space;
        }
        return Math.max(fixedHeight, 200);
    }
  }

  scrollToTop() {
    const targetElement = this.scrollContainerElement;
    if (targetElement) {
      targetElement.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  private getViewportInfo = (): ViewportInfo => {
    const totalCount = this.dataProvider.getTotalCount();

    if (!this.isInitialized || totalCount === 0) {
      return {
        startIndex: 0,
        endIndex: Math.min(totalCount - 1, 10),
      };
    }

    if (this.offsets.length > 1) {
      const overscanHeight = this.overscan * this.defaultItemHeight;
      const viewportTop = this.scrollTop - overscanHeight;
      const viewportBottom =
        this.scrollTop + this.containerHeight + overscanHeight;

      // Binary search works even with sparse data
      const startIndex = Math.max(0, this.findFirstVisible(viewportTop));
      const endIndex = Math.min(
        totalCount - 1,
        this.findLastVisible(viewportBottom)
      );

      return { startIndex, endIndex };
    }

    // Fallback to estimation
    const averageItemWithGap = this.defaultItemHeight + this.gap;
    const startIndex = Math.max(
      0,
      Math.floor(this.scrollTop / averageItemWithGap)
    );
    const endIndex = Math.min(
      totalCount - 1,
      Math.ceil((this.scrollTop + this.containerHeight) / averageItemWithGap)
    );

    return { startIndex, endIndex };
  };

  private getVisibleItems = (): VisibleItem<T>[] => {
    try {
      const totalCount = this.dataProvider.getTotalCount();
      const { startIndex, endIndex } = this.getViewportInfo();

      if (startIndex > endIndex || startIndex >= totalCount) {
        return [];
      }

      const safeEndIndex = Math.min(endIndex, totalCount - 1);
      const items = this.dataProvider.getData(startIndex, safeEndIndex);

      return items.map((item, index) => {
        const actualIndex = startIndex + index;
        const measurement = {
          height: this.heights[actualIndex],
          top: this.offsets[actualIndex],
        };

        return {
          id: item.id,
          content: item.content,
          index: actualIndex,
          measurement,
          isMaximized: actualIndex === this.maximizedItemIndex,
          maximizationConfig: this.maximizationConfig,
        };
      });
    } catch (error) {
      console.error("Error getting visible items:", error);
      return [];
    }
  };

  getSnapshot = () => {
    try {
      return {
        visibleItems: this.getVisibleItems(),
        totalHeight: this.getTotalHeight(),
        showScrollToTop: this.showScrollToTop,
        maximizedItemIndex: this.maximizedItemIndex,
        isInitialized: this.isInitialized,
        maximizationConfig: this.maximizationConfig,
      };
    } catch (error) {
      console.error("Error getting snapshot:", error);
      return {
        visibleItems: [],
        showScrollToTop: false,
        maximizedItemIndex: null,
        isInitialized: false,
        totalHeight: 0,
        maximizationConfig: this.maximizationConfig,
      };
    }
  };

  initialize() {
    console.info("🔧 Initializing manager...", this.uuid);
    this.setupDataSubscription();
  }

  dispose() {
    console.info("🧹 Cleaning up the list...", this.uuid);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.scrollEventCleanup) {
      this.scrollEventCleanup();
      this.scrollEventCleanup = null;
    }
    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
      this.dataUnsubscribe = null;
    }
    this.subscribers.clear();
    this.scrollContainerElement = null;
    this.isInitialized = false;
  }
}

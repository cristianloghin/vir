import {
  DataProvider,
  ItemMeasurement,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  MaximizationConfig,
} from "../types";
import { setDifference } from "../utils";
import { TransitionManager } from "./TransitionManager";
import { VirtualizationCalculator } from "./VirtualizationCalculator";

export class VirtualizedListManager<T = any> {
  private uuid: string;

  private dataProvider: DataProvider<T>;
  private measurements = new Map<string, ItemMeasurement>();
  private defaultItemHeight: number;
  private containerHeight = 0;
  private scrollTop = 0;
  private maximizedItemId: string | null = null;
  private maximizedHeight = 0;
  private overscan = 5;
  private subscribers = new Set<() => void>();
  private resizeObserver: ResizeObserver | null = null;
  private containerElement: HTMLElement | null = null;
  private showScrollToTop = false;
  private isInitialized = false;
  private lastKnownScrollTop = 0;
  private scrollTopRatio = 0;
  private notifyScheduled = false;
  private dataUnsubscribe: (() => void) | null = null;

  // Configuration
  private config: VirtualizedListConfig;
  private maximizationConfig: MaximizationConfig;

  // New properties for data transition handling
  private transitionManager: TransitionManager;

  private calculator: VirtualizationCalculator;

  constructor(
    dataProvider: DataProvider<T>,
    config: VirtualizedListConfig = {}
  ) {
    this.dataProvider = dataProvider;
    this.config = config;

    this.defaultItemHeight = config.defaultItemHeight ?? 100;
    this.calculator = new VirtualizationCalculator(this.defaultItemHeight);

    // Set default maximization config
    this.maximizationConfig = {
      mode: "fixed",
      containerPercentage: 0.8,
      clipOverflow: true,
      neighborSpace: 120,
      ...config.maximization,
    };

    this.setupDataSubscription();
    this.captureDataSnapshot();

    this.transitionManager = new TransitionManager(
      this.captureDataSnapshot,
      this.updateMeasurements.bind(this),
      this.notify.bind(this),
      this.getTotalHeight.bind(this),
      this.scrollToItemById.bind(this),
      this.dataProvider.getTotalCount,
      this.getListState.bind(this),
      this.setScrollTop.bind(this),
      this.clearMaximization.bind(this),
      this.cleanupRemovedItems.bind(this)
    );

    this.uuid = Math.random().toString(36).substring(2, 10);
    console.info("🆕 Created VirtualizedListManager", this.uuid);
  }

  private getListState() {
    return {
      scrollTopRatio: this.scrollTopRatio,
      maximizedItemId: this.maximizedItemId,
      containerElement: this.containerElement,
      containerHeight: this.containerHeight,
    };
  }

  private setScrollTop(value: number) {
    if (!this.containerElement) return;
    this.containerElement.scrollTop = value;
  }

  private cleanupRemovedItems(oldIds: Set<string>, newIds: Set<string>) {
    const removedIds = setDifference(oldIds, newIds);

    for (const removedId of removedIds) {
      this.measurements.delete(removedId);
    }

    if (removedIds.size > 0) {
      console.log(
        `Cleaned up measurements for ${removedIds.size} removed items`
      );
    }
  }

  private clearMaximization() {
    this.maximizedItemId = null;
    this.maximizedHeight = 0;
  }

  private setupDataSubscription() {
    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
    }

    this.dataUnsubscribe = this.dataProvider.subscribe(() => {
      this.transitionManager.handleDataChange();
    });
  }

  private captureDataSnapshot = (): Set<string> => {
    // Efficiently capture current item IDs
    if (this.dataProvider.getCurrentItemIds) {
      return new Set(this.dataProvider.getCurrentItemIds());
    }

    // Fallback: sample a reasonable range to detect changes
    const totalCount = this.dataProvider.getTotalCount();
    const sampleSize = Math.min(totalCount, 200); // Sample first 200 items
    const sampleItems = this.dataProvider.getData(0, sampleSize - 1);
    return new Set(sampleItems.map((item) => item.id));
  };

  private scrollToItemById(itemId: string) {
    if (!this.containerElement) return;

    const measurement = this.measurements.get(itemId);
    if (!measurement) {
      // Item not measured yet - try to find its index and estimate position
      const totalCount = this.dataProvider.getTotalCount();
      const sampleSize = Math.min(totalCount, 100);
      const items = this.dataProvider.getData(0, sampleSize - 1);
      const itemIndex = items.findIndex((item) => item.id === itemId);

      if (itemIndex !== -1) {
        // Estimate position
        const estimatedTop = itemIndex * this.defaultItemHeight;
        this.containerElement.scrollTop = estimatedTop;
      }
      return;
    }

    // Scroll to center the item if it's maximized, otherwise just make it visible
    const itemTop = measurement.top;
    const itemHeight = measurement.height;
    const viewTop = this.scrollTop;
    const viewBottom = viewTop + this.containerHeight;

    let targetScrollTop;

    if (itemId === this.maximizedItemId) {
      // Center the maximized item
      targetScrollTop = itemTop - (this.containerHeight - itemHeight) / 2;
    } else {
      // Just make it visible
      if (itemTop < viewTop) {
        targetScrollTop = itemTop;
      } else if (itemTop + itemHeight > viewBottom) {
        targetScrollTop = itemTop + itemHeight - this.containerHeight;
      } else {
        // Already visible
        return;
      }
    }

    const totalHeight = this.getTotalHeight();
    const maxScrollTop = Math.max(0, totalHeight - this.containerHeight);
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

    this.containerElement.scrollTo({
      top: targetScrollTop,
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

  setContainer(element: HTMLElement | null) {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.containerElement = element;
    if (element) {
      const initialHeight = element.clientHeight;
      this.containerHeight = initialHeight;

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
              if (this.containerElement && this.scrollTopRatio > 0) {
                const newTotalHeight = this.getTotalHeight();
                const newScrollTop =
                  this.scrollTopRatio *
                  Math.max(0, newTotalHeight - this.containerHeight);
                this.containerElement.scrollTop = Math.max(0, newScrollTop);
              }
            });

            this.notify();
          }
        }
      });

      this.resizeObserver.observe(element);
      this.isInitialized = true;
      this.notify();
    }
  }

  handleScroll(scrollTop: number) {
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
  }

  measureItem(id: string, index: number, height: number) {
    if (height <= 0) return;

    const existingMeasurement = this.measurements.get(id);
    const hasChanged =
      !existingMeasurement || Math.abs(existingMeasurement.height - height) > 1;

    if (hasChanged) {
      this.measurements.set(id, { height, top: 0 });

      // Update measurements immediately to prevent overlaps on first render
      this.updateMeasurements();

      // Also schedule async update for performance
      requestAnimationFrame(() => {
        this.updateMeasurements();
        this.notify();
      });
    }
  }

  private updateMeasurements() {
    const totalCount = this.dataProvider.getTotalCount();
    if (totalCount === 0) return;

    // Batch fetch all items instead of individual calls
    const allItems = this.dataProvider.getData(0, totalCount - 1);
    let currentTop = 0;

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const existingMeasurement = this.measurements.get(item.id);

      let height = existingMeasurement?.height || this.defaultItemHeight;

      // For natural mode, don't override height - let the component measure itself
      if (
        item.id === this.maximizedItemId &&
        this.maximizedHeight > 0 &&
        this.maximizationConfig.mode !== "natural"
      ) {
        height = this.maximizedHeight;
      }

      this.measurements.set(item.id, {
        height,
        top: currentTop,
      });

      currentTop += height;
    }
  }

  private getTotalHeight(): number {
    const totalCount = this.dataProvider.getTotalCount();

    if (this.measurements.size === 0) {
      return totalCount * this.defaultItemHeight;
    }

    let totalHeight = 0;
    let measuredItems = 0;

    this.measurements.forEach((measurement) => {
      totalHeight += measurement.height;
      measuredItems++;
    });

    const unmeasuredItems = totalCount - measuredItems;
    totalHeight += unmeasuredItems * this.defaultItemHeight;

    return totalHeight;
  }

  toggleMaximize(itemId: string, customMaximizedHeight?: number) {
    if (this.maximizedItemId === itemId) {
      this.maximizedItemId = null;
      this.maximizedHeight = 0;
    } else {
      this.maximizedItemId = itemId;

      // Calculate height based on configuration
      this.maximizedHeight = this.calculateMaximizedHeight(
        customMaximizedHeight
      );

      requestAnimationFrame(() => {
        this.scrollToItemById(itemId);
      });
    }

    this.updateMeasurements();
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
        const neighborSpace = config.neighborSpace || 120;
        if (maxHeight > this.containerHeight - neighborSpace) {
          maxHeight = this.containerHeight - neighborSpace;
        }
        return Math.max(maxHeight, 200);

      case "fixed":
      default:
        let fixedHeight =
          this.containerHeight * (config.containerPercentage || 0.8);
        const space = config.neighborSpace || 120;
        if (fixedHeight > this.containerHeight - space) {
          fixedHeight = this.containerHeight - space;
        }
        return Math.max(fixedHeight, 200);
    }
  }

  scrollToTop() {
    if (this.containerElement) {
      this.containerElement.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  getViewportInfo(): ViewportInfo {
    const totalCount = this.dataProvider.getTotalCount();

    if (!this.isInitialized || totalCount === 0) {
      return {
        scrollTop: 0,
        containerHeight: this.containerHeight,
        startIndex: 0,
        endIndex: Math.min(totalCount - 1, 10),
        totalHeight: totalCount * this.defaultItemHeight,
        totalCount,
      };
    }

    this.updateMeasurements();

    const totalHeight = this.getTotalHeight();
    let startIndex = 0;
    let endIndex = totalCount - 1;

    if (this.measurements.size > 0 && totalCount > 0) {
      const overscanHeight = this.overscan * this.defaultItemHeight;
      const viewportTop = this.scrollTop - overscanHeight;
      const viewportBottom =
        this.scrollTop + this.containerHeight + overscanHeight;

      // Walk through measurements to find visible range
      startIndex = totalCount;
      endIndex = -1;

      // Get all items to walk through their actual positions
      const allItems = this.dataProvider.getData(0, totalCount - 1);

      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        const measurement = this.measurements.get(item.id);

        if (measurement) {
          const itemTop = measurement.top;
          const itemBottom = itemTop + measurement.height;

          // Check if item intersects with viewport
          if (itemBottom >= viewportTop && itemTop <= viewportBottom) {
            startIndex = Math.min(startIndex, i);
            endIndex = Math.max(endIndex, i);
          }
        }
      }

      // Fallback if no measured items are visible
      if (startIndex === totalCount || endIndex === -1) {
        startIndex = Math.floor(viewportTop / this.defaultItemHeight);
        startIndex = Math.max(0, Math.min(startIndex, totalCount - 1));

        endIndex = Math.ceil(viewportBottom / this.defaultItemHeight);
        endIndex = Math.max(startIndex, Math.min(endIndex, totalCount - 1));
      }
    }

    return {
      scrollTop: this.scrollTop,
      containerHeight: this.containerHeight,
      startIndex: Math.max(0, startIndex),
      endIndex: Math.min(totalCount - 1, endIndex),
      totalHeight,
      totalCount,
    };
  }

  getVisibleItems(): VisibleItem<T>[] {
    try {
      const { startIndex, endIndex, totalCount } = this.getViewportInfo();

      if (startIndex > endIndex || startIndex >= totalCount) {
        return [];
      }

      const safeEndIndex = Math.min(endIndex, totalCount - 1);
      const items = this.dataProvider.getData(startIndex, safeEndIndex);

      return items.map((item, index) => {
        const actualIndex = startIndex + index;
        const measurement = this.measurements.get(item.id);

        return {
          id: item.id,
          content: item.content,
          index: actualIndex,
          measurement,
          isMaximized: item.id === this.maximizedItemId,
          maximizationConfig: this.maximizationConfig,
        };
      });
    } catch (error) {
      console.error("Error getting visible items:", error);
      return [];
    }
  }

  getMaximizationConfig(): MaximizationConfig {
    return this.maximizationConfig;
  }

  getSnapshot = () => {
    try {
      return {
        viewportInfo: this.getViewportInfo(),
        visibleItems: this.getVisibleItems(),
        showScrollToTop: this.showScrollToTop,
        maximizedItemId: this.maximizedItemId,
        isInitialized: this.isInitialized,
        maximizationConfig: this.maximizationConfig,
      };
    } catch (error) {
      console.error("Error getting snapshot:", error);
      return {
        viewportInfo: {
          scrollTop: 0,
          containerHeight: 0,
          startIndex: 0,
          endIndex: 0,
          totalHeight: 0,
          totalCount: 0,
        },
        visibleItems: [],
        showScrollToTop: false,
        maximizedItemId: null,
        isInitialized: false,
        maximizationConfig: this.maximizationConfig,
      };
    }
  };

  initialize() {
    console.info("🔧 Initializing manager...", this.uuid);
    this.setupDataSubscription();
    this.captureDataSnapshot();
  }

  dispose() {
    console.info("🧹 Cleaning up the list...", this.uuid);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
      this.dataUnsubscribe = null;
    }
    this.subscribers.clear();
    this.containerElement = null;
    this.isInitialized = false;
  }
}

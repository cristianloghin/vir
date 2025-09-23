import {
  DataProvider,
  ItemMeasurement,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  MaximizationConfig,
} from "../types";
import { setDifference } from "../utils";
import { ScrollContainer } from "./ScrollContainer";
import { TransitionManager } from "./TransitionManager";

export class VirtualizedListManager<T = any> {
  private uuid: string;

  private dataProvider: DataProvider<T>;
  private measurements = new Map<string, ItemMeasurement>();
  private defaultItemHeight: number;
  private gap: number;

  private containerHeight = 0;
  private maximizedItemId: string | null = null;
  private maximizedHeight = 0;
  private overscan = 5;
  private subscribers = new Set<() => void>();

  private isInitialized = false;
  private notifyScheduled = false;
  private dataUnsubscribe: (() => void) | null = null;

  // Configuration
  private maximizationConfig: MaximizationConfig;

  // New properties for data transition handling
  private transitionManager: TransitionManager;
  private scrollContainer: ScrollContainer;

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

    this.setupDataSubscription();
    this.captureDataSnapshot();

    this.scrollContainer = new ScrollContainer(
      this.dataProvider,
      this.notify,
      this.getTotalHeight,
      this.defaultItemHeight
    );

    this.transitionManager = new TransitionManager(
      this.updateMeasurements.bind(this),
      this.notify,
      this.getTotalHeight,
      this.scrollToItemById.bind(this),
      this.dataProvider.getTotalCount,
      this.getListState,
      this.setScrollTop.bind(this),
      this.clearMaximization.bind(this),
      this.cleanupRemovedItems.bind(this)
    );

    this.uuid = Math.random().toString(36).substring(2, 10);
    console.info("🆕 Created VirtualizedListManager", this.uuid);
  }

  private getListState = () => {
    return {
      scrollTopRatio: this.scrollContainer.getRatio(),
      maximizedItemId: this.maximizedItemId,
      containerElement: this.scrollContainer.getContainer(),
      containerHeight: this.containerHeight,
    };
  };

  private setScrollTop = (value: number) => {
    this.scrollContainer.setScrollTop(value);
  };

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

  private cleanupPlaceholderMeasurements() {
    const keysToRemove: string[] = [];

    this.measurements.forEach((_, key) => {
      if (key.startsWith("__placeholder-") || key.startsWith("__error-")) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach((key) => {
      this.measurements.delete(key);
    });

    if (keysToRemove.length > 0) {
      console.info(
        `🧹 Cleaned up ${keysToRemove.length} placeholder measurements`
      );
      // Force recalculation of positions after cleanup
      this.updateMeasurements();
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
      const newSnapshot = this.captureDataSnapshot();
      this.transitionManager.handleDataChange(newSnapshot);
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
    const measurement = this.measurements.get(itemId);
    const isMaximized = itemId === this.maximizedItemId;
    this.scrollContainer.scrollToItemById(itemId, isMaximized, measurement);
  }

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  private notify = () => {
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
  };

  setScrollContainer = (element: HTMLElement) => {
    this.scrollContainer.init(element);
    this.isInitialized = true;
  };

  handleScroll = (scrollTop: number) => {
    this.scrollContainer.handleScroll(scrollTop);
  };

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
    const isRealData = !allItems.some((item) =>
      item.id.startsWith("__placeholder-")
    );

    if (isRealData) {
      this.cleanupPlaceholderMeasurements();
    }

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

      currentTop += height + (i < allItems.length - 1 ? this.gap : 0);
    }
  }

  private getTotalHeight = (): number => {
    const totalCount = this.dataProvider.getTotalCount();

    if (this.measurements.size === 0) {
      const totalGaps = Math.max(0, totalCount - 1) * this.gap;
      return totalCount * this.defaultItemHeight + totalGaps;
    }

    let totalHeight = 0;
    let measuredItems = 0;

    this.measurements.forEach((measurement) => {
      totalHeight += measurement.height;
      measuredItems++;
    });

    const unmeasuredItems = totalCount - measuredItems;
    const unmeasuredHeight = unmeasuredItems * this.defaultItemHeight;
    const totalGaps = Math.max(0, totalCount - 1) * this.gap;

    return totalHeight + unmeasuredHeight + totalGaps;
  };

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

  scrollToTop = () => {
    this.scrollContainer.scrollToTop();
  };

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
      const scrollTop = this.scrollContainer.getScrollTop();
      const viewportTop = scrollTop - overscanHeight;
      const viewportBottom = scrollTop + this.containerHeight + overscanHeight;

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
        const averageItemWithGap = this.defaultItemHeight + this.gap;
        startIndex = Math.floor(viewportTop / averageItemWithGap);
        startIndex = Math.max(0, Math.min(startIndex, totalCount - 1));

        endIndex = Math.ceil(viewportBottom / averageItemWithGap);
        endIndex = Math.max(startIndex, Math.min(endIndex, totalCount - 1));
      }
    }

    return {
      scrollTop: this.scrollContainer.getScrollTop(),
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
        showScrollToTop: this.scrollContainer.getShowScroll(),
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

    this.scrollContainer.cleanup();

    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
      this.dataUnsubscribe = null;
    }
    this.subscribers.clear();
    this.isInitialized = false;
  }
}

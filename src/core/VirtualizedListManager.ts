import {
  DataProvider,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  MaximizationConfig,
  VirtualizedListInterface,
  ListState,
} from "../types";
import { Measurements } from "./Measurements";
import { ScrollContainer } from "./ScrollContainer";
import { TransitionManager } from "./TransitionManager";

export class VirtualizedListManager<T = any>
  implements VirtualizedListInterface<T>
{
  private uuid: string;

  private dataProvider: DataProvider<T>;

  private defaultItemHeight: number;
  private gap: number;

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
  private measurements: Measurements;

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

    this.measurements = new Measurements(
      this.dataProvider,
      this.notify,
      this.scrollToItemById,
      this.getContainerHeight,
      this.maximizationConfig,
      this.defaultItemHeight,
      this.gap
    );

    this.scrollContainer = new ScrollContainer(
      this.dataProvider,
      this.notify,
      this.getTotalHeight,
      this.defaultItemHeight
    );

    this.transitionManager = new TransitionManager(
      this.updateMeasurements,
      this.notify,
      this.getTotalHeight,
      this.scrollToItemById,
      this.dataProvider.getTotalCount,
      this.getListState,
      this.setScrollTop,
      this.clearMaximization,
      this.cleanupRemovedItems
    );

    this.uuid = Math.random().toString(36).substring(2, 10);
    console.info("🆕 Created VirtualizedListManager", this.uuid);
  }

  // Public methods

  measureItem = (id: string, index: number, height: number) => {
    this.measurements.measureItem(id, index, height);
  };

  toggleMaximize = (itemId: string, maximizedHeight?: number) => {
    this.measurements.toggleMaximize(itemId, maximizedHeight);
  };

  setScrollContainer = (element: HTMLElement) => {
    this.scrollContainer.init(element);
    this.isInitialized = true;
  };

  handleScroll = (scrollTop: number) => {
    this.scrollContainer.handleScroll(scrollTop);
  };

  scrollToTop = () => {
    this.scrollContainer.scrollToTop();
  };

  initialize = (abortSignal: AbortSignal) => {
    if (abortSignal.aborted) {
      throw new DOMException("Signal already aborted", "AbortError");
    }

    abortSignal.addEventListener("abort", this.dispose, { once: true });

    this.setupDataSubscription();
    this.captureDataSnapshot();
    console.info("🔧 Initialized virtualized list with id:", this.uuid);
  };

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  getSnapshot = (): ListState<T> => {
    try {
      return {
        viewportInfo: this.getViewportInfo(),
        visibleItems: this.getVisibleItems(),
        showScrollToTop: this.scrollContainer.getShowScroll(),
        maximizedItemId: this.measurements.getMaximizedItemId(),
        isInitialized: this.isInitialized,
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
      };
    }
  };

  // Private methods

  private getListState = () => {
    return {
      scrollTopRatio: this.scrollContainer.getRatio(),
      maximizedItemId: this.measurements.getMaximizedItemId(),
      containerElement: this.scrollContainer.getContainer(),
      containerHeight: this.scrollContainer.getContainerHeight(),
    };
  };

  private setScrollTop = (value: number) => {
    this.scrollContainer.setScrollTop(value);
  };

  private updateMeasurements = () => {
    this.measurements.updateMeasurements();
  };

  private cleanupRemovedItems = (oldIds: Set<string>, newIds: Set<string>) => {
    this.measurements.cleanupRemovedItems(oldIds, newIds);
  };

  private clearMaximization = () => {
    this.measurements.clearMaximization();
  };

  private getTotalHeight = () => {
    return this.measurements.getTotalHeight();
  };

  private getContainerHeight = () => {
    return this.scrollContainer.getContainerHeight();
  };

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

  private scrollToItemById = (itemId: string) => {
    const measurement = this.measurements.getMeasurementById(itemId);
    const isMaximized = itemId === this.measurements.getMaximizedItemId();
    this.scrollContainer.scrollToItemById(itemId, isMaximized, measurement);
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

  private getViewportInfo = (): ViewportInfo => {
    const totalCount = this.dataProvider.getTotalCount();

    if (!this.isInitialized || totalCount === 0) {
      return {
        scrollTop: 0,
        containerHeight: this.getContainerHeight(),
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

    if (this.measurements.getSize() > 0 && totalCount > 0) {
      const overscanHeight = this.overscan * this.defaultItemHeight;
      const scrollTop = this.scrollContainer.getScrollTop();
      const viewportTop = scrollTop - overscanHeight;
      const viewportBottom =
        scrollTop + this.getContainerHeight() + overscanHeight;

      // Walk through measurements to find visible range
      startIndex = totalCount;
      endIndex = -1;

      // Get all items to walk through their actual positions
      const allItems = this.dataProvider.getData(0, totalCount - 1);

      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        const measurement = this.measurements.getMeasurementById(item.id);

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
      containerHeight: this.getContainerHeight(),
      startIndex: Math.max(0, startIndex),
      endIndex: Math.min(totalCount - 1, endIndex),
      totalHeight,
      totalCount,
    };
  };

  private getVisibleItems = (): VisibleItem<T>[] => {
    try {
      const { startIndex, endIndex, totalCount } = this.getViewportInfo();

      if (startIndex > endIndex || startIndex >= totalCount) {
        return [];
      }

      const safeEndIndex = Math.min(endIndex, totalCount - 1);
      const items = this.dataProvider.getData(startIndex, safeEndIndex);

      return items.map((item, index) => {
        const actualIndex = startIndex + index;
        const measurement = this.measurements.getMeasurementById(item.id);

        return {
          id: item.id,
          content: item.content,
          index: actualIndex,
          measurement,
          isMaximized: item.id === this.measurements.getMaximizedItemId(),
          maximizationConfig: this.maximizationConfig,
        };
      });
    } catch (error) {
      console.error("Error getting visible items:", error);
      return [];
    }
  };

  private dispose = () => {
    console.info("🧹 Cleaning up the list...", this.uuid);

    this.scrollContainer.cleanup();

    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
      this.dataUnsubscribe = null;
    }
    this.subscribers.clear();
    this.isInitialized = false;
  };
}

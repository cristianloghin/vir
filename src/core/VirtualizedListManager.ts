import {
  DataProviderInterface,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  MaximizationConfig,
  VirtualizedListInterface,
  ListState,
} from "../types";
import { Measurements } from "./Measurements";
import { ScrollContainer } from "./ScrollContainer";

export class VirtualizedListManager<TData = unknown, TTransformed = TData>
  implements VirtualizedListInterface<TData, TTransformed>
{
  private uuid: string;

  private dataProvider: DataProviderInterface<TData, TTransformed>;

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
  private scrollContainer: ScrollContainer;
  private measurements: Measurements;

  constructor(
    dataProvider: DataProviderInterface<TData, TTransformed>,
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

    this.measurements = new Measurements(
      this.getOrderedIds,
      this.notify,
      this.scrollToItemById,
      this.getContainerHeight,
      this.maximizationConfig,
      this.defaultItemHeight,
      this.gap
    );

    this.scrollContainer = new ScrollContainer(
      this.getOrderedIds,
      this.notify,
      this.getTotalHeight,
      this.defaultItemHeight
    );

    this.uuid = Math.random().toString(36).substring(2, 10);
    console.info("🆕 Created VirtualizedListManager", this.uuid);
  }

  // Public methods

  measureItem = (id: string, height: number) => {
    this.measurements.measureItem(id, height);
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
    console.info("🔧 Initialized virtualized list with id:", this.uuid);
  };

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  getSnapshot = (): ListState<TTransformed> => {
    return {
      viewportInfo: this.getViewportInfo(),
      visibleItems: this.getVisibleItems(),
      showScrollToTop: this.scrollContainer.getShowScroll(),
      maximizedItemId: this.measurements.getMaximizedItemId(),
      isInitialized: this.isInitialized,
    };
  };

  // Private methods
  private getOrderedIds = () => {
    return this.dataProvider.getOrderedIds();
  };

  private getTotalHeight = () => {
    return this.measurements.getTotalHeight();
  };

  private getContainerHeight = () => {
    return this.scrollContainer.getContainerHeight();
  };

  private setupDataSubscription = () => {
    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
    }

    this.dataUnsubscribe = this.dataProvider.subscribe(() => {
      this.measurements.startNewVersion();
      this.measurements.buildMeasurements();
    });
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
    const orderedIds = this.dataProvider.getOrderedIds();
    const totalCount = orderedIds.length;
    const totalHeight = this.getTotalHeight();

    if (!this.isInitialized || totalCount === 0) {
      return {
        totalHeight: totalCount * this.defaultItemHeight,
        totalCount,
      };
    }

    return {
      totalHeight,
      totalCount,
    };
  };

  private getVisibleItems = (): VisibleItem<TTransformed>[] => {
    const orderedIds = this.dataProvider.getOrderedIds();
    const scrollTop = this.scrollContainer.getScrollTop();
    const containerHeight = this.scrollContainer.getContainerHeight();
    const overscanHeight = this.overscan * this.defaultItemHeight;

    const viewportTop = Math.max(0, scrollTop - overscanHeight);
    const viewportBottom = scrollTop + containerHeight + overscanHeight;

    const visibleItems: VisibleItem<TTransformed>[] = [];

    for (const id of orderedIds) {
      const measurement = this.measurements.getMeasurementById(id);

      if (measurement) {
        const itemTop = measurement.top;
        const itemBottom = itemTop + measurement.height;

        // Check if item intersects with viewport
        if (itemBottom >= viewportTop && itemTop <= viewportBottom) {
          const item = this.dataProvider.getItemById(id);
          if (item) {
            visibleItems.push({
              id: item.id,
              content: item.content,
              measurement,
              isMaximized: item.id === this.measurements.getMaximizedItemId(),
              maximizationConfig: this.maximizationConfig,
            });
          }
        }
      }
    }

    return visibleItems;
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

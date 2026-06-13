import {
  DataProviderInterface,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  VisibilityChange,
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

  // Visibility reporting: the truly-visible window (viewport + margin) is
  // narrower than the overscan render window. Ids visible at the last emit are
  // kept so we can diff for enter/exit transitions.
  private visibilityMargin: number;
  private onVisibleChange?: (change: VisibilityChange) => void;
  private prevVisibleIds = new Set<string>();

  private isInitialized = false;
  private notifyScheduled = false;
  private dataUnsubscribe: (() => void) | null = null;

  // Snapshot cache: getSnapshot is called by useSyncExternalStore on every
  // render and must return a stable reference until notify invalidates it.
  // prevVisibleById preserves per-item identity across snapshots so memoized
  // item components bail out when their item didn't change.
  private snapshot: ListState<TTransformed> | null = null;
  private prevSnapshot: ListState<TTransformed> | null = null;
  private prevVisibleById = new Map<string, VisibleItem<TTransformed>>();

  // Configuration
  private maximizationConfig: MaximizationConfig;

  // New properties for data transition handling
  private scrollContainer: ScrollContainer;
  private measurements: Measurements;
  // Last attached scroll element, kept so initialize() can re-attach after
  // a dispose/initialize cycle (e.g. StrictMode effect re-runs) when the
  // React ref callback won't fire again
  private scrollElement: HTMLElement | null = null;

  constructor(
    dataProvider: DataProviderInterface<TData, TTransformed>,
    config: VirtualizedListConfig = {}
  ) {
    this.dataProvider = dataProvider;

    this.defaultItemHeight = config.defaultItemHeight ?? 100;
    this.gap = config.gap ?? 0;
    this.visibilityMargin = config.visibilityMargin ?? 200;
    this.onVisibleChange = config.onVisibleChange;

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

  // The hook re-syncs this every render so an inline consumer callback never
  // goes stale; the manager itself is created once.
  setOnVisibleChange = (callback?: (change: VisibilityChange) => void) => {
    this.onVisibleChange = callback;
  };

  setScrollContainer = (element: HTMLElement) => {
    if (element === this.scrollElement) return;
    this.scrollElement = element;
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

    // Re-attach the scroll container after a previous dispose: the React
    // ref callback only fires on mount, not on effect re-runs
    if (this.scrollElement) {
      this.scrollContainer.init(this.scrollElement);
      this.isInitialized = true;
    }

    console.info("🔧 Initialized virtualized list with id:", this.uuid);
  };

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  getSnapshot = (): ListState<TTransformed> => {
    if (this.snapshot) return this.snapshot;

    const next: ListState<TTransformed> = {
      viewportInfo: this.getViewportInfo(),
      visibleItems: this.getVisibleItems(),
      showScrollToTop: this.scrollContainer.getShowScroll(),
      maximizedItemId: this.measurements.getMaximizedItemId(),
      isInitialized: this.isInitialized,
      error: this.dataProvider.getState().error,
    };

    // Keep the previous snapshot when nothing observable changed so React
    // can bail out of re-rendering entirely
    this.snapshot =
      this.prevSnapshot && this.snapshotsEqual(this.prevSnapshot, next)
        ? this.prevSnapshot
        : next;
    this.prevSnapshot = this.snapshot;
    return this.snapshot;
  };

  private snapshotsEqual = (
    a: ListState<TTransformed>,
    b: ListState<TTransformed>
  ): boolean => {
    if (
      a.showScrollToTop !== b.showScrollToTop ||
      a.maximizedItemId !== b.maximizedItemId ||
      a.isInitialized !== b.isInitialized ||
      a.error !== b.error ||
      a.viewportInfo.totalHeight !== b.viewportInfo.totalHeight ||
      a.viewportInfo.totalCount !== b.viewportInfo.totalCount ||
      a.visibleItems.length !== b.visibleItems.length
    ) {
      return false;
    }
    // Reference comparison suffices: getVisibleItems reuses item objects
    // whose id, content, position, and maximized state are unchanged
    for (let i = 0; i < a.visibleItems.length; i++) {
      if (a.visibleItems[i] !== b.visibleItems[i]) return false;
    }
    return true;
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
    this.snapshot = null;
    if (!this.notifyScheduled) {
      this.notifyScheduled = true;
      Promise.resolve().then(() => {
        this.notifyScheduled = false;
        this.emitVisibilityChange();
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

    // The (margin-expanded) viewport, narrower than the overscan window above:
    // items between the two are rendered but reported as not visible.
    const visibleTop = Math.max(0, scrollTop - this.visibilityMargin);
    const visibleBottom = scrollTop + containerHeight + this.visibilityMargin;

    const visibleItems: VisibleItem<TTransformed>[] = [];
    const count = orderedIds.length;
    if (count === 0) {
      this.prevVisibleById.clear();
      return visibleItems;
    }

    const maximizedItemId = this.measurements.getMaximizedItemId();
    const nextVisibleById = new Map<string, VisibleItem<TTransformed>>();

    // Binary search for the first item whose bottom edge reaches the
    // viewport. buildMeasurements lays items out sequentially, so both
    // tops and bottoms are monotonically increasing. If a measurement is
    // missing (nothing built yet), fall back to scanning from the start.
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.measurements.getMeasurementById(orderedIds[mid]);
      if (!m) {
        lo = 0;
        break;
      }
      if (m.top + m.height < viewportTop) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    for (let i = lo; i < count; i++) {
      const measurement = this.measurements.getMeasurementById(orderedIds[i]);
      if (!measurement) continue;

      const itemTop = measurement.top;
      // Tops are monotonic: everything after this is below the viewport
      if (itemTop > viewportBottom) break;
      // Only reachable on the unbuilt fallback path
      if (itemTop + measurement.height < viewportTop) continue;

      const item = this.dataProvider.getItemById(orderedIds[i]);
      if (item) {
        const isMaximized = item.id === maximizedItemId;
        const isVisible =
          itemTop < visibleBottom && itemTop + measurement.height > visibleTop;
        const prev = this.prevVisibleById.get(item.id);

        // Reuse the previous wrapper when nothing about the item changed,
        // so memoized item components skip re-rendering. Positions are
        // copied (never live references to the mutable internal
        // measurements), which is what makes this comparison sound.
        const visible: VisibleItem<TTransformed> =
          prev &&
          prev.content === item.content &&
          prev.metadata === item.metadata &&
          prev.isMaximized === isMaximized &&
          prev.isVisible === isVisible &&
          prev.measurement?.top === itemTop &&
          prev.measurement?.height === measurement.height
            ? prev
            : {
                id: item.id,
                content: item.content,
                metadata: item.metadata,
                measurement: { top: itemTop, height: measurement.height },
                isMaximized,
                isVisible,
                maximizationConfig: this.maximizationConfig,
              };

        nextVisibleById.set(item.id, visible);
        visibleItems.push(visible);
      }
    }

    this.prevVisibleById = nextVisibleById;
    return visibleItems;
  };

  // Ids whose box intersects the margin-expanded viewport, in list order.
  // Lean scan (binary search + walk) so it can run on every notify flush
  // independently of React rendering.
  private computeVisibleIds = (): string[] => {
    if (!this.isInitialized) return [];

    const orderedIds = this.dataProvider.getOrderedIds();
    const count = orderedIds.length;
    if (count === 0) return [];

    const scrollTop = this.scrollContainer.getScrollTop();
    const containerHeight = this.scrollContainer.getContainerHeight();
    const top = Math.max(0, scrollTop - this.visibilityMargin);
    const bottom = scrollTop + containerHeight + this.visibilityMargin;

    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.measurements.getMeasurementById(orderedIds[mid]);
      if (!m) {
        lo = 0;
        break;
      }
      if (m.top + m.height < top) lo = mid + 1;
      else hi = mid;
    }

    const ids: string[] = [];
    for (let i = lo; i < count; i++) {
      const m = this.measurements.getMeasurementById(orderedIds[i]);
      if (!m) continue;
      // Same strict intersection as `isVisible` in getVisibleItems: an item
      // whose edge merely touches the window boundary does not count.
      if (m.top >= bottom) break;
      if (m.top + m.height <= top) continue;
      ids.push(orderedIds[i]);
    }
    return ids;
  };

  private emitVisibilityChange = () => {
    if (!this.onVisibleChange) return;

    const visibleIds = this.computeVisibleIds();
    const currentSet = new Set(visibleIds);

    const enteredIds = visibleIds.filter((id) => !this.prevVisibleIds.has(id));
    const exitedIds: string[] = [];
    for (const id of this.prevVisibleIds) {
      if (!currentSet.has(id)) exitedIds.push(id);
    }

    // Only report real transitions; an unchanged set is silent.
    if (enteredIds.length === 0 && exitedIds.length === 0) return;

    this.prevVisibleIds = currentSet;
    this.onVisibleChange({ visibleIds, enteredIds, exitedIds });
  };

  private dispose = () => {
    console.info("🧹 Cleaning up the list...", this.uuid);

    this.scrollContainer.cleanup();

    if (this.dataUnsubscribe) {
      this.dataUnsubscribe();
      this.dataUnsubscribe = null;
    }
    // Subscribers are NOT cleared here: each owns the unsubscribe function
    // returned by subscribe(), and useSyncExternalStore's subscription must
    // survive an initialize/dispose cycle (StrictMode re-runs effects in
    // an order that would otherwise drop it)
    this.isInitialized = false;
    // Re-init recomputes visibility from scratch, so old ids must not linger
    // and produce phantom exit events on the next emit.
    this.prevVisibleIds.clear();
  };
}

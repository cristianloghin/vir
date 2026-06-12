import {
  DataProviderInterface,
  ItemMeasurement,
  MaximizationConfig,
} from "../types";

export class Measurements {
  private measurements = new Map<string, ItemMeasurement>();
  private maximizedItemId: string | null = null;
  // Height the maximized item had before maximizing, restored on collapse
  private restoreHeight: number | null = null;
  private currentVersion = 0;
  // Total height computed during buildMeasurements; getTotalHeight is on
  // the per-scroll hot path and must not re-sum the whole list
  private cachedTotalHeight: number | null = null;
  private rafScheduled = false;

  constructor(
    private getOrderedIds: () => string[],
    private notify: () => void,
    private scrollToItemById: (id: string) => void,
    private getContainerHeight: () => number,
    private maximizationConfig: MaximizationConfig,
    private defaultItemHeight: number,
    private gap: number
  ) {}

  startNewVersion = () => this.currentVersion++;

  measureItem = (id: string, height: number) => {
    if (height <= 0) return;

    const existingMeasurement = this.measurements.get(id);
    const hasChanged =
      !existingMeasurement || Math.abs(existingMeasurement.height - height) > 1;

    if (hasChanged) {
      const top = existingMeasurement?.top ?? 0;
      const measurement: ItemMeasurement = {
        height,
        top,
        version: this.currentVersion,
        lastUsed: Date.now(),
      };
      this.measurements.set(id, measurement);
      this.buildMeasurements();
    }
  };

  buildMeasurements = () => {
    const orderedIds = this.getOrderedIds();
    const now = Date.now();
    let currentTop = 0;

    for (const id of orderedIds) {
      const measurement = this.measurements.get(id);

      if (measurement) {
        measurement.top = currentTop;
        measurement.lastUsed = now;
        measurement.version = this.currentVersion;
        currentTop += measurement.height + this.gap;
      } else {
        this.measurements.set(id, {
          height: this.defaultItemHeight,
          top: currentTop,
          version: this.currentVersion,
          lastUsed: now,
        });
        currentTop += this.defaultItemHeight + this.gap;
      }
    }

    // currentTop includes a trailing gap after the last item
    this.cachedTotalHeight =
      orderedIds.length > 0 ? currentTop - this.gap : 0;

    // Coalesce: a burst of measureItem calls (one per ResizeObserver
    // entry) must not queue one frame callback each
    if (!this.rafScheduled) {
      this.rafScheduled = true;
      requestAnimationFrame(() => {
        this.rafScheduled = false;
        this.cleanupStaleMeasurements();
        this.notify();
      });
    }
  };

  private cleanupStaleMeasurements = () => {
    const cutoff = Date.now() - 60000;
    for (const [id, measurement] of this.measurements) {
      if (
        measurement.version < this.currentVersion - 1 ||
        measurement.lastUsed < cutoff
      ) {
        this.measurements.delete(id);
      }
    }
  };

  getTotalHeight = (): number => {
    // buildMeasurements runs synchronously on every data change and item
    // measurement, so the cache is only missing before the first build:
    // estimate from default heights there
    if (this.cachedTotalHeight !== null) {
      return this.cachedTotalHeight;
    }

    const totalCount = this.getOrderedIds().length;
    const totalGaps = Math.max(0, totalCount - 1) * this.gap;
    return totalCount * this.defaultItemHeight + totalGaps;
  };

  toggleMaximize = (itemId: string, customMaximizedHeight?: number) => {
    const isCollapsing = this.maximizedItemId === itemId;
    let layoutChanged = false;

    // Restore the currently maximized item (whether collapsing it or
    // switching to another item) to its pre-maximize height; the
    // ResizeObserver corrects it if the natural size changed meanwhile.
    if (this.maximizedItemId) {
      const prev = this.measurements.get(this.maximizedItemId);
      if (prev && this.restoreHeight !== null) {
        prev.height = this.restoreHeight;
        layoutChanged = true;
      }
      this.restoreHeight = null;
      this.maximizedItemId = null;
    }

    if (!isCollapsing) {
      this.maximizedItemId = itemId;
      const measurement = this.measurements.get(itemId);
      if (measurement) {
        this.restoreHeight = measurement.height;
        // In "natural" mode the item sizes itself and is re-measured by
        // the ResizeObserver; calculateMaximizedHeight returns 0 there,
        // which must not be written into the measurement.
        const height = this.calculateMaximizedHeight(customMaximizedHeight);
        if (height > 0) {
          measurement.height = height;
          layoutChanged = true;
        }
      }
    }

    if (layoutChanged) {
      this.buildMeasurements(); // notifies subscribers via rAF
    } else {
      // maximizedItemId changed without a layout change (natural mode):
      // subscribers still need to re-render the isMaximized state
      this.notify();
    }

    if (!isCollapsing) {
      // After buildMeasurements so the scroll target uses fresh tops
      this.scrollToItemById(itemId);
    }
  };

  private calculateMaximizedHeight(customHeight?: number): number {
    if (customHeight) return customHeight;
    if (this.maximizationConfig.mode === "natural") return 0;
    if (this.maximizationConfig.mode === "custom") {
      return (
        this.maximizationConfig.maxHeight || this.getContainerHeight() * 0.8
      );
    }

    const containerHeight = this.getContainerHeight();
    const percentage = this.maximizationConfig.containerPercentage || 0.8;
    const neighborSpace = this.maximizationConfig.neighborSpace || 120;

    let height = Math.round(containerHeight * percentage);
    if (height > containerHeight - neighborSpace) {
      height = containerHeight - neighborSpace;
    }
    return Math.max(height, 200);
  }

  getMeasurementById = (id: string) => {
    const measurement = this.measurements.get(id);
    if (measurement && measurement.version === this.currentVersion) {
      return measurement;
    }
    return;
  };
  getMaximizedItemId = () => this.maximizedItemId;
}

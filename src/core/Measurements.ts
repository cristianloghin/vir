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
    let currentTop = 0;

    for (const id of orderedIds) {
      const measurement = this.measurements.get(id);

      if (measurement) {
        measurement.top = currentTop;
        measurement.lastUsed = Date.now();
        measurement.version = this.currentVersion;
        currentTop += measurement.height + this.gap;
      } else {
        this.measurements.set(id, {
          height: this.defaultItemHeight,
          top: currentTop,
          version: this.currentVersion,
          lastUsed: Date.now(),
        });
        currentTop += this.defaultItemHeight + this.gap;
      }
    }

    requestAnimationFrame(() => {
      this.cleanupStaleMeasurements();
      this.notify();
    });
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
    const orderedIds = this.getOrderedIds();
    const totalCount = orderedIds.length;

    if (this.measurements.size === 0) {
      const totalGaps = Math.max(0, totalCount - 1) * this.gap;
      return totalCount * this.defaultItemHeight + totalGaps;
    }

    let totalHeight = 0;
    let measuredItems = 0;

    for (const id of orderedIds) {
      const measurement = this.measurements.get(id);
      if (measurement && measurement.version === this.currentVersion) {
        totalHeight += measurement.height;
        measuredItems++;
      }
    }

    const unmeasuredItems = totalCount - measuredItems;
    const unmeasuredHeight = unmeasuredItems * this.defaultItemHeight;
    const totalGaps = Math.max(0, totalCount - 1) * this.gap;

    return totalHeight + unmeasuredHeight + totalGaps;
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

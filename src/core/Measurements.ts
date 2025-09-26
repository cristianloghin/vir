import { DataProvider, ItemMeasurement, MaximizationConfig } from "../types";

export class Measurements {
  private measurements = new Map<string, ItemMeasurement>();
  private maximizedItemId: string | null = null;
  private currentVersion = 0;

  constructor(
    private dataProvider: DataProvider,
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
      console.debug("measure item", id, height);
      const top = existingMeasurement?.top ?? 0;
      const measurement: ItemMeasurement = {
        height,
        top,
        version: this.currentVersion,
        lastUsed: Date.now(),
      };
      this.measurements.set(id, measurement);

      // Update measurements immediately to prevent overlaps on first render
      this.updateMeasurements(id, top + height + this.gap);

      // Also schedule async update for performance
      requestAnimationFrame(() => {
        this.updateMeasurements(id, top + height + this.gap);
        this.notify();
      });
    }
  };

  updateMeasurements = (itemId: string, itemTop: number) => {
    const orderedIds = this.dataProvider.getOrderedIds();
    const itemIndex = orderedIds.findIndex((i) => i === itemId);

    const itemsToUpdate = orderedIds.slice(itemIndex + 1);
    let currentTop = itemTop;

    for (const id of itemsToUpdate) {
      const measurement = this.measurements.get(id);
      if (measurement) {
        measurement.top = currentTop;
        measurement.lastUsed = Date.now();
        currentTop += measurement.height + this.gap;
      }
    }
  };

  buildMeasurements = (orderedIds: string[]) => {
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

    this.cleanupStaleMeasurements();
    this.notify();
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
    const orderedIds = this.dataProvider.getOrderedIds();
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
    if (this.maximizedItemId === itemId) {
      this.maximizedItemId = null;
    } else {
      this.maximizedItemId = itemId;
      requestAnimationFrame(() => {
        this.scrollToItemById(itemId);
      });
    }

    const measurement = this.measurements.get(itemId);
    const top = measurement?.top ?? 0;

    // Calculate height based on configuration
    const height = this.calculateMaximizedHeight(customMaximizedHeight);
    this.updateMeasurements(itemId, top + height + this.gap);
    this.notify();
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

    let height = containerHeight * percentage;
    if (height > containerHeight - neighborSpace) {
      height = containerHeight - neighborSpace;
    }
    return Math.max(height, 200);
  }

  clearMaximization = () => {
    this.maximizedItemId = null;
  };

  getMeasurements = () => this.measurements;
  getSize = () => this.measurements.size;
  getMeasurementById = (id: string) => {
    const measurement = this.measurements.get(id);
    if (measurement && measurement.version === this.currentVersion) {
      return measurement;
    }
    return;
  };
  getMaximizedItemId = () => this.maximizedItemId;
}

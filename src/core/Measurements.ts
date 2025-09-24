import { DataProvider, ItemMeasurement, MaximizationConfig } from "../types";
import { setDifference } from "../utils";

export class Measurements {
  private measurements = new Map<string, ItemMeasurement>();
  private maximizedItemId: string | null = null;
  private maximizedHeight = 0;

  constructor(
    private dataProvider: DataProvider,
    private notify: () => void,
    private scrollToItemById: (id: string) => void,
    private getContainerHeight: () => number,
    private maximizationConfig: MaximizationConfig,
    private defaultItemHeight: number,
    private gap: number
  ) {}

  measureItem = (id: string, index: number, height: number) => {
    if (height <= 0) return;

    const existingMeasurement = this.measurements.get(id);
    const hasChanged =
      !existingMeasurement || Math.abs(existingMeasurement.height - height) > 1;

    if (hasChanged) {
      console.debug("set item height", id, index, height);
      this.measurements.set(id, { height, top: 0 });

      // Update measurements immediately to prevent overlaps on first render
      this.updateMeasurements();

      // Also schedule async update for performance
      requestAnimationFrame(() => {
        this.updateMeasurements();
        this.notify();
      });
    }
  };

  updateMeasurements = () => {
    const totalCount = this.dataProvider.getTotalCount();
    if (totalCount === 0) return;

    // Batch fetch all items instead of individual calls
    const allItems = this.dataProvider.getData(0, totalCount - 1);
    this.cleanupPlaceholderMeasurements();

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
  };

  cleanupRemovedItems = (oldIds: Set<string>, newIds: Set<string>) => {
    const removedIds = setDifference(oldIds, newIds);

    for (const removedId of removedIds) {
      this.measurements.delete(removedId);
    }

    if (removedIds.size > 0) {
      console.log(
        `Cleaned up measurements for ${removedIds.size} removed items`
      );
    }
  };

  getTotalHeight = (): number => {
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

  toggleMaximize = (itemId: string, customMaximizedHeight?: number) => {
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
  };

  private cleanupPlaceholderMeasurements = () => {
    const keysToRemove = Array.from(this.measurements.keys()).filter(
      (k) => k.startsWith("__placeholder-") || k.startsWith("__error-")
    );
    keysToRemove.forEach((k) => this.measurements.delete(k));
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
    this.maximizedHeight = 0;
  };

  getMeasurements = () => this.measurements;
  getSize = () => this.measurements.size;
  getMeasurementById = (id: string) => this.measurements.get(id);
  getMaximizedItemId = () => this.maximizedItemId;
}

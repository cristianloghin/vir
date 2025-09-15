/**
 * VirtualizationCalculator - Optimized positioning and viewport calculations
 *
 * Handles all the math-heavy operations for virtualization with O(log n) performance
 * Separates calculation logic from the main manager class
 */

interface MeasurementEntry {
  itemIndex: number;
  itemId: string;
  top: number;
  height: number;
}

interface ViewportRange {
  startIndex: number;
  endIndex: number;
  visibleTop: number;
  visibleBottom: number;
}

interface PositionEstimate {
  top: number;
  height: number;
  isEstimated: boolean;
}

interface CalculatorState {
  totalItems: number;
  defaultItemHeight: number;
  maximizedItemId: string | null;
  maximizedHeight: number;
}

export class VirtualizationCalculator {
  // Sorted array of measurements for binary search
  private measurementIndex: MeasurementEntry[] = [];

  // Quick lookup map for O(1) access by itemId
  private measurementMap = new Map<string, MeasurementEntry>();

  // Calculator state
  private state: CalculatorState;

  // Performance tracking
  private lastCalculationTime = 0;
  private calculationCount = 0;

  constructor(defaultItemHeight: number = 100) {
    this.state = {
      totalItems: 0,
      defaultItemHeight,
      maximizedItemId: null,
      maximizedHeight: 0,
    };
  }

  // Update calculator state
  updateState(updates: Partial<CalculatorState>) {
    this.state = { ...this.state, ...updates };
  }

  // Add or update a single measurement when index is known - O(log n) insertion
  updateMeasurement(
    itemId: string,
    itemIndex: number,
    height: number
  ): boolean {
    const startTime = performance.now();

    const existingEntry = this.measurementMap.get(itemId);
    const actualHeight =
      itemId === this.state.maximizedItemId
        ? this.state.maximizedHeight
        : height;

    if (existingEntry) {
      // Update existing measurement
      if (Math.abs(existingEntry.height - actualHeight) < 1) {
        return false; // No significant change
      }

      const heightDelta = actualHeight - existingEntry.height;
      existingEntry.height = actualHeight;

      // Update positions for all subsequent items
      this.updateSubsequentPositions(existingEntry.itemIndex, heightDelta);
    } else {
      // Add new measurement
      const estimatedPosition = this.estimateItemPosition(itemIndex);
      const newEntry: MeasurementEntry = {
        itemIndex,
        itemId,
        top: estimatedPosition.top,
        height: actualHeight,
      };

      // Insert in sorted order
      this.insertMeasurement(newEntry);
      this.measurementMap.set(itemId, newEntry);

      // Recalculate positions from this point forward
      this.recalculatePositionsFrom(itemIndex);
    }

    this.trackPerformance(startTime);
    return true;
  }

  // Remove measurement - O(log n)
  removeMeasurement(itemId: string): boolean {
    const entry = this.measurementMap.get(itemId);
    if (!entry) return false;

    // Remove from both structures
    this.measurementMap.delete(itemId);
    const arrayIndex = this.measurementIndex.indexOf(entry);
    if (arrayIndex !== -1) {
      this.measurementIndex.splice(arrayIndex, 1);
    }

    // Recalculate positions from this point
    this.recalculatePositionsFrom(entry.itemIndex);
    return true;
  }

  // Batch remove measurements - more efficient than individual removes
  removeMeasurements(itemIds: Set<string>) {
    if (itemIds.size === 0) return;

    const startTime = performance.now();

    // Remove from map
    let minAffectedIndex = Infinity;
    for (const itemId of itemIds) {
      const entry = this.measurementMap.get(itemId);
      if (entry) {
        minAffectedIndex = Math.min(minAffectedIndex, entry.itemIndex);
        this.measurementMap.delete(itemId);
      }
    }

    // Remove from array (filter is more efficient than multiple splices)
    this.measurementIndex = this.measurementIndex.filter(
      (entry) => !itemIds.has(entry.itemId)
    );

    // Recalculate from the earliest affected index
    if (minAffectedIndex !== Infinity) {
      this.recalculatePositionsFrom(minAffectedIndex);
    }

    this.trackPerformance(startTime);
  }

  // Find visible range using binary search - O(log n)
  calculateViewportRange(
    scrollTop: number,
    containerHeight: number,
    overscan: number = 5
  ): ViewportRange {
    const startTime = performance.now();

    if (this.measurementIndex.length === 0) {
      // No measurements - use estimation
      const overscanHeight = overscan * this.state.defaultItemHeight;
      const startIndex = Math.floor(
        (scrollTop - overscanHeight) / this.state.defaultItemHeight
      );
      const endIndex = Math.ceil(
        (scrollTop + containerHeight + overscanHeight) /
          this.state.defaultItemHeight
      );

      return {
        startIndex: Math.max(0, startIndex),
        endIndex: Math.min(this.state.totalItems - 1, endIndex),
        visibleTop: scrollTop,
        visibleBottom: scrollTop + containerHeight,
      };
    }

    const overscanHeight = overscan * this.state.defaultItemHeight;
    const viewportTop = scrollTop - overscanHeight;
    const viewportBottom = scrollTop + containerHeight + overscanHeight;

    // Binary search for start index
    const startIndex = this.binarySearchByPosition(viewportTop, "start");
    const endIndex = this.binarySearchByPosition(viewportBottom, "end");

    this.trackPerformance(startTime);

    return {
      startIndex: Math.max(0, startIndex),
      endIndex: Math.min(this.state.totalItems - 1, endIndex),
      visibleTop: scrollTop,
      visibleBottom: scrollTop + containerHeight,
    };
  }

  // Get position for a specific item - O(log n) or O(1) if measured
  getItemPosition(itemId: string, itemIndex?: number): PositionEstimate {
    const measured = this.measurementMap.get(itemId);
    if (measured) {
      return {
        top: measured.top,
        height: measured.height,
        isEstimated: false,
      };
    }

    if (itemIndex !== undefined) {
      return {
        ...this.estimateItemPosition(itemIndex),
        isEstimated: true,
      };
    }

    // Fallback estimation
    return {
      top: 0,
      height: this.state.defaultItemHeight,
      isEstimated: true,
    };
  }

  // Calculate total height - O(1) using last measurement + estimation
  getTotalHeight(): number {
    if (this.measurementIndex.length === 0) {
      return this.state.totalItems * this.state.defaultItemHeight;
    }

    const lastMeasured =
      this.measurementIndex[this.measurementIndex.length - 1];
    const measuredHeight = lastMeasured.top + lastMeasured.height;
    const unmeasuredItems = this.state.totalItems - lastMeasured.itemIndex - 1;
    const estimatedHeight = unmeasuredItems * this.state.defaultItemHeight;

    return measuredHeight + estimatedHeight;
  }

  // Get all measurements in a range - O(log n + k) where k is result size
  getMeasurementsInRange(
    startIndex: number,
    endIndex: number
  ): MeasurementEntry[] {
    if (this.measurementIndex.length === 0) return [];

    const result: MeasurementEntry[] = [];

    // Find the first measurement >= startIndex
    let left = 0;
    let right = this.measurementIndex.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.measurementIndex[mid].itemIndex >= startIndex) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Collect measurements in range
    for (let i = left; i < this.measurementIndex.length; i++) {
      const entry = this.measurementIndex[i];
      if (entry.itemIndex > endIndex) break;
      result.push(entry);
    }

    return result;
  }

  // Reset all measurements - useful for data changes
  reset() {
    this.measurementIndex = [];
    this.measurementMap.clear();
  }

  // Get performance statistics
  getPerformanceStats() {
    return {
      totalCalculations: this.calculationCount,
      lastCalculationTime: this.lastCalculationTime,
      measurementCount: this.measurementIndex.length,
      averageCalculationTime:
        this.calculationCount > 0
          ? this.lastCalculationTime / this.calculationCount
          : 0,
    };
  }

  // --- Private Methods ---

  private insertMeasurement(entry: MeasurementEntry) {
    // Binary search for insertion point
    let left = 0;
    let right = this.measurementIndex.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.measurementIndex[mid].itemIndex < entry.itemIndex) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    this.measurementIndex.splice(left, 0, entry);
  }

  private binarySearchByPosition(
    targetPosition: number,
    type: "start" | "end"
  ): number {
    if (this.measurementIndex.length === 0) {
      return Math.floor(targetPosition / this.state.defaultItemHeight);
    }

    let left = 0;
    let right = this.measurementIndex.length - 1;
    let result = type === "start" ? this.state.totalItems : 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const entry = this.measurementIndex[mid];
      const itemBottom = entry.top + entry.height;

      if (type === "start") {
        // Find first item that ends after targetPosition
        if (itemBottom > targetPosition) {
          result = entry.itemIndex;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      } else {
        // Find last item that starts before targetPosition
        if (entry.top < targetPosition) {
          result = entry.itemIndex;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }

    return result;
  }

  private estimateItemPosition(itemIndex: number): PositionEstimate {
    if (this.measurementIndex.length === 0) {
      return {
        top: itemIndex * this.state.defaultItemHeight,
        height: this.state.defaultItemHeight,
        isEstimated: true,
      };
    }

    // Find the closest measured item before this index
    let closestBefore: MeasurementEntry | null = null;

    for (let i = this.measurementIndex.length - 1; i >= 0; i--) {
      const entry = this.measurementIndex[i];
      if (entry.itemIndex < itemIndex) {
        closestBefore = entry;
        break;
      }
    }

    if (closestBefore) {
      const itemsBetween = itemIndex - closestBefore.itemIndex - 1;
      const estimatedTop =
        closestBefore.top +
        closestBefore.height +
        itemsBetween * this.state.defaultItemHeight;

      return {
        top: estimatedTop,
        height: this.state.defaultItemHeight,
        isEstimated: true,
      };
    }

    // No measurements before this index - estimate from beginning
    return {
      top: itemIndex * this.state.defaultItemHeight,
      height: this.state.defaultItemHeight,
      isEstimated: true,
    };
  }

  private updateSubsequentPositions(fromIndex: number, heightDelta: number) {
    for (let i = 0; i < this.measurementIndex.length; i++) {
      const entry = this.measurementIndex[i];
      if (entry.itemIndex > fromIndex) {
        entry.top += heightDelta;
      }
    }
  }

  private recalculatePositionsFrom(startIndex: number) {
    const len = this.measurementIndex.length;
    if (len === 0) return;

    // Find first array index with itemIndex >= startIndex
    let i = 0;
    while (i < len && this.measurementIndex[i].itemIndex < startIndex) {
      i++;
    }

    // Find all measurements from startIndex onwards and recalculate their positions
    let currentTop = 0;
    let nextExpectedIndex = startIndex;

    // If there is a measured item before startIndex, start from its bottom
    if (i > 0) {
      const prev = this.measurementIndex[i - 1];
      currentTop = prev.top + prev.height;

      // Add default heights for unmeasured items between prev.itemIndex and startIndex - 1
      const missingBefore = startIndex - (prev.itemIndex + 1);
      if (missingBefore > 0) {
        currentTop += missingBefore * this.state.defaultItemHeight;
      }
    } else if (startIndex > 0) {
      // No measured items before startIndex -> estimate from beginning
      currentTop = startIndex * this.state.defaultItemHeight;
    }

    // Recalculate positions for all measuments from i onwards
    for (; i < len; i++) {
      const entry = this.measurementIndex[i];
      console.info("recalculatePositionsFrom", startIndex, entry);
      if (entry.itemIndex >= startIndex) {
        const gapItems = entry.itemIndex - nextExpectedIndex;
        if (gapItems > 0) {
          currentTop += gapItems * this.state.defaultItemHeight;
        }

        entry.top = currentTop;
        currentTop += entry.height;
        nextExpectedIndex = entry.itemIndex + 1;
      }
    }
  }

  private trackPerformance(startTime: number) {
    this.lastCalculationTime = performance.now() - startTime;
    this.calculationCount++;
  }
}

// Usage example for integration with main manager class:
/*
class VirtualizedListManager {
  private calculator = new VirtualizationCalculator(this.defaultItemHeight);
  
  measureItem(id: string, index: number, height: number) {
    if (this.calculator.updateMeasurement(id, index, height)) {
      this.notify();
    }
  }
  
  getViewportInfo(): ViewportInfo {
    const range = this.calculator.calculateViewportRange(
      this.scrollTop, 
      this.containerHeight, 
      this.overscan
    );
    
    return {
      ...range,
      totalHeight: this.calculator.getTotalHeight(),
      // ... other properties
    };
  }
  
  handleDataChange() {
    // When data changes, update calculator state
    this.calculator.updateState({
      totalItems: this.dataProvider.getTotalCount(),
      maximizedItemId: this.maximizedItemId,
      maximizedHeight: this.maximizedHeight
    });
    
    // Clean up measurements for removed items
    const removedIds = this.determineRemovedItems();
    this.calculator.removeMeasurements(removedIds);
  }
}
*/

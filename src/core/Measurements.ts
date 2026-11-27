import { ItemPosition } from "../types";

type IndexedMeasurement = ItemPosition & { index: number };

export class Measurements {
  private measurements = new Map<string, IndexedMeasurement>();
  private dirtyFrom: IndexedMeasurement | null = null;
  private cachedTotalHeight: number | null = null;
  private rafScheduled = false;

  constructor(
    private getOrderedIds: () => string[],
    private notify: () => void,
    private defaultItemHeight: number,
    private gap: number
  ) {}

  measureItem = (id: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    if (this.cachedTotalHeight === null) this.buildMeasurements();
    const measurement = this.measurements.get(id);
    // A late observer entry must not resurrect a removed row.
    if (!measurement || Math.abs(measurement.height - height) <= 1) return;
    measurement.height = height;
    if (!this.dirtyFrom || measurement.index < this.dirtyFrom.index) {
      this.dirtyFrom = measurement;
    }
    this.scheduleUpdate();
  };

  buildMeasurements = () => {
    const ids = this.getOrderedIds();
    this.rebuildFrom(ids, 0, 0);
    if (this.measurements.size > ids.length) {
      for (const [id, measurement] of this.measurements) {
        if (ids[measurement.index] !== id) this.measurements.delete(id);
      }
    }
    this.scheduleUpdate();
  };

  // Height reports can arrive in any order. The earliest changed row's old
  // top is still correct; only its suffix needs laying out before the next read.
  private flushHeights = () => {
    if (this.dirtyFrom) {
      this.rebuildFrom(
        this.getOrderedIds(),
        this.dirtyFrom.index,
        this.dirtyFrom.top
      );
    }
  };

  private rebuildFrom = (
    orderedIds: string[],
    index: number,
    currentTop: number
  ) => {
    this.dirtyFrom = null;

    for (let i = index; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const measurement = this.measurements.get(id);

      if (measurement) {
        measurement.index = i;
        measurement.top = currentTop;
        currentTop += measurement.height + this.gap;
      } else {
        this.measurements.set(id, {
          height: this.defaultItemHeight,
          index: i,
          top: currentTop,
        });
        currentTop += this.defaultItemHeight + this.gap;
      }
    }

    // currentTop includes a trailing gap after the last item
    this.cachedTotalHeight =
      orderedIds.length > 0 ? currentTop - this.gap : 0;
  };

  private scheduleUpdate = () => {
    if (!this.rafScheduled) {
      this.rafScheduled = true;
      requestAnimationFrame(() => {
        this.rafScheduled = false;
        this.flushHeights();
        this.notify();
      });
    }
  };

  getTotalHeight = (): number => {
    this.flushHeights();
    if (this.cachedTotalHeight !== null) {
      return this.cachedTotalHeight;
    }

    const totalCount = this.getOrderedIds().length;
    const totalGaps = Math.max(0, totalCount - 1) * this.gap;
    return totalCount * this.defaultItemHeight + totalGaps;
  };

  getMeasurementById = (id: string): ItemPosition | undefined => {
    this.flushHeights();
    return this.measurements.get(id);
  };
}

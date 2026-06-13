import { ItemMeasurement } from "../types";

export class Measurements {
  private measurements = new Map<string, ItemMeasurement>();
  private currentVersion = 0;
  // Total height computed during buildMeasurements; getTotalHeight is on
  // the per-scroll hot path and must not re-sum the whole list
  private cachedTotalHeight: number | null = null;
  private rafScheduled = false;

  constructor(
    private getOrderedIds: () => string[],
    private notify: () => void,
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

  getMeasurementById = (id: string) => {
    const measurement = this.measurements.get(id);
    if (measurement && measurement.version === this.currentVersion) {
      return measurement;
    }
    return;
  };
}

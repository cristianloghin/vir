import { describe, expect, it, vi } from "vitest";
import { Measurements } from "../src/core/Measurements";
import { MaximizationConfig } from "../src/types";

const createMeasurements = (
  ids: string[],
  maximization: Partial<MaximizationConfig> = {},
  { defaultItemHeight = 100, gap = 10, containerHeight = 600 } = {}
) => {
  const notify = vi.fn();
  const scrollToItemById = vi.fn();
  const measurements = new Measurements(
    () => ids,
    notify,
    scrollToItemById,
    () => containerHeight,
    {
      mode: "fixed",
      containerPercentage: 0.8,
      clipOverflow: true,
      neighborSpace: 120,
      ...maximization,
    },
    defaultItemHeight,
    gap
  );
  return { measurements, notify, scrollToItemById };
};

describe("Measurements", () => {
  it("lays items out sequentially with gaps", () => {
    const { measurements } = createMeasurements(["a", "b", "c"]);
    measurements.buildMeasurements();

    expect(measurements.getMeasurementById("a")?.top).toBe(0);
    expect(measurements.getMeasurementById("b")?.top).toBe(110);
    expect(measurements.getMeasurementById("c")?.top).toBe(220);
    expect(measurements.getTotalHeight()).toBe(320);
  });

  it("estimates total height from defaults before the first build", () => {
    const { measurements } = createMeasurements(["a", "b", "c"]);
    expect(measurements.getTotalHeight()).toBe(320);
  });

  it("repositions following items when one is measured", () => {
    const { measurements } = createMeasurements(["a", "b", "c"]);
    measurements.buildMeasurements();

    measurements.measureItem("a", 150);

    expect(measurements.getMeasurementById("a")?.height).toBe(150);
    expect(measurements.getMeasurementById("b")?.top).toBe(160);
    expect(measurements.getTotalHeight()).toBe(370);
  });

  it("ignores sub-pixel and non-positive measurements", () => {
    const { measurements } = createMeasurements(["a", "b"]);
    measurements.buildMeasurements();
    measurements.measureItem("a", 150);

    measurements.measureItem("a", 150.5);
    expect(measurements.getMeasurementById("a")?.height).toBe(150);

    measurements.measureItem("a", 0);
    expect(measurements.getMeasurementById("a")?.height).toBe(150);
  });

  describe("toggleMaximize", () => {
    it("applies the calculated height and scrolls to the item", () => {
      const { measurements, scrollToItemById } = createMeasurements([
        "a",
        "b",
        "c",
      ]);
      measurements.buildMeasurements();

      measurements.toggleMaximize("b");

      // min(600 * 0.8, 600 - 120) = 480
      expect(measurements.getMeasurementById("b")?.height).toBe(480);
      expect(measurements.getMeasurementById("c")?.top).toBe(110 + 480 + 10);
      expect(measurements.getMaximizedItemId()).toBe("b");
      expect(scrollToItemById).toHaveBeenCalledWith("b");
    });

    it("restores the pre-maximize height on collapse", () => {
      const { measurements, scrollToItemById } = createMeasurements([
        "a",
        "b",
        "c",
      ]);
      measurements.buildMeasurements();
      measurements.measureItem("b", 140);

      measurements.toggleMaximize("b");
      measurements.toggleMaximize("b");

      expect(measurements.getMeasurementById("b")?.height).toBe(140);
      expect(measurements.getMaximizedItemId()).toBeNull();
      // No scroll on collapse
      expect(scrollToItemById).toHaveBeenCalledTimes(1);
    });

    it("restores the previous item when maximizing another", () => {
      const { measurements } = createMeasurements(["a", "b", "c"]);
      measurements.buildMeasurements();

      measurements.toggleMaximize("a");
      measurements.toggleMaximize("b");

      expect(measurements.getMeasurementById("a")?.height).toBe(100);
      expect(measurements.getMeasurementById("b")?.height).toBe(480);
      expect(measurements.getMaximizedItemId()).toBe("b");
    });

    it("uses a custom height when provided", () => {
      const { measurements } = createMeasurements(["a", "b"]);
      measurements.buildMeasurements();

      measurements.toggleMaximize("a", 300);

      expect(measurements.getMeasurementById("a")?.height).toBe(300);
    });

    it("leaves the height alone in natural mode but still notifies", () => {
      const { measurements, notify } = createMeasurements(["a", "b"], {
        mode: "natural",
      });
      measurements.buildMeasurements();
      notify.mockClear();

      measurements.toggleMaximize("a");

      expect(measurements.getMeasurementById("a")?.height).toBe(100);
      expect(measurements.getMaximizedItemId()).toBe("a");
      expect(notify).toHaveBeenCalled();
    });
  });
});

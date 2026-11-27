import { describe, expect, it, vi } from "vitest";
import { Measurements } from "../src/core/Measurements";

const createMeasurements = (
  ids: string[],
  { defaultItemHeight = 100, gap = 10 } = {}
) => {
  const measurements = new Measurements(
    () => ids,
    () => {},
    defaultItemHeight,
    gap
  );
  return { measurements };
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

  it("lays out only one suffix for a burst of out-of-order height reports", async () => {
    const prefixRead = vi.fn(() => "a");
    const ids = ["a", "b", "c", "d", "e"];
    Object.defineProperty(ids, 0, { get: prefixRead });
    const getIds = vi.fn(() => ids);
    const measurements = new Measurements(getIds, () => {}, 100, 10);
    measurements.buildMeasurements();
    await new Promise((resolve) => setTimeout(resolve, 0));
    getIds.mockClear();
    prefixRead.mockClear();

    measurements.measureItem("d", 140);
    measurements.measureItem("c", 180);
    measurements.measureItem("d", 160);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(measurements.getMeasurementById("d")?.top).toBe(410);
    expect(measurements.getMeasurementById("e")?.top).toBe(580);
    expect(measurements.getTotalHeight()).toBe(680);
    expect(getIds).toHaveBeenCalledTimes(1);
    expect(prefixRead).not.toHaveBeenCalled();
  });

  it("uses the new order when data changes before queued heights flush", () => {
    const ids = ["a", "b", "c"];
    const { measurements } = createMeasurements(ids);
    measurements.buildMeasurements();
    measurements.measureItem("c", 180);
    ids.reverse();
    measurements.buildMeasurements();
    measurements.measureItem("a", 160);

    expect(measurements.getTotalHeight()).toBe(460);
    expect(measurements.getMeasurementById("c")?.top).toBe(0);
    expect(measurements.getMeasurementById("a")?.top).toBe(300);
  });

  it("drops removed heights immediately, including late reports for removed rows", () => {
    const ids = ["keep", "remove"];
    const { measurements } = createMeasurements(ids);
    measurements.buildMeasurements();
    measurements.measureItem("keep", 170);
    measurements.measureItem("remove", 250);
    ids.pop();
    measurements.buildMeasurements();
    measurements.measureItem("remove", 300);
    expect(measurements.getMeasurementById("remove")).toBeUndefined();
    expect(measurements.getTotalHeight()).toBe(170);

    ids.unshift("remove");
    measurements.buildMeasurements();
    expect(measurements.getMeasurementById("remove")?.height).toBe(100);
    expect(measurements.getMeasurementById("keep")?.top).toBe(110);
    expect(measurements.getTotalHeight()).toBe(280);
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
});

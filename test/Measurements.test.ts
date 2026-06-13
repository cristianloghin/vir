import { describe, expect, it } from "vitest";
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

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDataProvider } from "../src";
import { ListItem } from "../src/types";

interface Row {
  id: string;
  title: string;
}

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, title: `Row ${i}` }));

const normalize = (rows: Row[]): ListItem<Row>[] =>
  rows.map((row) => ({ id: row.id, content: row }));

describe("useDataProvider", () => {
  it("normalizes and exposes the data (simple overload)", () => {
    const rows = makeRows(3);
    const { result } = renderHook(() => useDataProvider(rows, normalize));

    expect(result.current.getOrderedIds()).toEqual(["row-0", "row-1", "row-2"]);
    expect(result.current.getItemById("row-1")?.content).toBe(rows[1]);
  });

  it("does not reapply an inline selector on re-render with unchanged dependencies", () => {
    const rows = makeRows(4);
    const selectorCalls = vi.fn();

    const { result, rerender } = renderHook(
      ({ filter }: { filter: string }) =>
        useDataProvider(rows, normalize, false, false, null, {
          // Inline selector: new function identity on every render
          selector: (items) => {
            selectorCalls();
            return items.filter((item) => item.id.endsWith(filter));
          },
          dependencies: [filter],
        }),
      { initialProps: { filter: "1" } }
    );

    expect(result.current.getOrderedIds()).toEqual(["row-1"]);
    expect(selectorCalls).toHaveBeenCalledTimes(1);

    rerender({ filter: "1" });
    rerender({ filter: "1" });
    expect(selectorCalls).toHaveBeenCalledTimes(1);

    rerender({ filter: "2" });
    expect(selectorCalls).toHaveBeenCalledTimes(2);
    expect(result.current.getOrderedIds()).toEqual(["row-2"]);
  });

  it("treats a re-created array with identical items as unchanged", () => {
    const rows = makeRows(3);
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useDataProvider(data, normalize),
      { initialProps: { data: rows } }
    );

    const subscriber = vi.fn();
    result.current.subscribe(subscriber);
    const idsBefore = result.current.getOrderedIds();

    rerender({ data: [...rows] });

    expect(subscriber).not.toHaveBeenCalled();
    expect(result.current.getOrderedIds()).toBe(idsBefore);
  });

  it("shows placeholders while loading without data", () => {
    const { result } = renderHook(() =>
      useDataProvider(undefined, normalize, true, false, null, {
        placeholderCount: 5,
      })
    );

    expect(result.current.getOrderedIds()).toHaveLength(5);
    expect(result.current.getOrderedIds()[0]).toBe("__placeholder-0");
  });

  it("clears items when data becomes undefined without an error", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] | undefined }) =>
        useDataProvider(data, normalize, false, false, null, undefined),
      { initialProps: { data: makeRows(3) as Row[] | undefined } }
    );

    expect(result.current.getOrderedIds()).toHaveLength(3);

    rerender({ data: undefined });

    expect(result.current.getOrderedIds()).toEqual([]);
  });

  it("surfaces the error state", () => {
    const error = new Error("fetch failed");
    const { result } = renderHook(() =>
      useDataProvider(undefined, normalize, false, false, error, undefined)
    );

    expect(result.current.getState().error).toBe(error);
  });
});

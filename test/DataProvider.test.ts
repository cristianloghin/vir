import { describe, expect, it, vi } from "vitest";
import { DataProvider } from "../src/core/DataProvider";
import { ListItem } from "../src/types";

interface Row {
  value: number;
}

const makeItems = (count: number, offset = 0): ListItem<Row>[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    content: { value: i + offset },
  }));

describe("DataProvider", () => {
  it("exposes ordered ids and items after an update", () => {
    const provider = new DataProvider<Row>({});
    const items = makeItems(3);

    provider.updateRawData(items, false, false, null);

    expect(provider.getOrderedIds()).toEqual(["item-0", "item-1", "item-2"]);
    expect(provider.getTotalCount()).toBe(3);
    expect(provider.getItemById("item-1")).toBe(items[1]);
    expect(provider.getItemById("missing")).toBeNull();
  });

  it("caches the ordered ids array between calls", () => {
    const provider = new DataProvider<Row>({});
    provider.updateRawData(makeItems(3), false, false, null);

    expect(provider.getOrderedIds()).toBe(provider.getOrderedIds());
  });

  it("detects a content change in the middle of the list", () => {
    const provider = new DataProvider<Row>({});
    const subscriber = vi.fn();
    const items = makeItems(3);
    provider.updateRawData(items, false, false, null);
    provider.subscribe(subscriber);

    // Same length, same first/last items: only the middle item changed
    const updated = [items[0], { id: "item-1", content: { value: 99 } }, items[2]];
    provider.updateRawData(updated, false, false, null);

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect((provider.getItemById("item-1")?.content as Row).value).toBe(99);
  });

  it("ignores an update where ids and content references are unchanged", () => {
    const provider = new DataProvider<Row>({});
    const subscriber = vi.fn();
    const items = makeItems(3);
    provider.updateRawData(items, false, false, null);
    provider.subscribe(subscriber);

    provider.updateRawData([...items], false, false, null);

    expect(subscriber).not.toHaveBeenCalled();
  });

  it("notifies on an isRefetching-only change without re-running the selector", () => {
    const provider = new DataProvider<Row>({});
    const subscriber = vi.fn();
    const selector = vi.fn((items: ListItem<Row>[]) => items);
    const items = makeItems(3);

    provider.updateRawData(items, false, false, null);
    provider.updateSelector(selector);
    expect(selector).toHaveBeenCalledTimes(1);

    provider.subscribe(subscriber);
    provider.updateRawData(items, false, true, null);

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(selector).toHaveBeenCalledTimes(1);
    expect(provider.getState().isRefetching).toBe(true);
  });

  it("applies a selector to transform the visible set", () => {
    const provider = new DataProvider<Row>({});
    provider.updateRawData(makeItems(4), false, false, null);
    provider.updateSelector((items) =>
      items.filter((item) => item.content.value % 2 === 0)
    );

    expect(provider.getOrderedIds()).toEqual(["item-0", "item-2"]);
    expect(provider.getItemById("item-1")).toBeNull();
  });

  it("falls back to an empty list and sets the error when a selector throws", () => {
    const provider = new DataProvider<Row>({});
    provider.updateRawData(makeItems(2), false, false, null);
    provider.updateSelector(() => {
      throw new Error("selector boom");
    });

    expect(provider.getOrderedIds()).toEqual([]);
    expect(provider.getState().error?.message).toContain("selector boom");
  });

  it("serves stable placeholders while loading", () => {
    const provider = new DataProvider<Row>({ placeholderCount: 4 });
    provider.updateRawData([], true, false, null);

    const ids = provider.getOrderedIds();
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("__placeholder-0");
    expect(provider.getTotalCount()).toBe(4);

    const placeholder = provider.getItemById("__placeholder-0");
    expect(placeholder?.content).toMatchObject({ __isPlaceholder: true });
    // Stable identity so snapshots can be compared by reference
    expect(provider.getItemById("__placeholder-0")).toBe(placeholder);
  });

  it("does not show placeholders when disabled", () => {
    const provider = new DataProvider<Row>({ showPlaceholders: false });
    provider.updateRawData([], true, false, null);

    expect(provider.getOrderedIds()).toEqual([]);
  });
});

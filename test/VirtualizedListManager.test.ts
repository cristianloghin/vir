import { describe, expect, it, vi } from "vitest";
import { VirtualizedListManager } from "../src/core/VirtualizedListManager";
import { DataProviderInterface, ListItem } from "../src/types";

interface Row {
  value: number;
}

// Flushes the rAF callbacks (setTimeout-backed in test/setup.ts) and the
// microtask-batched subscriber notifications behind them
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const createFakeProvider = (count: number) => {
  const items: ListItem<Row>[] = Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    content: { value: i },
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const ids = items.map((item) => item.id);
  const subscribers = new Set<() => void>();

  const provider: DataProviderInterface<Row, Row> = {
    subscribe: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    updateRawData: () => {},
    updateSelector: () => {},
    getOrderedIds: () => ids,
    getItemById: (id) => byId.get(id) ?? null,
    getTotalCount: () => items.length,
    getState: () => ({
      isLoading: false,
      isRefetching: false,
      error: null,
      rawItemCount: items.length,
      selectedItemCount: items.length,
      hasSelector: false,
      subscriberCount: subscribers.size,
    }),
  };

  return { provider, notifyData: () => subscribers.forEach((cb) => cb()) };
};

const createScrollElement = (clientHeight = 400) => {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  return element;
};

// 100 items of default height 100 in a 400px container with overscan 5:
// the viewport window is [scrollTop - 500, scrollTop + 900]
const createManager = (count = 100) => {
  const { provider, notifyData } = createFakeProvider(count);
  const manager = new VirtualizedListManager(provider, {
    defaultItemHeight: 100,
  });
  notifyData(); // triggers the initial measurement build
  const element = createScrollElement();
  manager.setScrollContainer(element);
  return { manager, element, notifyData };
};

describe("VirtualizedListManager", () => {
  it("windows the visible items around the viewport", () => {
    const { manager } = createManager();
    const { visibleItems, viewportInfo } = manager.getSnapshot();

    expect(viewportInfo.totalCount).toBe(100);
    expect(viewportInfo.totalHeight).toBe(10000);
    // tops <= 900: items 0..9
    expect(visibleItems[0].id).toBe("item-0");
    expect(visibleItems[visibleItems.length - 1].id).toBe("item-9");
    expect(visibleItems).toHaveLength(10);
    expect(visibleItems[3].measurement).toEqual({ top: 300, height: 100 });
  });

  it("moves the window when scrolling", () => {
    const { manager } = createManager();
    manager.handleScroll(5000);

    const { visibleItems, showScrollToTop } = manager.getSnapshot();
    // bottoms >= 4500 and tops <= 5900: items 44..59
    expect(visibleItems[0].id).toBe("item-44");
    expect(visibleItems[visibleItems.length - 1].id).toBe("item-59");
    expect(showScrollToTop).toBe(true);
  });

  it("scrolls an off-screen item into view via scrollToItem", () => {
    const { manager, element } = createManager();

    // item-50 sits at top 5000, far below the 400px viewport at scrollTop 0.
    manager.scrollToItem("item-50");

    // Minimal scroll to reveal it: bottom(5100) - containerHeight(400) = 4700.
    expect(element.scrollTop).toBe(4700);
  });

  it("leaves the scroll position alone when the item is already visible", () => {
    const { manager, element } = createManager();
    element.scrollTop = 0;

    manager.scrollToItem("item-1"); // top 100, already within [0, 400]

    expect(element.scrollTop).toBe(0);
  });

  it("returns the same snapshot reference until something changes", () => {
    const { manager } = createManager();
    expect(manager.getSnapshot()).toBe(manager.getSnapshot());
  });

  it("keeps the previous snapshot when a scroll does not change the window", () => {
    const { manager } = createManager();

    manager.handleScroll(1040);
    const first = manager.getSnapshot();
    manager.handleScroll(1050); // same visible range: items 5..19
    const second = manager.getSnapshot();

    expect(second).toBe(first);
  });

  it("reuses item wrappers for items that stay visible across scrolls", () => {
    const { manager } = createManager();

    manager.handleScroll(1000);
    const first = manager.getSnapshot();
    manager.handleScroll(1200);
    const second = manager.getSnapshot();

    expect(second).not.toBe(first);
    const fromFirst = first.visibleItems.find((i) => i.id === "item-10");
    const fromSecond = second.visibleItems.find((i) => i.id === "item-10");
    expect(fromFirst).toBeDefined();
    expect(fromSecond).toBe(fromFirst);
  });

  it("updates positions and total height after a measurement", async () => {
    const { manager } = createManager();

    manager.measureItem("item-0", 150);
    await flush();

    const { visibleItems, viewportInfo } = manager.getSnapshot();
    expect(viewportInfo.totalHeight).toBe(10050);
    expect(visibleItems.find((i) => i.id === "item-1")?.measurement?.top).toBe(
      150
    );
  });

  it("flags viewport items visible and overscan-only items not visible", () => {
    // 400px container, default margin 200 -> viewport window [0, 600] covers
    // items 0..5; the overscan render window [0, 900] also renders 6..9.
    const { manager } = createManager();
    const { visibleItems } = manager.getSnapshot();
    const byId = (id: string) => visibleItems.find((i) => i.id === id);

    expect(byId("item-0")?.isVisible).toBe(true);
    expect(byId("item-5")?.isVisible).toBe(true);
    expect(byId("item-6")?.isVisible).toBe(false);
    expect(byId("item-9")?.isVisible).toBe(false);
  });

  it("reports visibility transitions to onVisibleChange as the window moves", async () => {
    const onVisibleChange = vi.fn();
    const { provider, notifyData } = createFakeProvider(100);
    const manager = new VirtualizedListManager(provider, {
      defaultItemHeight: 100,
      onVisibleChange,
    });
    notifyData();
    manager.setScrollContainer(createScrollElement());
    await flush();

    // Initial viewport window [0, 600] -> items 0..5, all newly entered
    const first = onVisibleChange.mock.calls.at(-1)![0];
    expect(first.visibleIds).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    expect(first.enteredIds).toEqual(first.visibleIds);
    expect(first.exitedIds).toEqual([]);

    onVisibleChange.mockClear();
    manager.handleScroll(1000); // window [800, 1600] -> items 8..15
    await flush();

    const second = onVisibleChange.mock.calls.at(-1)![0];
    expect(second.visibleIds[0]).toBe("item-8");
    expect(second.visibleIds.at(-1)).toBe("item-15");
    expect(second.enteredIds).toContain("item-8");
    expect(second.exitedIds).toContain("item-0");
    expect(second.exitedIds).not.toContain("item-8");
  });

  it("stays silent when a scroll does not change the visible set", async () => {
    const onVisibleChange = vi.fn();
    const { provider, notifyData } = createFakeProvider(100);
    const manager = new VirtualizedListManager(provider, {
      defaultItemHeight: 100,
      onVisibleChange,
    });
    notifyData();
    manager.setScrollContainer(createScrollElement());
    await flush();

    manager.handleScroll(1040);
    await flush();
    onVisibleChange.mockClear();

    // 1040 -> 1050 keeps the same visible set (no item crosses a boundary)
    manager.handleScroll(1050);
    await flush();

    expect(onVisibleChange).not.toHaveBeenCalled();
  });

  it("preserves the consumer's inline styles on the scroll element", () => {
    const { provider, notifyData } = createFakeProvider(10);
    const manager = new VirtualizedListManager(provider, {});
    notifyData();

    const element = createScrollElement();
    element.style.height = "100%";
    manager.setScrollContainer(element);

    expect(element.style.height).toBe("100%");
    expect(element.style.overflow).toBe("scroll");
  });

  it("survives an initialize/dispose/initialize cycle", async () => {
    const { manager, element } = createManager();
    const subscriber = vi.fn();
    manager.subscribe(subscriber);

    const first = new AbortController();
    manager.initialize(first.signal);
    first.abort();

    const second = new AbortController();
    manager.initialize(second.signal);

    // Scroll container was re-attached and the subscription survived
    expect(manager.getSnapshot().isInitialized).toBe(true);
    // Keep the element in sync: re-init schedules a read of the element's
    // real scrollTop, which would otherwise override the manual scroll
    element.scrollTop = 300;
    manager.handleScroll(300);
    await flush();
    expect(subscriber).toHaveBeenCalled();
    expect(manager.getSnapshot().showScrollToTop).toBe(true);
  });
});

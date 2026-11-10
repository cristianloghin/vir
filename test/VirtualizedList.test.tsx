import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { VirtualizedList, useDataProvider } from "../src";
import {
  ListItem,
  VirtualizedItemProps,
  VirtualizedListConfig,
} from "../src/types";
import { MockResizeObserver } from "./setup";

interface Row {
  id: string;
  title: string;
}

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, title: `Row ${i}` }));

const normalize = (rows: Row[]): ListItem<Row>[] =>
  rows.map((row) => ({ id: row.id, content: row }));

const Item = ({ content }: VirtualizedItemProps<Row>) => (
  <div>{(content as Row).title}</div>
);

function List({
  rows,
  isLoading = false,
  error = null,
  config,
  ItemComponent = Item,
  showScrollButton,
  ScrollTopComponent,
}: {
  rows: Row[] | undefined;
  isLoading?: boolean;
  error?: Error | null;
  config?: VirtualizedListConfig;
  ItemComponent?: typeof Item;
  showScrollButton?: boolean;
  ScrollTopComponent?: React.FC<{ scrollTop: () => void }>;
}) {
  const dataProvider = useDataProvider(
    rows,
    normalize,
    isLoading,
    false,
    error,
    { showPlaceholders: false }
  );
  return (
    <VirtualizedList
      dataProvider={dataProvider}
      ItemComponent={ItemComponent}
      config={config}
      showScrollButton={showScrollButton}
      ScrollTopComponent={ScrollTopComponent}
    />
  );
}

// Flush pending rAF callbacks (setTimeout-backed in test/setup.ts) and the
// microtask-batched store notifications behind them
const flushUpdates = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

// The list's own scroll container: the parent of the element that holds the
// items.
const scrollerOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-id]")!.parentElement!
    .parentElement!;

// Scrolls past the 200px mark where the scroll-to-top button appears. Tests
// that look for the button query within their own container: renders are not
// cleaned up between tests here, so `screen` would find an earlier list's.
const scrollDown = async (scroller: HTMLElement) => {
  scroller.scrollTop = 500;
  fireEvent.scroll(scroller);
  await flushUpdates();
};

describe("VirtualizedList", () => {
  it("renders only the items near the viewport", async () => {
    render(<List rows={makeRows(100)} />);
    await flushUpdates();

    // jsdom reports clientHeight 0, so the window is the overscan alone:
    // tops <= 0 + 0 + 5 * 100 covers items 0..5
    expect(screen.getByText("Row 0")).toBeDefined();
    expect(screen.getByText("Row 5")).toBeDefined();
    expect(screen.queryByText("Row 6")).toBeNull();
    expect(screen.queryByText("Row 50")).toBeNull();
  });

  it("positions measured items with a translateY transform, not top", async () => {
    const { container } = render(<List rows={makeRows(100)} />);
    await flushUpdates();

    const item0 = container.querySelector<HTMLElement>('[data-id="row-0"]');
    const item1 = container.querySelector<HTMLElement>('[data-id="row-1"]');

    // Offset lives in the compositor transform; `top` stays pinned at 0 so
    // scroll re-positioning never invalidates layout.
    expect(item0?.style.top).toBe("0px");
    expect(item0?.style.transform).toBe("translateY(0px)");
    // Default item height is 100, gap 0 -> the second item sits at 100px.
    expect(item1?.style.transform).toBe("translateY(100px)");
  });

  it("measures items from borderBoxSize, not contentRect", async () => {
    const { container } = render(<List rows={makeRows(100)} />);
    await flushUpdates();

    const item0 = container.querySelector<HTMLElement>('[data-id="row-0"]')!;

    // Find the observer watching THIS render's item wrapper. `instances` is a
    // static array that accumulates across tests, so match on the live element
    // rather than picking the first item observer.
    const itemObserver = MockResizeObserver.instances.find((obs) =>
      obs.observed.has(item0)
    );
    expect(itemObserver).toBeDefined();

    // borderBoxSize (250, includes padding/border) must win over contentRect
    // (999); a padded wrapper would otherwise corrupt the offset.
    const entry = {
      target: item0,
      borderBoxSize: [{ blockSize: 250, inlineSize: 0 }],
      contentRect: { height: 999 } as DOMRectReadOnly,
    } as unknown as ResizeObserverEntry;

    act(() => {
      itemObserver!.callback([entry], itemObserver as unknown as ResizeObserver);
    });
    await flushUpdates();

    // The item below shifts to 250 (the border-box height), not 999.
    const item1 = container.querySelector<HTMLElement>('[data-id="row-1"]');
    expect(item1?.style.transform).toBe("translateY(250px)");
  });

  it("reports visible items to config.onVisibleChange", async () => {
    const onVisibleChange = vi.fn();
    render(<List rows={makeRows(100)} config={{ onVisibleChange }} />);
    await flushUpdates();

    // jsdom clientHeight 0, default margin 200 -> viewport window [0, 200]
    // covers rows 0 and 1.
    expect(onVisibleChange).toHaveBeenCalled();
    const last = onVisibleChange.mock.calls.at(-1)![0];
    expect(last.visibleIds).toEqual(["row-0", "row-1"]);
    expect(last.enteredIds).toEqual(["row-0", "row-1"]);
  });

  it("passes isVisible to item components", async () => {
    const VisibilityItem = ({ content, isVisible }: VirtualizedItemProps<Row>) => (
      <div data-visible={isVisible ? "yes" : "no"}>{(content as Row).title}</div>
    );
    const { container } = render(
      <List rows={makeRows(100)} ItemComponent={VisibilityItem} />
    );
    await flushUpdates();

    // Window [0, 200]: row 0 and 1 visible; row 2 (top 200) rendered via
    // overscan but not visible.
    const visibleOf = (id: string) =>
      container
        .querySelector(`[data-id="${id}"]`)
        ?.querySelector("[data-visible]")
        ?.getAttribute("data-visible");

    expect(visibleOf("row-0")).toBe("yes");
    expect(visibleOf("row-2")).toBe("no");
  });

  it("renders the empty state when there are no items", async () => {
    render(<List rows={[]} />);
    await flushUpdates();

    expect(screen.getByText("No items to display")).toBeDefined();
  });

  it("renders the error state when loading failed with no items", async () => {
    render(<List rows={undefined} error={new Error("boom")} />);
    await flushUpdates();

    expect(screen.getByText("Error loading data")).toBeDefined();
    expect(screen.getByText("boom")).toBeDefined();
  });
  it("shows the scroll-to-top button once scrolled down", async () => {
    const { container } = render(<List rows={makeRows(100)} />);
    await flushUpdates();
    expect(within(container).queryByLabelText("Scroll to top")).toBeNull();

    await scrollDown(scrollerOf(container));

    expect(within(container).getByLabelText("Scroll to top")).toBeDefined();
  });

  it("never shows the scroll-to-top button with showScrollButton={false}", async () => {
    const Custom = () => <button>custom top</button>;
    const { container } = render(
      <List
        rows={makeRows(100)}
        showScrollButton={false}
        ScrollTopComponent={Custom}
      />
    );
    await flushUpdates();

    await scrollDown(scrollerOf(container));

    expect(within(container).queryByLabelText("Scroll to top")).toBeNull();
    expect(within(container).queryByText("custom top")).toBeNull();
  });

  it("does not pass the click event to scrollTop as scroll options", async () => {
    // The usual wiring: the handler goes straight onto onClick.
    const Custom = ({ scrollTop }: { scrollTop: () => void }) => (
      <button onClick={scrollTop}>custom top</button>
    );
    const { container } = render(
      <List rows={makeRows(100)} ScrollTopComponent={Custom} />
    );
    await flushUpdates();
    const scroller = scrollerOf(container);
    await scrollDown(scroller);
    const scrollTo = vi.spyOn(scroller, "scrollTo");

    fireEvent.click(within(container).getByText("custom top"));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("lets the scroll container show its scrollbar on demand", async () => {
    const { container } = render(
      <List rows={makeRows(100)} config={{ scrollbar: "auto" }} />
    );
    await flushUpdates();

    expect(scrollerOf(container).style.overflow).toBe("auto");
  });

  it("keeps the scrollbar's space reserved by default", async () => {
    const { container } = render(<List rows={makeRows(100)} />);
    await flushUpdates();

    expect(scrollerOf(container).style.overflow).toBe("scroll");
  });
});

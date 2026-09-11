import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useMemo, useState } from "react";
import {
  VirtualizedList,
  useDataProvider,
  useVirtualizedListContext,
} from "../src";
import { ListItem, VirtualizedItemProps } from "../src/types";

interface Row {
  id: string;
  title: string;
}

interface ExpandContext {
  expandedId: string | null;
  toggle: (id: string) => void;
  /** Unrelated field, bumped to produce a new context object whose
   * expansion slice is unchanged. */
  version: number;
}

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, title: `Row ${i}` }));

const normalize = (rows: Row[]): ListItem<Row>[] =>
  rows.map((row) => ({ id: row.id, content: row }));

// Flush pending rAF callbacks (setTimeout-backed in test/setup.ts) and the
// microtask-batched store notifications behind them
const flushUpdates = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const renderCounts = new Map<string, number>();
const countRender = (id: string) =>
  renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1);

/** Reads only its own expanded flag — must not re-render when another item
 * expands. */
const SelectingItem = ({ id, content }: VirtualizedItemProps<Row>) => {
  countRender(id);
  const expanded = useVirtualizedListContext(
    (ctx: ExpandContext) => ctx.expandedId === id
  );
  return (
    <div>
      {(content as Row).title}
      {expanded ? " (expanded)" : ""}
    </div>
  );
};

/** Reads the whole context — re-renders on every change. */
const WholeContextItem = ({ id, content }: VirtualizedItemProps<Row>) => {
  countRender(id);
  const ctx = useVirtualizedListContext<ExpandContext>();
  return (
    <div>
      {(content as Row).title}
      {ctx.expandedId === id ? " (expanded)" : ""}
    </div>
  );
};

/** Descendant of an item, to prove the hook works below the item root. */
const Nested = ({ id }: { id: string }) => {
  const toggle = useVirtualizedListContext((ctx: ExpandContext) => ctx.toggle);
  const expanded = useVirtualizedListContext(
    (ctx: ExpandContext) => ctx.expandedId === id
  );
  return (
    <button onClick={() => toggle(id)}>
      {expanded ? "collapse" : "expand"} {id}
    </button>
  );
};

const ItemWithNested = ({ id, content }: VirtualizedItemProps<Row>) => (
  <div>
    {(content as Row).title}
    <Nested id={id} />
  </div>
);

let latestToggle: (id: string) => void = () => {};
let latestBump: () => void = () => {};

function List({
  rows,
  ItemComponent,
  EmptyStateComponent,
}: {
  rows: Row[] | undefined;
  ItemComponent: React.ComponentType<VirtualizedItemProps<Row>>;
  EmptyStateComponent?: React.ReactNode;
}) {
  const dataProvider = useDataProvider(rows, normalize, false, false, null, {
    showPlaceholders: false,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const context = useMemo<ExpandContext>(
    () => ({
      expandedId,
      toggle: (id) => setExpandedId((prev) => (prev === id ? null : id)),
      version,
    }),
    [expandedId, version]
  );
  latestToggle = context.toggle;
  latestBump = () => setVersion((v) => v + 1);
  return (
    <VirtualizedList
      dataProvider={dataProvider}
      ItemComponent={ItemComponent}
      EmptyStateComponent={EmptyStateComponent}
      context={context}
    />
  );
}

describe("useVirtualizedListContext", () => {
  // Without vitest globals, testing-library does not unmount between tests.
  afterEach(cleanup);

  it("exposes the list's context prop to items", async () => {
    renderCounts.clear();
    render(<List rows={makeRows(20)} ItemComponent={WholeContextItem} />);
    await flushUpdates();

    expect(screen.queryByText(/expanded/)).toBeNull();

    act(() => latestToggle("row-1"));
    await flushUpdates();

    expect(screen.getByText("Row 1 (expanded)")).toBeDefined();
    expect(screen.getByText("Row 0")).toBeDefined();
  });

  it("ignores context changes outside the selected slice", async () => {
    renderCounts.clear();
    render(<List rows={makeRows(20)} ItemComponent={SelectingItem} />);
    await flushUpdates();
    const before = new Map(renderCounts);

    act(() => latestBump());
    await flushUpdates();

    for (const id of ["row-0", "row-1", "row-5"]) {
      expect(renderCounts.get(id), id).toBe(before.get(id));
    }
  });

  it("re-renders only items whose selected slice changed", async () => {
    renderCounts.clear();
    render(<List rows={makeRows(20)} ItemComponent={SelectingItem} />);
    await flushUpdates();

    // jsdom reports clientHeight 0, so items 0..5 are rendered (see
    // VirtualizedList.test.tsx). Snapshot their mount render counts.
    const before = new Map(renderCounts);
    expect(before.get("row-0")).toBeGreaterThan(0);
    expect(before.get("row-5")).toBeGreaterThan(0);

    act(() => latestToggle("row-1"));
    await flushUpdates();

    expect(screen.getByText("Row 1 (expanded)")).toBeDefined();
    // Item 1's flag went false -> true: exactly one extra render.
    expect(renderCounts.get("row-1")).toBe(before.get("row-1")! + 1);
    // Every other item's flag stayed false: untouched.
    for (const id of ["row-0", "row-2", "row-3", "row-4", "row-5"]) {
      expect(renderCounts.get(id), id).toBe(before.get(id));
    }

    // Moving the expansion touches exactly the two affected items.
    act(() => latestToggle("row-3"));
    await flushUpdates();

    expect(screen.getByText("Row 3 (expanded)")).toBeDefined();
    expect(screen.getByText("Row 1")).toBeDefined();
    expect(renderCounts.get("row-1")).toBe(before.get("row-1")! + 2);
    expect(renderCounts.get("row-3")).toBe(before.get("row-3")! + 1);
    for (const id of ["row-0", "row-2", "row-4", "row-5"]) {
      expect(renderCounts.get(id), id).toBe(before.get(id));
    }
  });

  it("without a selector, re-renders every item on each change", async () => {
    renderCounts.clear();
    render(<List rows={makeRows(20)} ItemComponent={WholeContextItem} />);
    await flushUpdates();
    const before = new Map(renderCounts);

    act(() => latestToggle("row-1"));
    await flushUpdates();

    for (const id of ["row-0", "row-1", "row-2", "row-5"]) {
      expect(renderCounts.get(id), id).toBe(before.get(id)! + 1);
    }
  });

  it("is readable from descendants of an item", async () => {
    render(<List rows={makeRows(20)} ItemComponent={ItemWithNested} />);
    await flushUpdates();

    // The nested component both reads the context and drives it.
    const button = screen.getByText("expand row-2");
    act(() => button.click());
    await flushUpdates();
    expect(screen.getByText("collapse row-2")).toBeDefined();
    expect(screen.getByText("expand row-3")).toBeDefined();
  });

  it("is available to the empty state component", async () => {
    const Empty = () => {
      const ctx = useVirtualizedListContext<ExpandContext>();
      return <div>empty, expanded={String(ctx.expandedId)}</div>;
    };
    render(
      <List
        rows={[]}
        ItemComponent={SelectingItem}
        EmptyStateComponent={<Empty />}
      />
    );
    await flushUpdates();
    expect(screen.getByText("empty, expanded=null")).toBeDefined();
  });

  it("applies a custom isEqual to the selected slice", async () => {
    renderCounts.clear();
    const shallowEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    // Returns a fresh array each call; without isEqual every context change
    // would count as a change.
    const selectIds = (ctx: ExpandContext) =>
      ctx.expandedId ? [ctx.expandedId] : [];
    const ArrayItem = ({ id, content }: VirtualizedItemProps<Row>) => {
      countRender(id);
      const ids = useVirtualizedListContext(selectIds, shallowEqual);
      return (
        <div>
          {(content as Row).title}:{ids.join(",")}
        </div>
      );
    };
    render(<List rows={makeRows(20)} ItemComponent={ArrayItem} />);
    await flushUpdates();
    const before = new Map(renderCounts);

    act(() => latestToggle("row-1"));
    await flushUpdates();
    expect(screen.getByText("Row 0:row-1")).toBeDefined();
    expect(renderCounts.get("row-0")).toBe(before.get("row-0")! + 1);

    // A new context object with the same expansion: the selector returns a
    // fresh but shallow-equal array, so no item re-renders.
    act(() => latestBump());
    await flushUpdates();
    expect(renderCounts.get("row-0")).toBe(before.get("row-0")! + 1);
    expect(renderCounts.get("row-3")).toBe(before.get("row-3")! + 1);
  });

  it("throws when called outside a VirtualizedList", () => {
    const Orphan = () => {
      useVirtualizedListContext();
      return null;
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/inside a VirtualizedList/);
    error.mockRestore();
  });
});

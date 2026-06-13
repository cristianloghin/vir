import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { VirtualizedList, useDataProvider } from "../src";
import { ListItem, VirtualizedItemProps } from "../src/types";

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
}: {
  rows: Row[] | undefined;
  isLoading?: boolean;
  error?: Error | null;
}) {
  const dataProvider = useDataProvider(
    rows,
    normalize,
    isLoading,
    false,
    error,
    { showPlaceholders: false }
  );
  return <VirtualizedList dataProvider={dataProvider} ItemComponent={Item} />;
}

// Flush pending rAF callbacks (setTimeout-backed in test/setup.ts) and the
// microtask-batched store notifications behind them
const flushUpdates = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

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
});

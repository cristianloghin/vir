import { useMemo, useState } from "react";
import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const Item: VirtualizedItemComponent<Row> = ({ content }) => {
  if (!isRealContent(content)) return null;
  return (
    <div className="card" style={{ marginBottom: 0, borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </div>
  );
};

export function LargeList() {
  const [count, setCount] = useState(10_000);
  const rows = useMemo(() => makeRows(count), [count]);
  const dataProvider = useDataProvider(rows, normalizeRows);

  return (
    <>
      <div className="toolbar">
        {[1_000, 10_000, 100_000].map((n) => (
          <button
            key={n}
            className={n === count ? "active" : ""}
            onClick={() => setCount(n)}
          >
            {n.toLocaleString()} items
          </button>
        ))}
        <span className="stat">
          Only the visible window is mounted — scroll to feel it.
        </span>
      </div>
      <div className="example-viewport">
        <VirtualizedList
          dataProvider={dataProvider}
          ItemComponent={Item}
          style={{ height: "100%" }}
          config={{ defaultItemHeight: 92 }}
        />
      </div>
    </>
  );
}

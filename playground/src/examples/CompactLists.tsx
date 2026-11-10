import { useRef } from "react";
import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
  type VirtualizedListHandle,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const ROW_HEIGHT = 32;

const few = makeRows(4, "few");
const many = makeRows(2000, "many");

// Fixed-height rows: the case `scrollbar: "auto"` is meant for, since a
// scrollbar appearing can't change a row's height.
const CompactRow: VirtualizedItemComponent<Row> = ({ content }) => {
  if (!isRealContent(content)) return null;
  return (
    <div
      style={{
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        borderBottom: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      {content.title}
    </div>
  );
};

function Column({
  title,
  rows,
  compact,
  apiRef,
}: {
  title: string;
  rows: Row[];
  compact: boolean;
  apiRef?: React.Ref<VirtualizedListHandle>;
}) {
  const dataProvider = useDataProvider(rows, normalizeRows);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="stat" style={{ padding: "8px 12px" }}>
        {title}
      </div>
      <div style={{ height: ROW_HEIGHT * 8, borderTop: "1px solid var(--border)" }}>
        <VirtualizedList
          dataProvider={dataProvider}
          ItemComponent={CompactRow}
          apiRef={apiRef}
          showScrollButton={!compact}
          style={{ height: "100%" }}
          config={{
            defaultItemHeight: ROW_HEIGHT,
            scrollbar: compact ? "auto" : "stable",
          }}
        />
      </div>
    </div>
  );
}

export function CompactLists() {
  const apiRef = useRef<VirtualizedListHandle>(null);

  return (
    <>
      <div className="toolbar">
        <button
          className="btn"
          onClick={() =>
            apiRef.current?.scrollToItem("many-1500", { behavior: "instant" })
          }
        >
          Jump to item 1500
        </button>
        <button
          className="btn"
          onClick={() => apiRef.current?.scrollToItem("many-1500")}
        >
          Scroll to item 1500
        </button>
        <button
          className="btn"
          onClick={() => apiRef.current?.scrollToTop({ behavior: "instant" })}
        >
          Jump to top
        </button>
        <span className="stat">
          The first two columns use <code>showScrollButton=&#123;false&#125;</code>{" "}
          and <code>scrollbar: "auto"</code>; the third keeps the defaults for
          comparison. The buttons drive the middle column.
        </span>
      </div>
      <div
        className="example-viewport"
        style={{ flex: "none", display: "flex", gap: 0 }}
      >
        <Column title="4 rows, compact" rows={few} compact />
        <div style={{ borderLeft: "1px solid var(--border)" }} />
        <Column title="2,000 rows, compact" rows={many} compact apiRef={apiRef} />
        <div style={{ borderLeft: "1px solid var(--border)" }} />
        <Column title="4 rows, defaults" rows={few} compact={false} />
      </div>
    </>
  );
}

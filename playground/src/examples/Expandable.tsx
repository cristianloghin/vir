import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
  type VirtualizedListHandle,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const rows = makeRows(200);

// The library has no "maximize" concept. Which item is expanded is the
// consumer's own state; an expanded item simply renders taller and the
// ResizeObserver remeasures, so the list re-lays-out automatically.
const ExpandContext = createContext<{
  expandedId: string | null;
  toggle: (id: string) => void;
}>({ expandedId: null, toggle: () => {} });

const Item: VirtualizedItemComponent<Row> = ({ id, content }) => {
  const { expandedId, toggle } = useContext(ExpandContext);
  const expanded = expandedId === id;
  if (!isRealContent(content)) return null;
  return (
    <div className="card">
      <h3>{content.title}</h3>
      {/* Collapsed: one clamped line so every card is the same height and the
          default-height estimate (and thus scrollToItem) is accurate.
          Expanded: full body + detail, taller — the library remeasures. */}
      <p
        style={
          expanded
            ? undefined
            : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
        }
      >
        {content.body}
      </p>
      {expanded && (
        <p style={{ marginTop: 8 }}>
          Expanded detail — {content.body} {content.body}
        </p>
      )}
      <div className="row-actions">
        <button className="btn" onClick={() => toggle(id)}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
    </div>
  );
};

export function Expandable() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const apiRef = useRef<VirtualizedListHandle>(null);
  const dataProvider = useDataProvider(rows, normalizeRows);

  const toggle = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    []
  );
  const ctx = useMemo(() => ({ expandedId, toggle }), [expandedId, toggle]);

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => apiRef.current?.scrollToItem("row-150")}>
          Scroll to item 150
        </button>
        <button className="btn" onClick={() => apiRef.current?.scrollToTop()}>
          Scroll to top
        </button>
        <span className="stat">
          Expansion is consumer state — the item just renders taller and the
          list remeasures. <code>scrollToItem</code> (via <code>apiRef</code>) is
          the one list-internal action exposed.
        </span>
      </div>
      <div className="example-viewport">
        <ExpandContext.Provider value={ctx}>
          <VirtualizedList
            dataProvider={dataProvider}
            ItemComponent={Item}
            apiRef={apiRef}
            style={{ height: "100%" }}
            config={{ defaultItemHeight: 123 }}
          />
        </ExpandContext.Provider>
      </div>
    </>
  );
}

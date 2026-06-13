import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, seededInt, type Row } from "./data";

const rows = makeRows(500);

// Each card has padding/border on the wrapper-measured element; the library
// measures the border box, so these varied heights stay correct.
const Item: VirtualizedItemComponent<Row> = ({ id, content }) => {
  if (!isRealContent(content)) return null;
  const index = Number(id.split("-")[1]);
  const paras = 1 + seededInt(index, 4); // 1..4 paragraphs
  return (
    <div className="card" style={{ paddingBlock: 18 }}>
      <h3>{content.title}</h3>
      {Array.from({ length: paras }, (_, p) => (
        <p key={p} style={{ marginTop: p === 0 ? 0 : 8 }}>
          {content.body}
        </p>
      ))}
    </div>
  );
};

export function VariableHeight() {
  const dataProvider = useDataProvider(rows, normalizeRows);
  return (
    <>
      <div className="toolbar">
        <span className="stat">
          Heights are measured per item (ResizeObserver, border-box) — no fixed
          row height.
        </span>
      </div>
      <div className="example-viewport">
        <VirtualizedList
          dataProvider={dataProvider}
          ItemComponent={Item}
          style={{ height: "100%" }}
          config={{ defaultItemHeight: 120 }}
        />
      </div>
    </>
  );
}

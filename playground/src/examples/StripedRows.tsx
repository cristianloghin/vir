import { useState } from "react";
import {
  VirtualizedList,
  isRealContent,
  useDataProvider,
  type VirtualizedItemComponent,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const rows = makeRows(200);
const reversedRows = [...rows].reverse();

const Item: VirtualizedItemComponent<Row> = ({ content, index }) => {
  if (!isRealContent(content)) return null;
  return (
    <div className="striped-row">
      <span className="stat">Index {index}</span>
      <span>{content.title}</span>
    </div>
  );
};

export function StripedRows() {
  const [reversed, setReversed] = useState(false);
  const provider = useDataProvider(reversed ? reversedRows : rows, normalizeRows);
  return (
    <>
      <div className="toolbar">
        <button
          aria-pressed={reversed}
          className={reversed ? "active" : ""}
          onClick={() => setReversed(!reversed)}
        >
          Reverse order
        </button>
      </div>
      <div className="example-viewport">
        <VirtualizedList
          className="striped-rows"
          dataProvider={provider}
          ItemComponent={Item}
          style={{ height: "100%" }}
          config={{ defaultItemHeight: 40 }}
        />
      </div>
    </>
  );
}

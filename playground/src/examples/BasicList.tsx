import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const rows = makeRows(50);

const Item: VirtualizedItemComponent<Row> = ({ content }) => {
  if (!isRealContent(content)) return null;
  return (
    <div className="card">
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </div>
  );
};

export function BasicList() {
  const dataProvider = useDataProvider(rows, normalizeRows);
  return (
    <div className="example-viewport">
      <VirtualizedList
        dataProvider={dataProvider}
        ItemComponent={Item}
        style={{ height: "100%" }}
        config={{ defaultItemHeight: 96, gap: 0 }}
      />
    </div>
  );
}

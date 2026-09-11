import { useRef } from "react";
import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const rows = makeRows(500);

const Item: VirtualizedItemComponent<Row> = ({ content }) => {
  if (!isRealContent(content)) return null;
  return (
    <div className="card">
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </div>
  );
};

export function ExternalScroller() {
  const dataProvider = useDataProvider(rows, normalizeRows);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonHostRef = useRef<HTMLDivElement>(null);

  return (
    <div className="example-viewport" style={{ position: "relative" }}>
      <div
        ref={scrollRef}
        data-testid="scroller"
        style={{ height: "100%", overflow: "auto" }}
      >
        <div
          data-testid="hero"
          style={{
            height: 300,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #1e293b, #334155)",
            color: "white",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>300px of content above the list</h3>
            <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
              The scroller is this panel, not the list. Scroll past the hero:
              the first rows must still be row 1, 2, 3…
            </p>
          </div>
        </div>
        <VirtualizedList
          dataProvider={dataProvider}
          ItemComponent={Item}
          scrollContainerRef={scrollRef}
          scrollButtonPortalRef={buttonHostRef}
          config={{ defaultItemHeight: 96, gap: 0 }}
        />
      </div>
      {/* Stays put while the panel scrolls; the button is portalled here */}
      <div ref={buttonHostRef} />
    </div>
  );
}

import { useState } from "react";
import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
  type MaximizationConfig,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

const rows = makeRows(80);

const Item: VirtualizedItemComponent<Row> = ({
  content,
  isMaximized,
  onToggleMaximize,
}) => {
  if (!isRealContent(content)) return null;
  return (
    <div className="card">
      <h3>{content.title}</h3>
      <p>{content.body}</p>
      {isMaximized && (
        <p style={{ marginTop: 8 }}>
          Expanded detail — {content.body} {content.body}
        </p>
      )}
      <div className="row-actions">
        <button className="btn" onClick={onToggleMaximize}>
          {isMaximized ? "Collapse" : "Maximize"}
        </button>
      </div>
    </div>
  );
};

const MODES: MaximizationConfig["mode"][] = [
  "fixed",
  "natural",
  "percentage",
  "custom",
];

export function Maximization() {
  const [mode, setMode] = useState<MaximizationConfig["mode"]>("fixed");
  const dataProvider = useDataProvider(rows, normalizeRows);

  const maximization: MaximizationConfig = {
    mode,
    containerPercentage: 0.8,
    maxHeight: 360,
    clipOverflow: true,
    neighborSpace: 120,
  };

  return (
    <>
      <div className="toolbar">
        {MODES.map((m) => (
          <button
            key={m}
            className={m === mode ? "active" : ""}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        <span className="stat">
          Maximize an item, then switch modes. ("natural" sizes to content.)
        </span>
      </div>
      <div className="example-viewport">
        {/* Remount when the mode changes: maximization config is read once at
            manager construction. */}
        <VirtualizedList
          key={mode}
          dataProvider={dataProvider}
          ItemComponent={Item}
          style={{ height: "100%" }}
          config={{ defaultItemHeight: 110, maximization }}
        />
      </div>
    </>
  );
}

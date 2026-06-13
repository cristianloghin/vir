import { useEffect, useState } from "react";
import {
  VirtualizedList,
  useDataProvider,
  isPlaceholderContent,
  type VirtualizedItemComponent,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, type Row } from "./data";

type Scenario = "loading" | "error" | "async" | "loaded";

const Item: VirtualizedItemComponent<Row> = ({ content }) => {
  if (isPlaceholderContent(content)) {
    return (
      <div className="skeleton">
        <div className="skeleton-line" style={{ width: "40%" }} />
        <div className="skeleton-line" style={{ width: "90%" }} />
        <div className="skeleton-line" style={{ width: "70%" }} />
      </div>
    );
  }
  return (
    <div className="card">
      <h3>{content.title}</h3>
      <p>{content.body}</p>
    </div>
  );
};

export function LoadingErrorAsync() {
  const [scenario, setScenario] = useState<Scenario>("loaded");
  const [asyncRows, setAsyncRows] = useState<Row[] | undefined>(undefined);

  // Simulate an async fetch that resolves after a delay.
  useEffect(() => {
    if (scenario !== "async") return;
    setAsyncRows(undefined);
    const t = setTimeout(() => setAsyncRows(makeRows(60)), 1200);
    return () => clearTimeout(t);
  }, [scenario]);

  const isLoading = scenario === "loading" || (scenario === "async" && !asyncRows);
  const error = scenario === "error" ? new Error("Failed to load feed (simulated).") : null;
  const data =
    scenario === "loaded"
      ? makeRows(60)
      : scenario === "async"
      ? asyncRows
      : undefined;

  const dataProvider = useDataProvider(data, normalizeRows, isLoading, false, error, {
    showPlaceholders: true,
    placeholderCount: 8,
  });

  return (
    <>
      <div className="toolbar">
        {(["loaded", "loading", "async", "error"] as Scenario[]).map((s) => (
          <button
            key={s}
            className={s === scenario ? "active" : ""}
            onClick={() => setScenario(s)}
          >
            {s}
          </button>
        ))}
        <span className="stat">
          "loading" shows skeleton placeholders; "async" loads after 1.2s.
        </span>
      </div>
      <div className="example-viewport">
        <VirtualizedList
          dataProvider={dataProvider}
          ItemComponent={Item}
          style={{ height: "100%" }}
          config={{ defaultItemHeight: 96 }}
          EmptyStateComponent={<div className="error-box">No items.</div>}
        />
      </div>
    </>
  );
}

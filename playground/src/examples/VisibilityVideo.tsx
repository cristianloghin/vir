import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  VirtualizedList,
  useDataProvider,
  isRealContent,
  type VirtualizedItemComponent,
  type VisibilityChange,
} from "@mikrostack/vir";
import { makeRows, normalizeRows, seededInt, type Row } from "./data";

const rows = makeRows(300);

// ---------------------------------------------------------------------------
// A coordinator that lives OUTSIDE the list. It owns the "has video?" lookups
// and caches them by id, so data fetching is not buried in the item component
// — and re-entering an item is a cache hit, not a re-fetch.
// ---------------------------------------------------------------------------
type VideoState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "none" };

const IDLE: VideoState = { status: "idle" };

class VideoCoordinator {
  private byId = new Map<string, VideoState>();
  private listeners = new Set<() => void>();
  private fetches = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (id: string): VideoState => this.byId.get(id) ?? IDLE;
  getFetchCount = () => this.fetches;

  // Called for items entering the viewport. The cache check is what makes
  // re-entry free: an id that's already been looked up is skipped.
  check = (id: string) => {
    if (this.byId.has(id)) return;
    this.fetches++;
    this.byId.set(id, { status: "checking" });
    this.emit();

    const index = Number(id.split("-")[1]);
    setTimeout(() => {
      this.byId.set(id, {
        status: seededInt(index, 3) === 0 ? "none" : "available",
      });
      this.emit();
    }, 500);
  };

  private emit = () => {
    this.listeners.forEach((listener) => listener());
  };
}

const CoordinatorContext = createContext<VideoCoordinator | null>(null);

function useVideoState(id: string): VideoState {
  const coordinator = useContext(CoordinatorContext)!;
  return useSyncExternalStore(coordinator.subscribe, () =>
    coordinator.getState(id)
  );
}

// ---------------------------------------------------------------------------
// The item reads the coordinator's cached result; it does not fetch. It uses
// `isVisible` only for presentation — pausing the player when off screen.
// ---------------------------------------------------------------------------
const VideoItem: VirtualizedItemComponent<Row> = ({ id, content, isVisible }) => {
  const state = useVideoState(id);
  const [playing, setPlaying] = useState(false);
  if (!isRealContent(content)) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3>{content.title}</h3>
        {isVisible && <span className="badge visible">in view</span>}
      </div>
      <p>{content.body}</p>
      <div className="row-actions">
        {state.status === "checking" && (
          <span className="badge">checking for video…</span>
        )}
        {state.status === "none" && <span className="badge">no video</span>}
        {state.status === "available" && !playing && (
          <button className="btn" onClick={() => setPlaying(true)}>
            ▶ Play video
          </button>
        )}
        {state.status === "available" && playing && (
          <span className="badge good">playing</span>
        )}
      </div>
      {playing && (
        <div className={"fake-player" + (isVisible ? "" : " paused")}>
          {isVisible ? "▶ playing video…" : "⏸ paused (scrolled off screen)"}
        </div>
      )}
    </div>
  );
};

export function VisibilityVideo() {
  const coordinatorRef = useRef<VideoCoordinator>(null);
  if (!coordinatorRef.current) coordinatorRef.current = new VideoCoordinator();
  const coordinator = coordinatorRef.current;

  const dataProvider = useDataProvider(rows, normalizeRows);
  const fetchCount = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getFetchCount
  );

  const onVisibleChange = useCallback(
    (change: VisibilityChange) => {
      change.enteredIds.forEach((id) => coordinator.check(id));
    },
    [coordinator]
  );

  return (
    <>
      <div className="toolbar">
        <span className="stat">
          Coordinator checks “has video?” on enter. API calls so far:{" "}
          <strong>{fetchCount}</strong>. Scroll an item away and back — the
          count does not increase (cached). Play one, then scroll it off — it
          pauses via <code>isVisible</code>.
        </span>
      </div>
      <div className="example-viewport">
        <CoordinatorContext.Provider value={coordinator}>
          <VirtualizedList
            dataProvider={dataProvider}
            ItemComponent={VideoItem}
            style={{ height: "100%" }}
            config={{
              defaultItemHeight: 140,
              visibilityMargin: 100,
              onVisibleChange,
            }}
          />
        </CoordinatorContext.Provider>
      </div>
    </>
  );
}

import { ScrollContext, SharedListState } from "../types";
import { isSubset, setIntersection, setsEqual } from "../utils";

export class TransitionManager {
  private dataTransitionInProgress = false;
  private lastDataSnapshot: Set<string> = new Set();
  private pendingScrollContext: ScrollContext | null = null;

  constructor(
    private captureDataSnapshot: () => Set<string>,
    private updateMeasurements: () => void,
    private notify: () => void,
    private getTotalHeight: () => number,
    private scrollToItemById: (id: string) => void,
    private getTotalCount: () => number,
    private getListState: () => SharedListState,
    private setScrollTop: (value: number) => void,
    private clearMaximization: () => void,
    private cleanupRemovedItems: (
      oldIds: Set<string>,
      newIds: Set<string>
    ) => void
  ) {}

  public handleDataChange() {
    this.dataTransitionInProgress = true;

    try {
      const newDataSnapshot = this.captureDataSnapshot();
      const oldDataSnapshot = this.lastDataSnapshot;

      // Determine transition type
      const transitionType = this.analyzeDataTransition(
        oldDataSnapshot,
        newDataSnapshot
      );

      // Handle transition based on type
      switch (transitionType) {
        case "append":
          this.handleAppendTransition(oldDataSnapshot, newDataSnapshot);
          break;
        case "filter":
          this.handleFilterTransition(oldDataSnapshot, newDataSnapshot);
          break;
        case "replace":
          this.handleReplaceTransition(oldDataSnapshot, newDataSnapshot);
          break;
        case "reorder":
          this.handleReorderTransition(oldDataSnapshot, newDataSnapshot);
          break;
        default:
          // Unknown transition - handle conservatively
          this.handleUnknownTransition(oldDataSnapshot, newDataSnapshot);
      }

      this.lastDataSnapshot = newDataSnapshot;
      this.updateMeasurements();
    } finally {
      this.dataTransitionInProgress = false;
      this.applyPendingScrollContext();
      this.notify();
    }
  }

  private analyzeDataTransition(
    oldIds: Set<string>,
    newIds: Set<string>
  ): "append" | "filter" | "replace" | "reorder" | "unknown" {
    const oldSize = oldIds.size;
    const newSize = newIds.size;

    // No change
    if (oldSize === newSize && setsEqual(oldIds, newIds)) {
      return "replace"; // Same items, possibly reordered or updated content
    }

    // All old items present + new ones = append
    if (newSize > oldSize && isSubset(oldIds, newIds)) {
      return "append";
    }

    // Subset of old items = filter
    if (newSize < oldSize && isSubset(newIds, oldIds)) {
      return "filter";
    }

    // Same size but different items = replace
    if (newSize === oldSize) {
      return "replace";
    }

    // Some overlap but complex change = reorder
    const intersection = setIntersection(oldIds, newIds);
    if (intersection.size > Math.min(oldSize, newSize) * 0.5) {
      return "reorder";
    }

    return "unknown";
  }

  private handleAppendTransition(oldIds: Set<string>, newIds: Set<string>) {
    // Data was appended - maintain scroll position
    // No cleanup needed since all old items still exist
    this.pendingScrollContext = {
      type: "ratio",
      scrollRatio: this.getListState().scrollTopRatio,
    };
  }

  private handleFilterTransition(oldIds: Set<string>, newIds: Set<string>) {
    // Items were filtered out
    this.cleanupRemovedItems(oldIds, newIds);

    const maximizedItemId = this.getListState().maximizedItemId;

    // Handle maximized item
    if (maximizedItemId && !newIds.has(maximizedItemId)) {
      console.log(
        `Maximized item ${maximizedItemId} was filtered out - clearing maximization`
      );
      this.clearMaximization();
      this.pendingScrollContext = { type: "top" }; // Reset to top
    } else if (maximizedItemId) {
      // Keep maximized item visible
      this.pendingScrollContext = {
        type: "item",
        itemId: maximizedItemId,
      };
    } else {
      // No maximized item - try to maintain relative position or go to top
      const newCount = this.getTotalCount();
      if (newCount === 0) {
        this.pendingScrollContext = { type: "top" };
      } else if (newCount < 20) {
        // Small filtered set - go to top for better UX
        this.pendingScrollContext = { type: "top" };
      } else {
        // Try to maintain some scroll position, but cap it
        const maxRatio = 0.5; // Don't scroll past halfway in filtered results
        this.pendingScrollContext = {
          type: "ratio",
          scrollRatio: Math.min(this.getListState().scrollTopRatio, maxRatio),
        };
      }
    }
  }

  private handleReplaceTransition(oldIds: Set<string>, newIds: Set<string>) {
    // Items were replaced/updated
    this.cleanupRemovedItems(oldIds, newIds);

    const maximizedItemId = this.getListState().maximizedItemId;

    // If maximized item still exists, keep it visible
    if (maximizedItemId && newIds.has(maximizedItemId)) {
      this.pendingScrollContext = {
        type: "item",
        itemId: maximizedItemId,
      };
    } else if (maximizedItemId) {
      // Maximized item was replaced
      this.clearMaximization();
      this.pendingScrollContext = {
        type: "ratio",
        scrollRatio: this.getListState().scrollTopRatio,
      };
    } else {
      // Maintain scroll ratio
      this.pendingScrollContext = {
        type: "ratio",
        scrollRatio: this.getListState().scrollTopRatio,
      };
    }
  }

  private handleReorderTransition(oldIds: Set<string>, newIds: Set<string>) {
    // Items were reordered/partially replaced
    this.cleanupRemovedItems(oldIds, newIds);

    const maximizedItemId = this.getListState().maximizedItemId;

    if (maximizedItemId && newIds.has(maximizedItemId)) {
      // Keep maximized item visible (it may have moved)
      this.pendingScrollContext = {
        type: "item",
        itemId: maximizedItemId,
      };
    } else if (maximizedItemId) {
      this.clearMaximization();
      this.pendingScrollContext = { type: "top" };
    } else {
      // Complex reorder - go to top for predictable UX
      this.pendingScrollContext = { type: "top" };
    }
  }

  private handleUnknownTransition(oldIds: Set<string>, newIds: Set<string>) {
    // Unknown transition type - handle conservatively
    console.warn("Unknown data transition detected - handling conservatively");

    this.cleanupRemovedItems(oldIds, newIds);
    const maximizedItemId = this.getListState().maximizedItemId;

    if (maximizedItemId && !newIds.has(maximizedItemId)) {
      this.clearMaximization();
    }

    // Reset to top for predictable behavior
    this.pendingScrollContext = { type: "top" };
  }

  private applyPendingScrollContext() {
    if (!this.pendingScrollContext || !this.getListState().containerElement) {
      return;
    }

    const context = this.pendingScrollContext;
    this.pendingScrollContext = null;

    // Use requestAnimationFrame to ensure measurements are updated first
    requestAnimationFrame(() => {
      if (!this.getListState().containerElement) return;

      switch (context.type) {
        case "top":
          this.setScrollTop(0);
          break;

        case "ratio":
          if (context.scrollRatio !== undefined) {
            const totalHeight = this.getTotalHeight();
            const maxScrollTop = Math.max(
              0,
              totalHeight - this.getListState().containerHeight
            );
            const targetScrollTop = context.scrollRatio * maxScrollTop;
            this.setScrollTop(Math.max(0, targetScrollTop));
          }
          break;

        case "item":
          if (context.itemId) {
            this.scrollToItemById(context.itemId);
          }
          break;
      }
    });
  }

  dispose() {
    this.lastDataSnapshot.clear();
  }
}

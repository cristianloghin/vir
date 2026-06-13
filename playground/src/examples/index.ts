import type { ComponentType } from "react";
import { BasicList } from "./BasicList";
import { LargeList } from "./LargeList";
import { VariableHeight } from "./VariableHeight";
import { Expandable } from "./Expandable";
import { LoadingErrorAsync } from "./LoadingErrorAsync";
import { VisibilityVideo } from "./VisibilityVideo";

export interface Example {
  id: string;
  title: string;
  description: string;
  Component: ComponentType;
}

export const examples: Example[] = [
  {
    id: "basic",
    title: "Basic list",
    description: "A simple fixed-content list — the smallest useful setup.",
    Component: BasicList,
  },
  {
    id: "large",
    title: "Large list",
    description:
      "Up to 100,000 items. Only the visible window plus overscan is mounted, so scrolling stays smooth regardless of total size.",
    Component: LargeList,
  },
  {
    id: "variable",
    title: "Variable height",
    description:
      "Items measure their own height via ResizeObserver (border-box), so rows of different content sizes lay out correctly without a fixed row height.",
    Component: VariableHeight,
  },
  {
    id: "expandable",
    title: "Expandable items",
    description:
      "Expansion is the consumer's own state — an expanded item just renders taller and the list remeasures automatically. The imperative scrollToItem / scrollToTop (via apiRef) are the only list-internal actions.",
    Component: Expandable,
  },
  {
    id: "states",
    title: "Loading, error & async",
    description:
      "Placeholder skeletons while loading, an error state, and an async source that resolves after a delay — all driven through useDataProvider.",
    Component: LoadingErrorAsync,
  },
  {
    id: "visibility",
    title: "Visibility coordinator",
    description:
      "Data fetching coordinated OUTSIDE the items via onVisibleChange, cached by id so re-entry never re-fetches. Items use isVisible to pause an off-screen player.",
    Component: VisibilityVideo,
  },
];

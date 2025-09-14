import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { VirtualizedListManager } from "../core/VirtualizedListManager";
import { DataProvider, ViewportInfo, VisibleItem, VirtualizedListConfig, MaximizationConfig, VirtualizedItemComponent } from "../types";

import { isEqual } from "lodash";

interface ListState<T> {
  viewportInfo: ViewportInfo;
  visibleItems: VisibleItem<T>[];
  showScrollToTop: boolean;
  maximizedItemId: string | null;
  isInitialized: boolean;
  maximizationConfig: MaximizationConfig;
}

// React hook with stable references
export function useVirtualizedList<T = any>(
  dataProvider: DataProvider<T>,
  itemComponent: VirtualizedItemComponent<T>,
  config?: VirtualizedListConfig
) {
  const managerRef = useRef<VirtualizedListManager<T>>(null);
  const stateRef = useRef<ListState<T>>(null);

  // Create manager only once
  if (!managerRef.current) {
    managerRef.current = new VirtualizedListManager(dataProvider, config);
  }

  const manager = managerRef.current;

  // Update data provider if it changes
  useEffect(() => {
    manager.setDataProvider(dataProvider);
  }, [dataProvider, manager]);

  // Initialize and cleanup
  useEffect(() => {
    manager.initialize();
    return () => {
      manager.dispose();
    };
  }, [manager]);

  const state = useSyncExternalStore(manager.subscribe, () => {
    const state = manager.getSnapshot();
    if (stateRef.current && isEqual(stateRef.current, state)) {
      return stateRef.current;
    }
    stateRef.current = state;
    return state;
  });

  // Stable callback refs
  const containerRef = useCallback(
    (element: HTMLElement | null) => {
      manager.setContainer(element);
    },
    [manager]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      manager.handleScroll(e.currentTarget.scrollTop);
    },
    [manager]
  );

  const measureItem = useCallback(
    (id: string, height: number) => {
      manager.measureItem(id, height);
    },
    [manager]
  );

  const toggleMaximize = useCallback(
    (itemId: string, maximizedHeight?: number) => {
      manager.toggleMaximize(itemId, maximizedHeight);
    },
    [manager]
  );

  const scrollToTop = useCallback(() => {
    manager.scrollToTop();
  }, [manager]);

  return {
    containerRef,
    handleScroll,
    measureItem,
    toggleMaximize,
    scrollToTop,
    state,
    ItemComponent: itemComponent,
  };
}

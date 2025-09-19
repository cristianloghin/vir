import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  RefObject,
} from "react";
import { VirtualizedListManager } from "../core/VirtualizedListManager";
import {
  DataProvider,
  ViewportInfo,
  VisibleItem,
  VirtualizedListConfig,
  MaximizationConfig,
} from "../types";
import { isEqual } from "../utils";

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
  internalContainerRef: RefObject<HTMLElement | null>,
  config?: VirtualizedListConfig,
  scrollContainerRef?: RefObject<HTMLElement>
) {
  const managerRef = useRef<VirtualizedListManager<T>>(null);
  const stateRef = useRef<ListState<T>>(null);

  // Create manager only once
  if (!managerRef.current) {
    managerRef.current = new VirtualizedListManager(dataProvider, config);
  }

  const manager = managerRef.current;

  // Initialize and cleanup
  useEffect(() => {
    manager.initialize();
    return () => {
      manager.dispose();
    };
  }, [manager]);

  // Handle external scroll container ref
  useEffect(() => {
    if (scrollContainerRef?.current) {
      manager.setScrollContainer(scrollContainerRef.current);
    } else if (internalContainerRef.current) {
      manager.setScrollContainer(internalContainerRef.current);
    }
  }, [manager, internalContainerRef, scrollContainerRef]);

  const state = useSyncExternalStore(manager.subscribe, () => {
    const state = manager.getSnapshot();
    if (stateRef.current && isEqual(stateRef.current, state)) {
      return stateRef.current;
    }
    stateRef.current = state;
    return state;
  });

  const measureItem = useCallback(
    (id: string, index: number, height: number) => {
      manager.measureItem(id, index, height);
    },
    [manager]
  );

  const setItemHeight = useCallback(
    (index: number, height: number) => {
      manager.setItemHeight(index, height);
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
    measureItem,
    setItemHeight,
    toggleMaximize,
    scrollToTop,
    state,
  };
}

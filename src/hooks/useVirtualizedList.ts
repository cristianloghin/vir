import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  RefObject,
} from "react";
import { VirtualizedListManager } from "../core/VirtualizedListManager";
import { DataProvider, VisibleItem, VirtualizedListConfig } from "../types";
import { isEqual } from "../utils";

interface ListState<T> {
  visibleItems: VisibleItem<T>[];
  showScrollToTop: boolean;
  isInitialized: boolean;
  totalHeight: number;
  store: Record<string, unknown>;
}

// React hook with stable references
export function useVirtualizedList<T = any>(
  dataProvider: DataProvider<T>,
  config?: VirtualizedListConfig,
  externalContainerRef?: RefObject<HTMLElement>
) {
  const managerRef = useRef<VirtualizedListManager<T>>(null);
  const stateRef = useRef<ListState<T>>(null);

  // Create manager only once
  if (!managerRef.current) {
    managerRef.current = new VirtualizedListManager(dataProvider, config);
  }

  const manager = managerRef.current;

  const internalContainerRef = useCallback(
    (element: HTMLDivElement) => {
      if (element && !externalContainerRef) {
        console.debug("setting container to internal");
        manager.setScrollContainer(element);
      }
    },
    [manager]
  );

  // Initialize and cleanup
  useEffect(() => {
    const abortController = new AbortController();
    manager.initialize(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [manager]);

  // Handle external scroll container ref
  useEffect(() => {
    if (externalContainerRef && externalContainerRef.current) {
      manager.setScrollContainer(externalContainerRef.current);
    }
  }, [manager, externalContainerRef?.current]);

  const state = useSyncExternalStore(manager.subscribe, () => {
    const state = manager.getSnapshot();
    if (stateRef.current && isEqual(stateRef.current, state)) {
      return stateRef.current;
    }
    stateRef.current = state;
    return state;
  });

  const setItemHeight = useCallback(
    (id: string, index: number, height: number) => {
      manager.setItemHeight(id, index, height);
    },
    [manager]
  );

  const storeValue = useCallback(
    (key: string, value: unknown) => {
      manager.storeValue(key, value);
    },
    [manager]
  );

  const scrollToItem = useCallback(
    (index: number) => {
      manager.scrollToItem(index);
    },
    [manager]
  );

  const scrollToTop = useCallback(() => {
    manager.scrollToTop();
  }, [manager]);

  return {
    internalContainerRef,
    setItemHeight,
    storeValue,
    scrollToItem,
    scrollToTop,
    state,
  };
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  RefObject,
} from "react";
import { VirtualizedListManager } from "../core/VirtualizedListManager";
import {
  DataProviderInterface,
  ListScrollOptions,
  VirtualizedListConfig,
} from "../types";

// Keep the provider binding out of the scope captured by long-lived list
// callbacks: unsubscribing alone doesn't release a provider held by a closure.
function useListManager<TData, TTransformed>(
  dataProvider: DataProviderInterface<TData, TTransformed>,
  config?: VirtualizedListConfig
) {
  const managerRef = useRef<VirtualizedListManager<TData, TTransformed>>(null);

  // Create manager only once
  if (!managerRef.current) {
    managerRef.current = new VirtualizedListManager(dataProvider, config);
  }

  const manager = managerRef.current;

  useLayoutEffect(() => {
    manager.setDataProvider(dataProvider);
  }, [manager, dataProvider]);
  return manager;
}

function useScrollContainerRef<TData, TTransformed>(
  manager: VirtualizedListManager<TData, TTransformed>,
  scrollContainerRef?: RefObject<HTMLElement | null>
) {
  const internalContainer = useRef<HTMLElement | null>(null);
  const containerRef = useCallback(
    (element: HTMLElement | null) => {
      internalContainer.current = element;
      if (!scrollContainerRef) {
        manager.setScrollContainer(element);
      }
    },
    [manager, scrollContainerRef]
  );

  // Ref mutations don't trigger renders. Reconcile on each commit, including
  // switches to an internal container while the list is empty.
  useEffect(() => {
    manager.setScrollContainer((scrollContainerRef ?? internalContainer).current);
  });
  return containerRef;
}

export function useVirtualizedList<TData = unknown, TTransformed = TData>(
  dataProvider: DataProviderInterface<TData, TTransformed>,
  config?: VirtualizedListConfig,
  scrollContainerRef?: RefObject<HTMLElement | null>
) {
  const manager = useListManager(dataProvider, config);

  // The element that holds the items. Lets the list sit below other content
  // in an external scroll container: its offset from the container's top is
  // measured and subtracted from scrollTop. Optional for hook consumers —
  // without it the list is assumed to start at the container's top.
  const listRef = useCallback(
    (element: HTMLElement | null) => {
      manager.setListElement(element);
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

  const containerRef = useScrollContainerRef(manager, scrollContainerRef);

  // Keep the visibility callback fresh: the manager is created once, but an
  // inline `onVisibleChange` closes over consumer state that changes per render
  manager.setOnVisibleChange(config?.onVisibleChange);

  // getSnapshot caches internally and returns the previous reference when
  // nothing observable changed, so no equality dance is needed here
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);

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

  const scrollToItem = useCallback(
    (id: string, options?: ListScrollOptions) => {
      manager.scrollToItem(id, options);
    },
    [manager]
  );

  const scrollToTop = useCallback(
    (options?: ListScrollOptions) => {
      manager.scrollToTop(options);
    },
    [manager]
  );

  return {
    containerRef,
    listRef,
    handleScroll,
    measureItem,
    scrollToItem,
    scrollToTop,
    state,
  };
}

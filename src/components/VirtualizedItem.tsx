import { JSX, memo, useCallback, useEffect, useRef } from "react";
import { VisibleItem, VirtualizedItemComponent } from "../types";

// Memoized item wrapper
interface VirtualizedItemWrapperProps<T = any> {
  item: VisibleItem<T>;
  store: Record<string, unknown>;
  ItemComponent: VirtualizedItemComponent<T>;
  onScrollToItem: (index: number) => void;
  onStoreValue: (key: string, value: unknown) => void;
  itemObserver: ResizeObserver;
}

export const VirtualizedItem = memo(
  <T,>({
    item,
    store,
    ItemComponent,
    onScrollToItem,
    onStoreValue,
    itemObserver,
  }: VirtualizedItemWrapperProps<T>) => {
    const itemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const itemElement = itemRef.current;
      if (!itemElement) return;

      itemObserver.observe(itemElement);

      return () => {
        itemObserver.unobserve(itemElement);
      };
    }, []);

    const style: React.CSSProperties = item.measurement
      ? {
          position: "absolute",
          top: item.measurement.top,
          left: 0,
          right: 0,
          contain: "layout style",
        }
      : {
          position: "relative", // Use relative positioning until measured
          left: 0,
          right: 0,
          contain: "layout style",
        };

    return (
      <div
        ref={itemRef}
        style={style}
        data-id={item.id}
        data-index={item.index}
        className="virtualized-item"
      >
        <ItemComponent
          id={item.id}
          content={item.content}
          index={item.index}
          onScrollToItem={onScrollToItem}
          onStoreValue={onStoreValue}
          store={store}
          type={(item.content as any)?.type}
        />
      </div>
    );
  }
) as <T>(props: VirtualizedItemWrapperProps<T>) => JSX.Element;

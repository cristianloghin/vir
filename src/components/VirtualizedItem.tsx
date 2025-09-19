import { JSX, memo, useCallback, useEffect, useRef } from "react";
import { VisibleItem, VirtualizedItemComponent } from "../types";

// Memoized item wrapper
interface VirtualizedItemWrapperProps<T = any> {
  item: VisibleItem<T>;
  ItemComponent: VirtualizedItemComponent<T>;
  onToggleMaximize: (index: number, height?: number) => void;
  itemObserver: ResizeObserver;
}

export const VirtualizedItem = memo(
  <T,>({
    item,
    ItemComponent,
    onToggleMaximize,
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

    const handleToggleMaximize = useCallback(() => {
      onToggleMaximize(item.index);
    }, [item.index, onToggleMaximize]);

    // Get maximization config from the item
    const maximizationConfig = item.maximizationConfig;
    const shouldClipOverflow = maximizationConfig?.clipOverflow !== false;
    const isNaturalMode = maximizationConfig?.mode === "natural";

    const style: React.CSSProperties = item.measurement
      ? {
          position: "absolute",
          top: item.measurement.top,
          left: 0,
          right: 0,
          contain: "layout style",
          ...(item.isMaximized &&
            !isNaturalMode && {
              height: item.measurement.height,
              ...(shouldClipOverflow && { overflow: "hidden" }),
            }),
          ...(item.isMaximized &&
            isNaturalMode &&
            shouldClipOverflow && {
              overflow: "hidden",
            }),
        }
      : {
          position: "relative", // Use relative positioning until measured
          left: 0,
          right: 0,
          contain: "layout style",
          ...(item.isMaximized &&
            shouldClipOverflow && {
              overflow: "hidden",
            }),
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
          isMaximized={item.isMaximized}
          onToggleMaximize={handleToggleMaximize}
          type={(item.content as any)?.type}
        />
      </div>
    );
  }
) as <T>(props: VirtualizedItemWrapperProps<T>) => JSX.Element;

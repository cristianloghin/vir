import { JSX, memo, useCallback, useEffect, useRef } from "react";
import { VisibleItem, VirtualizedItemComponent } from "../types";

// Memoized item wrapper
interface VirtualizedItemWrapperProps<TData = unknown> {
  item: VisibleItem<TData>;
  ItemComponent: VirtualizedItemComponent<TData>;
  onToggleMaximize: (id: string, height?: number) => void;
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

      if (itemElement) {
        // Observe the border box so reported heights include padding/border,
        // matching what the item actually occupies in the scroll container.
        itemObserver.observe(itemElement, { box: "border-box" });

        return () => {
          if (itemElement) {
            itemObserver.unobserve(itemElement);
          }
        };
      }
    }, [itemObserver]);

    const handleToggleMaximize = useCallback(() => {
      onToggleMaximize(item.id);
    }, [item.id, onToggleMaximize]);

    // Get maximization config from the item
    const maximizationConfig = item.maximizationConfig;
    const shouldClipOverflow = maximizationConfig?.clipOverflow !== false;
    const isNaturalMode = maximizationConfig?.mode === "natural";

    const style: React.CSSProperties = item.measurement
      ? {
          position: "absolute",
          top: 0,
          // Position with a compositor transform rather than `top`: `top`
          // invalidates layout on every scroll re-position, whereas
          // `translateY` is a paint-free composite that pairs with `contain`.
          transform: `translateY(${item.measurement.top}px)`,
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
        className="virtualized-item"
        data-id={item.id}
      >
        <ItemComponent
          id={item.id}
          content={item.content}
          isMaximized={item.isMaximized}
          isVisible={item.isVisible}
          onToggleMaximize={handleToggleMaximize}
          type={(item.content as any)?.type}
          metadata={item.metadata}
        />
      </div>
    );
  }
) as <T>(props: VirtualizedItemWrapperProps<T>) => JSX.Element;

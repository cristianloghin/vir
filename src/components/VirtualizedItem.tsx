import {
  JSX,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { VisibleItem } from "../types";

// Memoized item wrapper
interface VirtualizedItemProps<T = any> {
  item: VisibleItem<T>;
  ItemComponent: React.ComponentType<any>;
  onMeasure: (id: string, height: number) => void;
  onToggleMaximize: (id: string, height?: number) => void;
}

export const VirtualizedItem = memo(
  <T,>({
    item,
    ItemComponent,
    onMeasure,
    onToggleMaximize,
  }: VirtualizedItemProps<T>) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const lastMeasuredHeight = useRef<number>(0);
    const resizeObserver = useRef<ResizeObserver>(null);

    useLayoutEffect(() => {
      if (itemRef.current) {
        const measureHeight = () => {
          if (itemRef.current) {
            const height = itemRef.current.offsetHeight;
            if (height > 0 && height !== lastMeasuredHeight.current) {
              lastMeasuredHeight.current = height;
              onMeasure(item.id, height);
            }
          }
        };

        measureHeight();

        if (!resizeObserver.current) {
          resizeObserver.current = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const height = entry.contentRect.height;
              if (height > 0 && height !== lastMeasuredHeight.current) {
                lastMeasuredHeight.current = height;
                onMeasure(item.id, height);
              }
            }
          });
        }

        resizeObserver.current.observe(itemRef.current);

        return () => {
          if (resizeObserver.current && itemRef.current) {
            resizeObserver.current.unobserve(itemRef.current);
          }
        };
      }
    }, [item.id, item.isMaximized, onMeasure]);

    useEffect(() => {
      return () => {
        if (resizeObserver.current) {
          resizeObserver.current.disconnect();
        }
      };
    }, []);

    const handleToggleMaximize = useCallback(() => {
      onToggleMaximize(item.id);
    }, [item.id, onToggleMaximize]);

    // Get maximization config from the item
    const maximizationConfig = item.maximizationConfig;
    const shouldClipOverflow = maximizationConfig?.clipOverflow !== false;
    const isNaturalMode = maximizationConfig?.mode === 'natural';

    const style: React.CSSProperties = item.measurement
      ? {
          position: "absolute",
          top: item.measurement.top,
          left: 0,
          right: 0,
          contain: "layout style",
          ...(item.isMaximized && !isNaturalMode && {
            height: item.measurement.height,
            ...(shouldClipOverflow && { overflow: "hidden" }),
          }),
          ...(item.isMaximized && isNaturalMode && shouldClipOverflow && {
            overflow: "hidden",
          }),
        }
      : {
          position: "relative", // Use relative positioning until measured
          left: 0,
          right: 0,
          contain: "layout style",
          ...(item.isMaximized && shouldClipOverflow && {
            overflow: "hidden",
          }),
        };

    return (
      <div ref={itemRef} style={style} className="virtualized-item">
        <ItemComponent
          {...item.content}
          id={item.id}
          isMaximized={item.isMaximized}
          onToggleMaximize={handleToggleMaximize}
        />
      </div>
    );
  }
) as <T>(props: VirtualizedItemProps<T>) => JSX.Element;

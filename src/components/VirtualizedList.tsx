import {
  JSX,
  memo,
  ReactNode,
  Ref,
  RefObject,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { VirtualizedItem } from "./VirtualizedItem";
import {
  VirtualizedListConfig,
  VirtualizedListHandle,
  VirtualizedItemComponent,
  DataProviderInterface,
} from "../types";
import { useVirtualizedList } from "../hooks/useVirtualizedList";

interface VirtualizedListProps<TData = unknown, TTransformed = TData> {
  dataProvider: DataProviderInterface<TData, TTransformed>;
  ItemComponent: VirtualizedItemComponent<TTransformed>;
  ScrollTopComponent?: React.FC<{ scrollTop: () => void }>;
  EmptyStateComponent?: ReactNode;
  ErrorStateComponent?: React.FC<{ error: Error }>;
  className?: string;
  style?: React.CSSProperties;
  config?: VirtualizedListConfig;
  scrollContainerRef?: RefObject<HTMLElement>;
  scrollButtonPortalRef?: RefObject<HTMLElement>;
  /** Imperative handle for list-internal actions (scrollToItem, scrollToTop). */
  apiRef?: Ref<VirtualizedListHandle>;
}

export const VirtualizedList = memo(
  <TData, TTransformed = TData>({
    dataProvider,
    ItemComponent,
    ScrollTopComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    className = "",
    style = {},
    scrollContainerRef,
    scrollButtonPortalRef,
    config,
    apiRef,
  }: VirtualizedListProps<TData, TTransformed>) => {
    const { containerRef, measureItem, scrollToItem, scrollToTop, state } =
      useVirtualizedList(dataProvider, config, scrollContainerRef);

    useImperativeHandle(
      apiRef,
      () => ({ scrollToItem, scrollToTop }),
      [scrollToItem, scrollToTop]
    );

    const itemObserverRef = useRef<ResizeObserver | null>(null);

    if (!itemObserverRef.current) {
      itemObserverRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // Prefer borderBoxSize: contentRect excludes padding and border, so
          // a padded item wrapper would report a height short of the space it
          // actually occupies, corrupting offsets. Fall back to contentRect
          // where borderBoxSize is unavailable (older engines, jsdom).
          const borderBox = entry.borderBoxSize?.[0];
          const height = borderBox
            ? borderBox.blockSize
            : entry.contentRect.height;
          const id = (entry.target as HTMLDivElement).dataset.id;
          if (id) {
            measureItem(id, height);
          }
        }
      });
    }

    useEffect(() => {
      return () => {
        itemObserverRef.current?.disconnect();
        itemObserverRef.current = null;
      };
    }, []);

    const itemObserver = itemObserverRef.current;

    // Prepare merged styles for elements (preserve user-provided `style` and `className` prop)
    const outerStyle: React.CSSProperties = { position: "relative", ...style };
    const emptyStateStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      ...style,
    };

    const defaultNoDataComponent = useMemo(
      () => <div>No items to display</div>,
      []
    );

    const DefaultErrorComponent = useMemo(
      () => ({ error }: { error: Error }) => (
        <div>
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Error loading data
          </div>
          <div>{error.message}</div>
        </div>
      ),
      []
    );

    // Show error state when there's an error and no items
    if (state.error && state.viewportInfo.totalCount === 0) {
      const ErrorComponent = ErrorStateComponent || DefaultErrorComponent;
      return (
        <div className={className} style={emptyStateStyle}>
          <ErrorComponent error={state.error} />
        </div>
      );
    }

    // Show empty state when there are no items and no error
    if (state.viewportInfo.totalCount === 0) {
      return (
        <div className={className} style={emptyStateStyle}>
          {EmptyStateComponent || defaultNoDataComponent}
        </div>
      );
    }

    const containerStyle: React.CSSProperties = {
      height: "100%",
      overflow: scrollContainerRef ? "visible" : "scroll",
      scrollbarGutter: scrollContainerRef ? "auto" : "stable",
    };

    const innerStyle: React.CSSProperties = {
      position: "relative",
      height: state.viewportInfo.totalHeight,
      contain: "strict",
    };

    const scrollToTopButtonStyle: React.CSSProperties = {
      position: "absolute",
      bottom: 16, // tailwind bottom-4
      right: 16, // tailwind right-4
      backgroundColor: "#3b82f6", // tailwind blue-500
      color: "#ffffff",
      padding: 12, // tailwind p-3
      borderRadius: 9999,
      boxShadow:
        "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
      transitionProperty: "background-color",
      transitionDuration: "200ms",
      zIndex: 1000,
    };

    const innerContent = (
      <div style={innerStyle}>
        {state.visibleItems.map((item) => (
          <VirtualizedItem
            key={item.id}
            item={item}
            ItemComponent={ItemComponent}
            itemObserver={itemObserver!}
          />
        ))}
      </div>
    );

    const scrollButton = state.showScrollToTop ? (
      ScrollTopComponent ? (
        <ScrollTopComponent scrollTop={scrollToTop} />
      ) : (
        <button
          onClick={scrollToTop}
          aria-label="Scroll to top"
          style={scrollToTopButtonStyle}
        >
          ↑
        </button>
      )
    ) : null;

    const renderScrollButton = () => {
      if (!scrollButton) return null;
      if (scrollButtonPortalRef?.current) {
        return createPortal(scrollButton, scrollButtonPortalRef.current);
      }
      return scrollButton;
    };

    if (scrollContainerRef) {
      return (
        <>
          <div className={className} style={outerStyle}>
            {innerContent}
          </div>
          {renderScrollButton()}
        </>
      );
    }

    return (
      <div className={className} style={outerStyle}>
        {/* Scrolling is handled by the listener ScrollContainer.init attaches
            (rAF-throttled); a React onScroll here would process every event
            twice */}
        <div ref={containerRef} style={containerStyle}>
          {innerContent}
        </div>
        {renderScrollButton()}
      </div>
    );
  }
) as <TData, TTransformed = TData>(
  props: VirtualizedListProps<TData, TTransformed>
) => JSX.Element;

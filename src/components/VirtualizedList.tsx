import { JSX, memo } from "react";
import { VirtualizedItem } from "./VirtualizedItem";
import { DataProvider, VirtualizedListConfig } from "../types";
import { useVirtualizedList } from "../hooks";

// Main component with React.memo and stable props
interface VirtualizedListProps<T = any> {
  dataProvider: DataProvider<T>;
  ItemComponent: React.ComponentType<any>;
  className?: string;
  style?: React.CSSProperties;
  config?: VirtualizedListConfig;
}

export const VirtualizedList = memo(
  <T,>({
    dataProvider,
    ItemComponent,
    className = "",
    style = {},
    config,
  }: VirtualizedListProps<T>) => {
    const {
      containerRef,
      handleScroll,
      measureItem,
      toggleMaximize,
      scrollToTop,
      state,
    } = useVirtualizedList(dataProvider, ItemComponent, config);

    if (state.viewportInfo.totalCount === 0) {
      return (
        <div
          className={`flex items-center justify-center h-full text-gray-500 ${className}`}
          style={style}
        >
          No items to display
        </div>
      );
    }

    return (
      <div className={`relative ${className}`} style={style}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-scroll"
          style={{
            scrollbarGutter: "stable",
            overscrollBehavior: state.maximizedItemId ? "contain" : "auto",
            willChange: "scroll-position",
          }}
        >
          <div
            className="relative"
            style={{
              height: state.viewportInfo.totalHeight,
              contain: "strict",
            }}
          >
            {state.visibleItems.map((item) => (
              <VirtualizedItem
                key={item.id}
                item={item}
                ItemComponent={ItemComponent}
                onMeasure={measureItem}
                onToggleMaximize={toggleMaximize}
              />
            ))}
          </div>
        </div>

        {state.showScrollToTop && (
          <button
            onClick={scrollToTop}
            className="absolute bottom-4 right-4 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg transition-colors z-10"
            aria-label="Scroll to top"
            style={{ zIndex: 1000 }}
          >
            ↑
          </button>
        )}
      </div>
    );
  }
) as <T>(props: VirtualizedListProps<T>) => JSX.Element;

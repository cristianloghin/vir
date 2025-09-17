import { JSX, memo } from "react";
import { VirtualizedItem } from "./VirtualizedItem";
import {
  DataProvider,
  VirtualizedListConfig,
  VirtualizedItemComponent,
} from "../types";
import { useVirtualizedList } from "../hooks";

// Main component with React.memo and stable props
interface VirtualizedListProps<T = any> {
  dataProvider: DataProvider<T>;
  ItemComponent: VirtualizedItemComponent<T>;
  ScrollTopComponent?: React.FC<{ scrollTop: () => void }>;
  className?: string;
  style?: React.CSSProperties;
  config?: VirtualizedListConfig;
}

export const VirtualizedList = memo(
  <T,>({
    dataProvider,
    ItemComponent,
    ScrollTopComponent,
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
    } = useVirtualizedList(dataProvider, config);

    // Prepare merged styles for elements (preserve user-provided `style` and `className` prop)
    const outerStyle: React.CSSProperties = { position: "relative", ...style };
    const emptyStateStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: "#6b7280", // tailwind gray-500
      ...style,
    };

    if (state.viewportInfo.totalCount === 0) {
      return (
        <div className={className} style={emptyStateStyle}>
          No items to display
        </div>
      );
    }

    const containerStyle: React.CSSProperties = {
      height: "100%",
      overflow: "scroll",
      scrollbarGutter: "stable",
      overscrollBehavior: state.maximizedItemId ? "contain" : "auto",
      willChange: "scroll-position",
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

    return (
      <div className={className} style={outerStyle}>
        <div ref={containerRef} onScroll={handleScroll} style={containerStyle}>
          <div style={innerStyle}>
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

        {state.showScrollToTop ? (
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
        ) : null}
      </div>
    );
  }
) as <T>(props: VirtualizedListProps<T>) => JSX.Element;

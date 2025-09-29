export interface ListItem<T = unknown> {
  id: string;
  type?: string;
  content: T;
}

export interface DataProviderInterface<TData = unknown, TTransformed = TData> {
  subscribe: (callback: () => void) => () => void;
  updateRawData: (
    items: ListItem<TData>[],
    isLoading: boolean,
    error: Error | null
  ) => void;
  updateSelector: (
    selector: SelectorFunction<TData, TTransformed> | null
  ) => void;
  getOrderedIds: () => string[];
  getItemById: (id: string) => ListItem<TTransformed> | null;
  getTotalCount: () => number;
  getState: () => {
    isLoading: boolean;
    error: Error | null;
    rawItemCount: number;
    selectedItemCount: number;
    hasSelector: boolean;
    subscriberCount: number;
  };
}

export type SelectorFunction<TData, TTransformed = TData> = (
  allItems: ListItem<TData>[]
) => ListItem<TTransformed>[];

export interface DataProviderOptions<TData, TTransformed = TData> {
  // Data transformation (applied before selector)
  transformData: (data: TData[]) => ListItem<TData>[];

  // Selector pattern
  selector?: SelectorFunction<TData, TTransformed>;
  dependencies?: readonly unknown[];

  // Placeholder behavior
  placeholderCount?: number;
  showPlaceholders?: boolean;
}

export interface ItemMeasurement {
  height: number;
  top: number;
  version: number;
  lastUsed: number;
}

export interface ViewportInfo {
  totalHeight: number;
  totalCount: number;
}

export interface VisibleItem<T = unknown> {
  id: string;
  content: T;
  measurement?: ItemMeasurement;
  isMaximized: boolean;
  maximizationConfig?: MaximizationConfig;
}

export interface ScrollContext {
  type: "item" | "ratio" | "top";
  itemId?: string;
  scrollRatio?: number;
}

export interface SharedListState {
  scrollTopRatio: number;
  maximizedItemId: string | null;
  containerElement: HTMLElement | null;
  containerHeight: number;
}

export interface MaximizationConfig {
  mode: "fixed" | "natural" | "percentage" | "custom";
  maxHeight?: number; // for 'custom' mode
  containerPercentage?: number; // for 'percentage' mode (default 0.8)
  clipOverflow?: boolean; // whether to add overflow:hidden
  neighborSpace?: number; // space to leave for neighboring items
}

export interface VirtualizedListConfig {
  gap?: number;
  defaultItemHeight?: number;
  maximization?: MaximizationConfig;
}

// Special content types for loading and error states
export interface PlaceholderContent {
  __isPlaceholder: true;
}

// Union type for all possible content states
export type ItemContentState<TContent = unknown> =
  | TContent
  | PlaceholderContent;

// Type guards for content state
export const isPlaceholderContent = (
  content: any
): content is PlaceholderContent => {
  return content && content.__isPlaceholder === true;
};

export const isRealContent = <TContent>(
  content: ItemContentState<TContent>
): content is TContent => {
  return !isPlaceholderContent(content);
};

// Item component props interface
export interface VirtualizedItemProps<TContent = unknown> {
  /** Unique identifier for the item */
  id: string;
  /** The actual data content, placeholder, or error state */
  content: ItemContentState<TContent>;
  /** Whether this item is currently maximized/expanded */
  isMaximized: boolean;
  /** Function to toggle the maximized state */
  onToggleMaximize: () => void;
  /** Optional type/category of the item */
  type?: string;
}

// Type for item components that follow the correct interface
export type VirtualizedItemComponent<TContent = unknown> = React.ComponentType<
  VirtualizedItemProps<TContent>
>;

export interface ListState<TTransformed> {
  viewportInfo: ViewportInfo;
  visibleItems: VisibleItem<TTransformed>[];
  showScrollToTop: boolean;
  maximizedItemId: string | null;
  isInitialized: boolean;
}
export interface VirtualizedListInterface<TData, TTransformed = TData> {
  measureItem(id: string, index: number, height: number): void;
  toggleMaximize(itemId: string, maximizedHeight?: number): void;
  setScrollContainer(element: HTMLElement): void;
  handleScroll(scrollTop: number): void;
  scrollToTop(): void;
  initialize(signal: AbortSignal): void;
  subscribe(callback: () => void): () => void;
  getSnapshot(): ListState<TTransformed>;
}

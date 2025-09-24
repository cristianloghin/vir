export interface ListItem<T = any> {
  id: string;
  type?: string;
  content: T;
}

export interface DataProvider<T = any> {
  subscribe: (callback: () => void) => () => void;
  getData: (startIndex: number, endIndex: number) => ListItem<T>[];
  getTotalCount: () => number;
  getItemById?: (id: string) => ListItem<T> | null;
  // New method to get all current item IDs efficiently
  getCurrentItemIds?: () => Set<string>;
}

export interface ItemMeasurement {
  height: number;
  top: number;
}

export interface ViewportInfo {
  scrollTop: number;
  containerHeight: number;
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  totalCount: number;
}

export interface VisibleItem<T = any> {
  id: string;
  content: T;
  index: number;
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
  index: number;
}

export interface ErrorContent {
  __isError: true;
  error: string;
  originalError: Error;
}

// Union type for all possible content states
export type ItemContentState<TContent = any> =
  | TContent
  | PlaceholderContent
  | ErrorContent;

// Type guards for content state
export const isPlaceholderContent = (
  content: any
): content is PlaceholderContent => {
  return content && content.__isPlaceholder === true;
};

export const isErrorContent = (content: any): content is ErrorContent => {
  return content && content.__isError === true;
};

export const isRealContent = <TContent>(
  content: ItemContentState<TContent>
): content is TContent => {
  return !isPlaceholderContent(content) && !isErrorContent(content);
};

// Item component props interface
export interface VirtualizedItemProps<TContent = any> {
  /** Unique identifier for the item */
  id: string;
  /** The actual data content, placeholder, or error state */
  content: ItemContentState<TContent>;
  /** Current index in the virtualized list */
  index: number;
  /** Whether this item is currently maximized/expanded */
  isMaximized: boolean;
  /** Function to toggle the maximized state */
  onToggleMaximize: () => void;
  /** Optional type/category of the item */
  type?: string;
}

// Type for item components that follow the correct interface
export type VirtualizedItemComponent<TContent = any> = React.ComponentType<
  VirtualizedItemProps<TContent>
>;

export interface ListState<T> {
  viewportInfo: ViewportInfo;
  visibleItems: VisibleItem<T>[];
  showScrollToTop: boolean;
  maximizedItemId: string | null;
  isInitialized: boolean;
}
export interface VirtualizedListInterface<T> {
  measureItem(id: string, index: number, height: number): void;
  toggleMaximize(itemId: string, maximizedHeight?: number): void;
  setScrollContainer(element: HTMLElement): void;
  handleScroll(scrollTop: number): void;
  scrollToTop(): void;
  initialize(signal: AbortSignal): void;
  subscribe(callback: () => void): () => void;
  getSnapshot(): ListState<T>;
}

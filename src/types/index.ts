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
  startIndex: number;
  endIndex: number;
}

export interface VisibleItem<T = any> {
  id: string;
  content: T;
  index: number;
  measurement?: ItemMeasurement;
}

export interface VirtualizedListConfig {
  gap?: number;
  defaultItemHeight?: number;
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
  /** Function to scroll to item */
  onScrollToItem: (index: number) => void;
  /** Function to persist an arbitrary value in the list */
  onStoreValue: (key: string, value: unknown) => void;
  /** Optional type/category of the item */
  type?: string;
  /** Value store */
  store: Record<string, unknown>;
}

// Type for item components that follow the correct interface
export type VirtualizedItemComponent<TContent = any> = React.ComponentType<
  VirtualizedItemProps<TContent>
>;

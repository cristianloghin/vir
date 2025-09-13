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

// Selector function type
export type SelectorFunction<TData, TTransformed = TData> = (
  allItems: ListItem<TData>[],
  ...dependencies: any[]
) => ListItem<TTransformed>[];

export interface MaximizationConfig {
  mode: 'fixed' | 'natural' | 'percentage' | 'custom';
  maxHeight?: number; // for 'custom' mode
  containerPercentage?: number; // for 'percentage' mode (default 0.8)
  clipOverflow?: boolean; // whether to add overflow:hidden
  neighborSpace?: number; // space to leave for neighboring items
}

export interface VirtualizedListConfig {
  maximization?: MaximizationConfig;
}

// Integration options with selector support
export interface UseQueryDataProviderOptions<TData, TTransformed = TData> {
  // Data transformation (applied before selector)
  transformData?: (data: TData[]) => ListItem<TData>[];

  // Selector pattern
  selector?: SelectorFunction<TData, TTransformed>;
  dependencies?: readonly any[];

  // Placeholder behavior
  placeholderCount?: number;
  showPlaceholdersWhileLoading?: boolean;

  // Error handling
  showErrorItem?: boolean;

  // Performance
  enableChangeDetection?: boolean;

  // Query options
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  staleTime?: number;
  gcTime?: number;
  retry?: boolean | number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
  placeholderData?: TData[] | ((previousData: TData[] | undefined) => TData[]);
}

import {
  DataProviderInterface,
  DataProviderOptions,
  ListItem,
  SelectorFunction,
} from "../types";

export class DataProvider<TData = unknown, TSelected = TData>
  implements DataProviderInterface<TData, TSelected>
{
  private rawItems: ListItem<TData>[] = [];
  private selectedItems: ListItem<TSelected>[] = [];

  private isLoading: boolean = false;
  private isRefetching: boolean = false;
  private error: Error | null = null;
  private subscribers = new Set<() => void>();

  private options: Required<
    Pick<
      DataProviderOptions<TData, TSelected>,
      "placeholderCount" | "showPlaceholders"
    >
  >;

  // Selector state
  private currentSelector: SelectorFunction<TData, TSelected> | null = null;

  constructor(options: DataProviderOptions<TData, TSelected>) {
    this.options = {
      placeholderCount: options.placeholderCount ?? 10,
      showPlaceholders: options.showPlaceholders ?? true,
    };
  }

  // Public API

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  // Update raw data from data source
  updateRawData = (
    items: ListItem<TData>[],
    isLoading: boolean,
    isRefetching: boolean,
    error: Error | null
  ) => {
    let hasRawDataChanged = false;

    // Check if loading/error state changed
    if (this.isLoading !== isLoading || this.error !== error) {
      hasRawDataChanged = true;
    }

    // Check if data changed
    if (
      this.rawItems.length !== items.length ||
      (items.length > 0 &&
        (this.rawItems[0]?.id !== items[0]?.id ||
          this.rawItems[this.rawItems.length - 1]?.id !==
            items[items.length - 1]?.id))
    ) {
      hasRawDataChanged = true;
    }

    if (hasRawDataChanged) {
      this.rawItems = items;
      this.isLoading = isLoading;
      this.isRefetching = isRefetching;
      this.error = error;

      // Reapply selector when raw data changes
      this.applySelector();
    }
  };

  // Update selector and dependencies
  updateSelector = (selector: SelectorFunction<TData, TSelected> | null) => {
    // Check if selector or dependencies changed
    const selectorChanged = this.currentSelector !== selector;

    if (selectorChanged) {
      this.currentSelector = selector;
      this.applySelector();
    }
  };

  getOrderedIds = () => {
    if (
      this.isLoading &&
      !this.isRefetching &&
      this.selectedItems.length === 0 &&
      this.options.showPlaceholders
    ) {
      return Array.from(
        { length: this.options.placeholderCount },
        (_, i) => `__placeholder-${i}`
      );
    }

    return this.selectedItems.map(({ id }) => id);
  };

  getTotalCount = (): number => {
    if (
      this.isLoading &&
      !this.isRefetching &&
      this.selectedItems.length === 0 &&
      this.options.showPlaceholders
    ) {
      return this.options.placeholderCount;
    }

    return this.selectedItems.length;
  };

  getItemById = (id: string): ListItem<TSelected> | null => {
    if (id.startsWith("__placeholder-")) {
      return {
        id,
        content: { __isPlaceholder: true } as TSelected,
      };
    }

    const item = this.selectedItems.find((item) => item.id === id);
    return item || null;
  };

  getState = () => {
    return {
      isLoading: this.isLoading,
      isRefetching: this.isRefetching,
      error: this.error,
      rawItemCount: this.rawItems.length,
      selectedItemCount: this.selectedItems.length,
      hasSelector: !!this.currentSelector,
      subscriberCount: this.subscribers.size,
    };
  };

  // Private methods

  private notify = () => {
    this.subscribers.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("Error in data provider subscriber:", error);
      }
    });
  };

  private applySelector = () => {
    try {
      let newSelectedItems: ListItem<TSelected>[];

      if (this.currentSelector && this.rawItems.length > 0) {
        // Apply selector with dependencies
        newSelectedItems = this.currentSelector(this.rawItems);
      } else {
        // No selector - pass through raw items (with type casting)
        newSelectedItems = this.rawItems as unknown as ListItem<TSelected>[];
      }

      // Update selected items
      this.selectedItems = newSelectedItems;
    } catch (selectorError) {
      console.error("Selector function error:", selectorError);

      // On selector error, fall back to empty array and set error state
      this.selectedItems = [];
      this.error = new Error(
        `Selector error: ${(selectorError as Error).message}`
      );
    } finally {
      this.notify();
    }
  };
}

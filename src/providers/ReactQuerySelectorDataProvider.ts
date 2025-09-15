import {
  DataProvider,
  ListItem,
  SelectorFunction,
  UseQueryDataProviderOptions,
} from "../types";

// Enhanced React Query Data Provider with selector support
export class ReactQuerySelectorDataProvider<TData = any, TTransformed = TData>
  implements DataProvider<TTransformed>
{
  private rawItems: ListItem<TData>[] = [];
  private selectedItems: ListItem<TTransformed>[] = [];
  private subscribers = new Set<() => void>();
  private isLoading = false;
  private error: Error | null = null;
  private options: Required<
    Pick<
      UseQueryDataProviderOptions<TData, TTransformed>,
      | "placeholderCount"
      | "showPlaceholdersWhileLoading"
      | "showErrorItem"
      | "enableChangeDetection"
    >
  >;

  // Selector state
  private currentSelector: SelectorFunction<TData, TTransformed> | null = null;
  private selectorDependencies: readonly any[] = [];

  constructor(options: UseQueryDataProviderOptions<TData, TTransformed> = {}) {
    this.options = {
      placeholderCount: options.placeholderCount ?? 10,
      showPlaceholdersWhileLoading:
        options.showPlaceholdersWhileLoading ?? true,
      showErrorItem: options.showErrorItem ?? true,
      enableChangeDetection: options.enableChangeDetection ?? true,
    };
  }

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  private notify = () => {
    this.subscribers.forEach((callback) => {
      callback();
    });
  };

  // Update raw data from React Query
  updateRawData(
    items: ListItem<TData>[],
    isLoading: boolean,
    error: Error | null
  ) {
    let hasRawDataChanged = false;

    // Check if loading/error state changed
    if (this.isLoading !== isLoading || this.error !== error) {
      hasRawDataChanged = true;
    }

    // Check if data changed
    if (this.options.enableChangeDetection) {
      if (
        this.rawItems.length !== items.length ||
        (items.length > 0 &&
          (this.rawItems[0]?.id !== items[0]?.id ||
            this.rawItems[this.rawItems.length - 1]?.id !==
              items[items.length - 1]?.id))
      ) {
        hasRawDataChanged = true;
      }
    } else {
      hasRawDataChanged = true;
    }

    if (hasRawDataChanged) {
      this.rawItems = items;
      this.isLoading = isLoading;
      this.error = error;

      // Reapply selector when raw data changes
      this.applySelector();
    }
  }

  // Update selector and dependencies
  updateSelector(
    selector: SelectorFunction<TData, TTransformed> | null,
    dependencies: readonly any[] = []
  ) {
    // Check if selector or dependencies changed
    const selectorChanged = this.currentSelector !== selector;
    const dependenciesChanged = !this.shallowEqual(
      this.selectorDependencies,
      dependencies
    );

    if (selectorChanged || dependenciesChanged) {
      this.currentSelector = selector;
      this.selectorDependencies = [...dependencies];
      this.applySelector();
    }
  }

  private applySelector() {
    try {
      let newSelectedItems: ListItem<TTransformed>[];

      if (this.currentSelector && this.rawItems.length > 0) {
        // Apply selector with dependencies
        newSelectedItems = this.currentSelector(
          this.rawItems,
          ...this.selectorDependencies
        );
      } else {
        // No selector - pass through raw items (with type casting)
        newSelectedItems = this.rawItems as unknown as ListItem<TTransformed>[];
      }

      // Update selected items and notify
      this.selectedItems = newSelectedItems;
      this.notify();
    } catch (selectorError) {
      console.error("Selector function error:", selectorError);

      // On selector error, fall back to empty array and set error state
      this.selectedItems = [];
      this.error = new Error(
        `Selector error: ${(selectorError as Error).message}`
      );
      this.notify();
    }
  }

  private shallowEqual(a: readonly any[], b: readonly any[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // DataProvider interface - operates on selected items
  getData(startIndex: number, endIndex: number): ListItem<TTransformed>[] {
    // Handle loading state
    if (
      this.isLoading &&
      this.selectedItems.length === 0 &&
      this.options.showPlaceholdersWhileLoading
    ) {
      const placeholderCount = Math.min(
        endIndex - startIndex + 1,
        this.options.placeholderCount
      );

      return Array.from({ length: placeholderCount }, (_, i) => ({
        id: `__placeholder-${startIndex + i}`,
        content: {
          __isPlaceholder: true,
          index: startIndex + i,
        } as TTransformed,
      }));
    }

    // Handle error state
    if (
      this.error &&
      this.selectedItems.length === 0 &&
      this.options.showErrorItem
    ) {
      return [
        {
          id: "__error-item",
          content: {
            __isError: true,
            error: this.error.message,
            originalError: this.error,
          } as TTransformed,
        },
      ];
    }

    // Return selected data
    const safeStart = Math.max(0, startIndex);
    const safeEnd = Math.min(this.selectedItems.length - 1, endIndex);

    if (safeStart > safeEnd || safeStart >= this.selectedItems.length) {
      return [];
    }

    return this.selectedItems.slice(safeStart, safeEnd + 1);
  }

  getTotalCount = (): number => {
    if (
      this.isLoading &&
      this.selectedItems.length === 0 &&
      this.options.showPlaceholdersWhileLoading
    ) {
      return this.options.placeholderCount;
    }

    if (
      this.error &&
      this.selectedItems.length === 0 &&
      this.options.showErrorItem
    ) {
      return 1;
    }

    return this.selectedItems.length;
  };

  getItemById(id: string): ListItem<TTransformed> | null {
    if (id.startsWith("__placeholder-") || id === "__error-item") {
      return null;
    }

    return this.selectedItems.find((item) => item.id === id) || null;
  }

  // Enhanced method for data transition handling
  getCurrentItemIds(): Set<string> {
    return new Set(this.selectedItems.map((item) => item.id));
  }

  // Access raw data (useful for debugging)
  getRawData(): ListItem<TData>[] {
    return this.rawItems;
  }

  getSelectedData(): ListItem<TTransformed>[] {
    return this.selectedItems;
  }

  // Debug info
  getState() {
    return {
      isLoading: this.isLoading,
      error: this.error,
      rawItemCount: this.rawItems.length,
      selectedItemCount: this.selectedItems.length,
      hasSelector: !!this.currentSelector,
      dependencyCount: this.selectorDependencies.length,
      subscriberCount: this.subscribers.size,
    };
  }
}

import { useEffect, useMemo, useRef } from "react";
import { DataProvider } from "../core/DataProvider";
import {
  DataProviderInterface,
  DataProviderOptions,
  NormalizeFunction,
} from "../types";

// Overload 1: Simple usage - data only
export function useDataProvider<TData = unknown>(
  data: TData[],
  normalizeData: NormalizeFunction<TData>
): DataProviderInterface<TData, TData>;

// Overload 2: Full usage - all 4 parameters required
export function useDataProvider<TData = unknown, TSelected = TData>(
  data: TData[] | undefined,
  normalizeData: NormalizeFunction<TData>,
  isLoading: boolean,
  isRefetching: boolean,
  error: Error | null,
  options: DataProviderOptions<TData, TSelected> | undefined
): DataProviderInterface<TData, TSelected>;

// Implementation
export function useDataProvider<TData = unknown, TSelected = TData>(
  data: TData[] | undefined,
  normalizeData: NormalizeFunction<TData>,
  isLoading?: boolean,
  isRefetching?: boolean,
  error?: Error | null,
  options?: DataProviderOptions<TData, TSelected>
): DataProviderInterface<TData, TSelected> {
  // Handle overload 1: simple usage with data only
  const actualOptions: DataProviderOptions<TData, TSelected> = options ?? {
    selector: undefined,
    dependencies: [],
    placeholderCount: 10,
    showPlaceholders: true,
  };
  const actualIsLoading = isLoading ?? false;
  const actualIsRefetching = isRefetching ?? false;
  const actualError = error ?? null;

  const { selector, dependencies = [] } = actualOptions;

  const dataProviderRef = useRef<DataProviderInterface<
    TData,
    TSelected
  > | null>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new DataProvider<TData, TSelected>(actualOptions);
  }

  const provider = dataProviderRef.current;

  // Memoized selector with dependencies
  const memoizedSelector = useMemo(
    () => selector ?? null,
    [selector, ...dependencies]
  );

  // Update selector when it changes
  useEffect(() => {
    if (!provider || !memoizedSelector) return;
    provider.updateSelector(memoizedSelector);
  }, [memoizedSelector, provider]);

  // Update data provider when query state changes
  useEffect(() => {
    if (!provider) return;

    if (data) {
      const normalizedData = normalizeData(data);
      provider.updateRawData(
        normalizedData,
        actualIsLoading,
        actualIsRefetching,
        actualError
      );
    } else if (error) {
      provider.updateRawData([], false, false, error as Error);
    } else if (isLoading) {
      provider.updateRawData([], true, actualIsRefetching, null);
    }
  }, [data, isLoading, isRefetching, error, provider, normalizeData]);

  return dataProviderRef.current;
}

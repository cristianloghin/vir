import { useRef, useEffect, useMemo } from "react";

import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { DataProvider, ListItem, UseQueryDataProviderOptions } from "../types";
import { ReactQuerySelectorDataProvider } from "../providers/ReactQuerySelectorDataProvider";

// Default transformer
const defaultTransformer = <T>(data: T[]): ListItem<T>[] => {
  return data.map((item, index) => {
    const id =
      (item as any)?.id?.toString() ||
      (item as any)?.key?.toString() ||
      (item as any)?._id?.toString() ||
      `item-${index}`;

    return {
      id,
      content: item,
      type: (item as any)?.type || (item as any)?.category || undefined,
    };
  });
};

// Enhanced hook with selector pattern
export function useQueryDataProvider<TData = any, TTransformed = TData>(
  queryKey: Parameters<typeof useQuery>[0]["queryKey"],
  queryFn: () => Promise<TData[]>,
  options: UseQueryDataProviderOptions<TData, TTransformed> = {}
): {
  dataProvider: DataProvider<TTransformed>;
  queryResult: UseQueryResult<TData[]>;
  selectorInfo: {
    rawCount: number;
    selectedCount: number;
    hasSelector: boolean;
  };
} {
  const { selector, dependencies = [], ...queryOptions } = options;

  // Create stable data provider instance
  const dataProviderRef =
    useRef<ReactQuerySelectorDataProvider<TData, TTransformed>>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new ReactQuerySelectorDataProvider<
      TData,
      TTransformed
    >(options);
  }

  const dataProvider = dataProviderRef.current;

  // Stable transformer reference
  const transformer = useMemo(() => {
    return options.transformData || defaultTransformer;
  }, [options.transformData]);

  // Memoized selector with dependencies
  const memoizedSelector = useMemo(() => {
    if (!selector) return null;

    // Return a wrapper that applies the selector with current dependencies
    return (allItems: ListItem<TData>[]) => {
      return selector(allItems, ...dependencies);
    };
  }, [selector, ...dependencies]);

  // Update selector when it changes
  useEffect(() => {
    dataProvider.updateSelector(memoizedSelector, dependencies);
  }, [memoizedSelector, dependencies, dataProvider]);

  // React Query setup
  const queryResult = useQuery({
    queryKey,
    queryFn,
    enabled: queryOptions.enabled,
    refetchInterval: queryOptions.refetchInterval,
    refetchIntervalInBackground: queryOptions.refetchIntervalInBackground,
    staleTime: queryOptions.staleTime ?? 5000,
    gcTime: queryOptions.gcTime ?? 300000,
    retry: queryOptions.retry ?? 3,
    refetchOnWindowFocus: queryOptions.refetchOnWindowFocus ?? false,
    refetchOnMount: queryOptions.refetchOnMount ?? true,
    placeholderData: queryOptions.placeholderData,
  });

  const { data, isLoading, error, isRefetching } = queryResult;

  // Update data provider when query state changes
  useEffect(() => {
    try {
      if (data) {
        const transformedData = transformer(data);
        dataProvider.updateRawData(
          transformedData,
          isLoading || isRefetching,
          error as Error | null
        );
      } else if (error) {
        dataProvider.updateRawData([], false, error as Error);
      } else if (isLoading) {
        dataProvider.updateRawData([], true, null);
      }
    } catch (transformError) {
      console.error("Data transformation error:", transformError);
      dataProvider.updateRawData(
        [],
        false,
        new Error(
          `Data transformation failed: ${(transformError as Error).message}`
        )
      );
    }
  }, [data, isLoading, isRefetching, error, dataProvider, transformer]);

  // Selector info for debugging/UI
  const selectorInfo = useMemo(() => {
    const state = dataProvider.getState();
    return {
      rawCount: state.rawItemCount,
      selectedCount: state.selectedItemCount,
      hasSelector: state.hasSelector,
    };
  }, [dataProvider, queryResult.dataUpdatedAt]); // Re-compute when data updates

  return useMemo(
    () => ({
      dataProvider,
      queryResult,
      selectorInfo,
    }),
    [dataProvider, queryResult, selectorInfo]
  );
}

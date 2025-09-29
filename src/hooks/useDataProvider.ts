import { useEffect, useMemo, useRef } from "react";
import { DataProvider } from "../core/DataProvider";
import { DataProviderInterface, DataProviderOptions } from "../types";

export function useDataProvider<TData = unknown, TTransformed = TData>(
  data: TData[] | undefined,
  isLoading = false,
  error: Error | null,
  options: DataProviderOptions<TData, TTransformed>
) {
  const { selector, dependencies = [], ...queryOptions } = options;
  const dataProviderRef = useRef<DataProviderInterface<
    TData,
    TTransformed
  > | null>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new DataProvider<TData, TTransformed>(options);
  }

  const provider = dataProviderRef.current;

  // Stable transformer reference
  const transformer = useMemo(() => {
    return options.transformData;
  }, [options.transformData]);

  // Memoized selector with dependencies
  const memoizedSelector = useMemo(
    () => selector ?? null,
    [selector, ...dependencies]
  );

  // Update selector when it changes
  useEffect(() => {
    if (!provider) return;
    provider.updateSelector(memoizedSelector);
  }, [memoizedSelector, provider]);

  // Update data provider when query state changes
  useEffect(() => {
    if (!provider) return;

    if (data) {
      const transformedData = transformer(data);
      provider.updateRawData(transformedData, isLoading, error);
    } else if (error) {
      provider.updateRawData([], false, error as Error);
    } else if (isLoading) {
      provider.updateRawData([], true, null);
    }
  }, [data, isLoading, error, provider, transformer]);

  return dataProviderRef.current;
}

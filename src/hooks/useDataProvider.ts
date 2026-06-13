import { useEffect, useRef } from "react";
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

  const { selector, dependencies } = actualOptions;

  const dataProviderRef = useRef<DataProviderInterface<
    TData,
    TSelected
  > | null>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new DataProvider<TData, TSelected>(actualOptions);
  }

  const provider = dataProviderRef.current;

  // Latest selector/normalizer, so inline functions don't churn effects
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const normalizeRef = useRef(normalizeData);
  normalizeRef.current = normalizeData;

  // Reapply the selector when its dependencies change. When `dependencies`
  // is provided it is the cache key (so inline selectors work); otherwise
  // we fall back to selector identity. Dependencies are compared manually
  // instead of spread into a hook dependency array, which breaks the Rules
  // of Hooks if the array length ever changes.
  const appliedDepsRef = useRef<readonly unknown[] | null>(null);
  useEffect(() => {
    if (dependencies) {
      const applied = appliedDepsRef.current;
      const changed =
        !applied ||
        applied.length !== dependencies.length ||
        dependencies.some((dep, i) => !Object.is(dep, applied[i]));

      if (changed) {
        appliedDepsRef.current = dependencies;
        provider.updateSelector(selectorRef.current ?? null);
      }
    } else {
      // No dependencies: updateSelector's identity check decides
      provider.updateSelector(selectorRef.current ?? null);
    }
  });

  // Update data provider when data or query state changes. All states are
  // pushed through uniformly (including data becoming undefined without an
  // error); updateRawData's change detection makes redundant calls no-ops.
  useEffect(() => {
    provider.updateRawData(
      data ? normalizeRef.current(data) : [],
      actualIsLoading,
      actualIsRefetching,
      actualError
    );
  }, [data, actualIsLoading, actualIsRefetching, actualError, provider]);

  return dataProviderRef.current;
}

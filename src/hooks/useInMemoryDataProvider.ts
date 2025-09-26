import { useEffect, useRef } from "react";
import { InMemoryDataProvider } from "../providers";
import { ListItem } from "../types";

export function useInMemoryDataProvider<T>(
  items: T[] | undefined,
  options: {
    transformData: (data: T[]) => ListItem<T>[];
    selector?: (data: ListItem<T>[]) => ListItem<T>[];
  }
) {
  const dataProviderRef = useRef<InMemoryDataProvider | null>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new InMemoryDataProvider();
  }

  useEffect(() => {
    const provider = dataProviderRef.current;
    if (items && provider) {
      provider.setItems(options.transformData(items));
    }
  }, [items, options.transformData]);

  return dataProviderRef.current;
}

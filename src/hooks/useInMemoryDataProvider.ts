import { useEffect, useRef } from "react";
import { InMemoryDataProvider } from "../providers";
import { ListItem } from "../types";

export function useInMemoryDataProvider<T>(items: ListItem<T>[]) {
  const dataProviderRef = useRef<InMemoryDataProvider | null>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new InMemoryDataProvider();
  }

  useEffect(() => {
    if (dataProviderRef.current) {
      dataProviderRef.current.setItems(items);
    }
  }, [items]);

  return dataProviderRef.current;
}

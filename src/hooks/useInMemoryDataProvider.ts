import { useRef } from "react";
import { InMemoryDataProvider } from "../providers";
import { ListItem } from "../types";

export function useInMemoryDataProvider<T>(items: ListItem<T>[]) {
  const dataProviderRef = useRef<InMemoryDataProvider | null>(null);

  if (!dataProviderRef.current) {
    dataProviderRef.current = new InMemoryDataProvider(items);
  }

  return dataProviderRef.current;
}

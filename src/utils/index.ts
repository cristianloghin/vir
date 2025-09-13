import { ListItem, SelectorFunction } from "../types";

// Utility methods for set operations
export function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function isSubset(subset: Set<string>, superset: Set<string>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) return false;
  }
  return true;
}

export function setIntersection(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

export function setDifference(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (!b.has(item)) result.add(item);
  }
  return result;
}

// Common selector functions
export const selectors = {
  // Filter by types
  filterByTypes:
    <T>(types: string[]) =>
    (allItems: ListItem<T>[]): ListItem<T>[] => {
      if (types.length === 0) return allItems;
      const typeSet = new Set(types);
      return allItems.filter((item) => item.type && typeSet.has(item.type));
    },

  // Search in content
  searchText:
    <T>(
      searchText: string,
      searchFields: string[] = ["title", "name", "description"]
    ) =>
    (allItems: ListItem<T>[]): ListItem<T>[] => {
      if (!searchText.trim()) return allItems;

      const searchLower = searchText.toLowerCase();
      return allItems.filter((item) => {
        const content = item.content as any;
        const searchableText = [
          item.id,
          ...searchFields.map((field) => content?.[field]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(searchLower);
      });
    },

  // Combine multiple filters (AND logic)
  combine:
    <T>(...selectors: SelectorFunction<T>[]) =>
    (allItems: ListItem<T>[], ...dependencies: any[]): ListItem<T>[] => {
      return selectors.reduce((filtered, selector) => {
        return selector(filtered, ...dependencies);
      }, allItems);
    },

  // Sort items
  sortBy:
    <T>(sortFn: (a: ListItem<T>, b: ListItem<T>) => number) =>
    (allItems: ListItem<T>[]): ListItem<T>[] => {
      return [...allItems].sort(sortFn);
    },
};

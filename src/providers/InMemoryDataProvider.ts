import { DataProvider, ListItem } from "../types";

// Simple in-memory data provider implementation
export class InMemoryDataProvider<T = any> implements DataProvider<T> {
  private items: ListItem<T>[] = [];
  private subscribers = new Set<() => void>();

  constructor(items: ListItem<T>[] = []) {
    this.items = [...items];
  }

  subscribe = (callback: () => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  private notify() {
    this.subscribers.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("Error in data provider subscriber:", error);
      }
    });
  }

  setItems(items: ListItem<T>[]) {
    this.items = [...items];
    this.notify();
  }

  getData(startIndex: number, endIndex: number): ListItem<T>[] {
    const safeStart = Math.max(0, startIndex);
    const safeEnd = Math.min(this.items.length - 1, endIndex);

    if (safeStart > safeEnd || safeStart >= this.items.length) {
      return [];
    }

    return this.items.slice(safeStart, safeEnd + 1);
  }

  getTotalCount(): number {
    return this.items.length;
  }

  getItemById(id: string): ListItem<T> | null {
    return this.items.find((item) => item.id === id) || null;
  }

  // Helper method to update a single item
  updateItem(id: string, updates: Partial<ListItem<T>>) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.items[index] = { ...this.items[index], ...updates };
      this.notify();
    }
  }

  // Helper method to add items
  addItems(items: ListItem<T>[]) {
    this.items.push(...items);
    this.notify();
  }

  // Helper method to remove items
  removeItems(ids: string[]) {
    const idsSet = new Set(ids);
    this.items = this.items.filter((item) => !idsSet.has(item.id));
    this.notify();
  }
}

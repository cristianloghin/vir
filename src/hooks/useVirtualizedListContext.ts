import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

/**
 * Holder for the `context` prop of a `VirtualizedList`.
 *
 * A plain React context would re-render every consumer on any change of the
 * value. Publishing the value through a tiny subscription store instead lets
 * `useVirtualizedListContext` take a selector and re-render an item only when
 * the slice it selected actually changed — e.g. an "expanded" list where a
 * toggle should touch two items, not every rendered one.
 */
export interface ContextStore<T = unknown> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createContextStore<T>(initial: T): ContextStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(value, next)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The store is the (stable) React context value; consumers subscribe to it
 * rather than to React context, so a changed `context` prop never re-renders
 * through the provider itself. Internal — consumers use the hook. */
export const VirtualizedListContext = createContext<ContextStore | null>(null);

const identity = (value: unknown) => value;

/**
 * Read the `context` prop of the nearest enclosing `VirtualizedList`.
 *
 * Without a selector the whole value is returned and the component re-renders
 * whenever it changes. With a selector, only the selected slice is compared
 * (`Object.is` by default, or `isEqual`) and the component re-renders only
 * when that slice changes:
 *
 * ```tsx
 * const expanded = useVirtualizedListContext((ctx: ExpandContext) => ctx.expandedId === id);
 * const toggle = useVirtualizedListContext((ctx: ExpandContext) => ctx.toggle);
 * ```
 *
 * A selector that returns a fresh object every call needs an `isEqual` (e.g.
 * a shallow compare), otherwise every context change counts as a change.
 * Throws when called outside a `VirtualizedList`.
 */
export function useVirtualizedListContext<T>(): T;
export function useVirtualizedListContext<T, S>(
  selector: (context: T) => S,
  isEqual?: (a: S, b: S) => boolean
): S;
export function useVirtualizedListContext<T, S>(
  selector: (context: T) => S = identity as (context: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is
): S {
  const store = useContext(VirtualizedListContext) as ContextStore<T> | null;
  if (!store) {
    throw new Error(
      "useVirtualizedListContext must be called from a component rendered inside a VirtualizedList"
    );
  }

  // Memoize the selection per (input, selector): useSyncExternalStore calls
  // getSnapshot more than once per render and requires the same result each
  // time, and re-running the selector on unrelated store reads is wasted
  // work. Keyed on `selector` so an inline selector closing over changed
  // props is never served a stale slice; if it returns a new object each
  // call, pass a stable selector plus `isEqual` to keep the reference stable.
  const getSnapshot = useMemo(() => {
    let cache: { input: T; output: S } | null = null;
    return () => {
      const input = store.get();
      if (cache && Object.is(cache.input, input)) return cache.output;
      const output = selector(input);
      if (cache && isEqual(cache.output, output)) {
        cache = { input, output: cache.output };
      } else {
        cache = { input, output };
      }
      return cache.output;
    };
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

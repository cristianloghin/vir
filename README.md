# @mikrostack/vir

A high-performance React virtual list component with measured variable heights, visibility reporting, and data provider support.

## Features

- **Virtual Scrolling**: Only renders visible items for optimal performance with large datasets
- **Dynamic Heights**: Items measure their own height (ResizeObserver, border-box) — no fixed row height required
- **Visibility reporting**: `isVisible` per item and an `onVisibleChange` callback to coordinate work (e.g. fetching) outside the items
- **Imperative API**: `scrollToItem` / `scrollToTop` via an `apiRef`
- **Shared item state**: pass a `context` to the list and read it in items with `useVirtualizedListContext`, with selectors so only affected items re-render
- **External scroll container**: virtualize inside a scroller you own, even below other content, via `scrollContainerRef`
- **TypeScript**: Fully typed with comprehensive interfaces
- **Smooth Transitions**: Built-in transition management for data changes

## Installation

```bash
npm install @mikrostack/vir
```

## Basic Usage

```tsx
import { VirtualizedList, useDataProvider, ListItem } from '@mikrostack/vir';

const items = [
  { id: '1', title: 'Item 1', description: 'Description 1' },
  { id: '2', title: 'Item 2', description: 'Description 2' },
  // ... more items
];

const ItemComponent = ({ id, content, isVisible, type, metadata }) => (
  <div>
    <h3>{content.title}</h3>
    <p>{content.description}</p>
    <small>Item #{id}</small>
  </div>
);

// Create data provider
const dataProvider = useDataProvider(items, (items) =>
  items.map((item) => ({ id: item.id, content: item }))
);

function App() {
  return (
    <div style={{ height: '400px' }}>
      <VirtualizedList
        dataProvider={dataProvider}
        ItemComponent={ItemComponent}
      />
    </div>
  );
}
```

The wrapper's fixed height matters. The list scrolls inside whatever height it
is given, so its container must have a bounded height (a fixed value, a flex
item with `min-height: 0`, `100%` of a sized parent, and so on). Without one
the list grows to fit its content, nothing scrolls, and every item renders.

## Expanding items

The library has no built-in "maximize" concept. Because items measure their own
height (ResizeObserver), **an expanded item is just one that renders taller** —
the list remeasures and re-lays-out automatically. Keep "which item is expanded"
as your own state and hand it to the items through the list's `context` prop
(see [Sharing state with items](#sharing-state-with-items)):

```tsx
interface ExpandContext {
  expandedId: string | null;
  toggle: (id: string) => void;
}

const Item: VirtualizedItemComponent<Row> = ({ id, content }) => {
  // With selectors, a toggle re-renders only the two items whose flag changed.
  const expanded = useVirtualizedListContext((ctx: ExpandContext) => ctx.expandedId === id);
  const toggle = useVirtualizedListContext((ctx: ExpandContext) => ctx.toggle);
  return (
    <div onClick={() => toggle(id)}>
      {content.title}
      {expanded && <Details {...content} />}
    </div>
  );
};

function List({ items }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dataProvider = useDataProvider(items, normalize);
  const toggle = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    []
  );
  const context = useMemo(() => ({ expandedId, toggle }), [expandedId, toggle]);

  return (
    <VirtualizedList dataProvider={dataProvider} ItemComponent={Item} context={context} />
  );
}
```

To scroll the expanded item into view, use the imperative API below.

## Sharing state with items

`ItemComponent` receives only the item's own props, so anything shared across
items — a selection, an expanded id, callbacks into the parent — needs a way in.
Pass it as the list's `context` prop and read it with `useVirtualizedListContext`
from the item or any of its descendants (the empty and error state components
can read it too):

```tsx
import { useVirtualizedListContext } from '@mikrostack/vir';

// Whole value: re-renders on every change of `context`
const ctx = useVirtualizedListContext<MyContext>();

// Selector: re-renders only when the selected slice changes (compared with
// Object.is, or a custom equality as the second argument)
const selected = useVirtualizedListContext((ctx: MyContext) => ctx.selectedId === id);
const tags = useVirtualizedListContext((ctx: MyContext) => ctx.tags, shallowEqual);
```

This is not a plain React context: the list publishes the value through a small
subscription store, so a change re-renders only the items whose selection
changed, never the whole rendered window. Two things to keep in mind:

- **Pass a stable `context`.** Build it with `useMemo`; a fresh object literal
  on every parent render defeats the list's memoization and re-renders every
  subscribed item each time.
- **Selectors returning fresh objects need an `isEqual`.** `Object.is` sees a
  new array or object as a change; pass a shallow compare (and keep the selector
  itself stable, e.g. defined outside the component) so the reference stays put.

The hook throws when called outside a `VirtualizedList`.

## Imperative API (scrollToItem)

Pass an `apiRef` to obtain a handle for the actions a consumer can't perform on
its own — scrolling by item id, and scrolling to the top:

```tsx
import { useRef } from 'react';
import { VirtualizedList, type VirtualizedListHandle } from '@mikrostack/vir';

function List() {
  const ref = useRef<VirtualizedListHandle>(null);
  return (
    <>
      <button onClick={() => ref.current?.scrollToItem('item-42')}>Go to 42</button>
      <VirtualizedList apiRef={ref} dataProvider={dataProvider} ItemComponent={Item} />
    </>
  );
}
```

> Note: `scrollToItem` to an item that hasn't been measured yet uses the
> `defaultItemHeight` estimate for the rows above it, so in a variable-height
> list it lands approximately. Keep `defaultItemHeight` close to your typical
> row height for the best accuracy.

## Data Providers

### Simple Provider
For static or locally managed data:

```tsx
import { useDataProvider } from '@mikrostack/vir';

const items = [...]
const dataProvider = useDataProvider(items, (items) =>
  items.map((item) => ({ id: item.name, content: item }))
);
```

### Async Data Source
For server-side data with loading and error states. The provider accepts the
loading flags from any async data layer (a fetch hook, SWR, React Query, etc.) —
bring your own; the library has no data-fetching dependency:

```tsx
import { useDataProvider } from '@mikrostack/vir';

// `data`, `isLoading`, `isRefetching`, and `error` come from your data layer
const dataProvider = useDataProvider(
  data, 
  (items) => items.map((item) => ({ id: item.id, content: item })), 
  isLoading, 
  isRefetching, 
  error, 
  {
    selector: (items) => {...},
    dependencies: [deps]
  }
);
```

## Item Component Interface

Your item components receive these props:

```tsx
interface VirtualizedItemProps<TContent = unknown> {
  /** Unique identifier for the item */
  id: string;
  /** The actual data content, placeholder, or error state */
  content: ItemContentState<TContent>;
  /** Whether the item is within the viewport (plus `visibilityMargin`), not
   * just rendered in the overscan window — e.g. to pause a video off screen */
  isVisible: boolean;
  /** Optional type/category of the item */
  type?: string;
  /** Optional metadata object of the item */
  metadata?: Record<string, unknown>;
}
```

For TypeScript users, use the `VirtualizedItemComponent` type:

```tsx
import {
  VirtualizedItemComponent,
  isPlaceholderContent,
  isRealContent
} from '@mikrostack/vir';

interface MyItemData {
  title: string;
  description: string;
  category: string;
}

const MyItemComponent: VirtualizedItemComponent<MyItemData> = ({
  id,
  content,
  isVisible,
  metadata,
  type
}) => {
  // Handle loading state
  if (isPlaceholderContent(content)) {
    return (
      <div className="skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
      </div>
    );
  }

  // Handle real content (TypeScript now knows content is MyItemData)
  return (
    <div>
      <h3>{content.title}</h3>
      <p>{content.description}</p>
      <span>Category: {content.category}</span>
    </div>
  );
};
```

## Handling Loading States

When you pass loading and error flags to `useDataProvider`, your item components automatically receive placeholder and error states:

### Loading Skeletons
```tsx
if (isPlaceholderContent(content)) {
  return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded mb-2" />
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  );
}
```

### Configuration
Control loading behavior in your data provider options:

```tsx
const dataProvider = useDataProvider(
  data,
  (records) => records.map((record) => ({ id: record.id, content: record })),
  isLoading,
  isRefetching,
  error,
  {
    placeholderCount: 5, // Show 5 skeleton items
    showPlaceholders: true,
  }
);
```

## Advanced Features

### useVirtualizedList Hook
`<VirtualizedList>` is built on the `useVirtualizedList` hook. Use the hook
directly when you need to render the list yourself or call its imperative
methods (`scrollToItem`, `scrollToTop`, `measureItem`):

```tsx
import { useVirtualizedList } from '@mikrostack/vir';

const { containerRef, measureItem, scrollToItem, scrollToTop, state } =
  useVirtualizedList(dataProvider, config);
```

The hook returns:

| Field | Description |
|-------|-------------|
| `containerRef` | Callback ref to attach to your scroll container |
| `listRef` | Callback ref for the element that holds the items. Optional: attach it when the list sits below other content in the scroll container, so its offset is measured (see [Using an external scroll container](#using-an-external-scroll-container)) |
| `state` | `{ visibleItems, viewportInfo, showScrollToTop, isInitialized, error }` |
| `scrollToItem(id)` | Scroll the item with this id into view |
| `scrollToTop()` | Smooth-scroll the container to the top |
| `measureItem(id, height)` | Report a measured height for an item |

(When using `<VirtualizedList>` rather than the hook, the same `scrollToItem` /
`scrollToTop` are available via the [`apiRef`](#imperative-api-scrolltoitem) prop.)

### Using an external scroll container

By default the list owns its scrolling: it renders a scroll container of its
own, sized to the wrapper you give it. Pass `scrollContainerRef` when the
scrolling element already exists, such as an app shell whose main area scrolls
and holds a header, the list, and more.

```tsx
function Page() {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={scrollRef} style={{ height: '100vh', overflow: 'auto' }}>
      <PageHeader />
      <VirtualizedList
        scrollContainerRef={scrollRef}
        dataProvider={dataProvider}
        ItemComponent={ItemComponent}
      />
    </div>
  );
}
```

What changes when the ref is given:

- **The list stops scrolling itself.** Its own wrapper becomes an
  ordinary block with no fixed height, so it grows to the list's total height
  and the outer element does the scrolling. That element needs a bounded
  height. The list sets `overflow: scroll`, `scrollbar-gutter: stable` and
  `overscroll-behavior: contain` on it as inline styles, without touching any
  other inline style you applied.
- **Scroll position and viewport come from the container.** The list listens
  to its `scroll` events (throttled to animation frames) and observes its size
  with a `ResizeObserver`, keeping the scroll position proportional when the
  container resizes.
- **Content above the list is fine.** The list measures its own offset inside
  the container and works in its own coordinates, so a header above it, or
  content that condenses as the user scrolls, does not shift which items
  render. The offset is re-measured on every scroll frame and container
  resize. `scrollToItem` and `scrollToTop` account for it too: scrolling to
  the top brings the list's first item to the top of the container, not the
  header.
- **The ref may fill in later.** It is read after every render, so a ref
  populated after mount, or one handed down through context by a layout, is
  picked up as soon as it has an element:

  ```tsx
  function Feed() {
    // A layout component exposes its scrolling root through context
    const scrollContainerRef = useLayoutScrollContainer();
    return (
      <VirtualizedList
        scrollContainerRef={scrollContainerRef ?? undefined}
        dataProvider={dataProvider}
        ItemComponent={ItemComponent}
      />
    );
  }
  ```

- **The scroll-to-top button needs a home.** The default button is absolutely
  positioned inside the list's wrapper. With an external container that
  wrapper scrolls away with the content, taking the button with it. Pass
  `scrollButtonPortalRef` pointing at an element that stays put (something
  sticky or fixed, or the container's positioned parent) and the button is
  portalled there:

  ```tsx
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonHostRef = useRef<HTMLDivElement>(null);

  <div style={{ position: 'relative', height: '100vh' }}>
    <div ref={scrollRef} style={{ height: '100%', overflow: 'auto' }}>
      <PageHeader />
      <VirtualizedList
        scrollContainerRef={scrollRef}
        scrollButtonPortalRef={buttonHostRef}
        dataProvider={dataProvider}
        ItemComponent={ItemComponent}
      />
    </div>
    <div ref={buttonHostRef} /> {/* the button is positioned within this parent */}
  </div>
  ```

  The portal host works with a custom `ScrollTopComponent` as well.

When you build on the `useVirtualizedList` hook instead of the component,
attach the hook's `listRef` to the element that holds the items to get the
same offset handling.

## Tracking visibility

The list reports which items are on screen so you can coordinate work — most
usefully **data fetching** — from *outside* the item components. There are two
ways to consume this:

- **`config.onVisibleChange`** — a callback fired (coalesced to scroll frames)
  whenever the visible set changes, with the current ids and the enter/exit
  transitions since the last call.
- **`isVisible`** on each item component — for in-item concerns such as pausing
  a video when its item scrolls off screen.

"Visible" means within the viewport expanded by `visibilityMargin` (default
200px) — narrower than the larger overscan window used for rendering, and tuned
so a fetch can start just before the item reaches the screen.

```tsx
interface VisibilityChange {
  visibleIds: string[]; // currently visible, in list order
  enteredIds: string[]; // entered since the last call
  exitedIds: string[];  // left since the last call
}
```

### Coordinating fetches outside the list

Keeping fetch logic out of item components — and caching results by id in a
coordinator — also makes **re-entry a no-op**: when an item scrolls away and
returns, the cached result is reused instead of re-fetching. The library
deliberately does not cache; that policy lives in your coordinator.

```tsx
// A store/coordinator owned by the consumer (Zustand/Redux/a ref — your choice)
const videoCache = new Map<string, VideoInfo>();

<VirtualizedList
  dataProvider={dataProvider}
  ItemComponent={MyItem}
  config={{
    onVisibleChange: ({ enteredIds }) => {
      for (const id of enteredIds) {
        if (videoCache.has(id)) continue;          // re-entry: cached, skip
        fetchVideoInfo(id).then((info) => {
          videoCache.set(id, info);
          // push `info` into your store so MyItem can render the play button
        });
      }
    },
  }}
/>;
```

Inside the item, read the coordinator's cached result to decide what to render,
and use `isVisible` only for presentation concerns (e.g. pause on exit):

```tsx
const MyItem: VirtualizedItemComponent<MyItemData> = ({ id, content, isVisible }) => {
  const video = useVideoInfo(id); // from your store, populated by the coordinator
  return (
    <div>
      <h3>{isRealContent(content) ? content.title : null}</h3>
      {video?.hasVideo && <PlayButton id={id} />}
      {video?.playing && <VideoPlayer id={id} paused={!isVisible} />}
    </div>
  );
};
```

## API Reference

### VirtualizedList Props

| Prop | Type | Description |
|------|------|-------------|
| `dataProvider` | `DataProvider<T>` | Data source for the list |
| `ItemComponent` | `React.ComponentType` | Component to render each item |
| `ScrollTopComponent?` | `React.FC<{ scrollTop: () => void }>` | Optional component that renders a custom scroll top button |
| `EmptyStateComponent?` | `ReactNode` | Optional empty state component |
| `ErrorStateComponent?` | `React.FC<{ error: Error }>` | Optional error state component |
| `className?` | `string` | CSS class for the container |
| `style?` | `React.CSSProperties` | Inline styles for the container |
| `config?` | `VirtualizedListConfig` | Configuration options |
| `scrollContainerRef?` | `RefObject<HTMLElement \| null>` | Use an existing scrolling element instead of the list's own. The list may sit below other content in it; the ref may fill in after mount. See [Using an external scroll container](#using-an-external-scroll-container) |
| `scrollButtonPortalRef?` | `RefObject<HTMLElement \| null>` | Element to portal the scroll-to-top button into. Needed with an external scroll container, where the list's wrapper scrolls away with the content |
| `apiRef?` | `Ref<VirtualizedListHandle>` | Imperative handle exposing `scrollToItem(id)` and `scrollToTop()`. See [Imperative API](#imperative-api-scrolltoitem) |
| `context?` | `TContext` | Value made available to items via `useVirtualizedListContext()`. Memoize it. See [Sharing state with items](#sharing-state-with-items) |

### VirtualizedListConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `gap?` | `number` | 0 | The space in pixels between list items |
| `defaultItemHeight?` | `number` | 100 | Default list item height in pixels |
| `visibilityMargin?` | `number` | 200 | Margin (px) around the viewport for deciding visibility, so items count as visible shortly before they scroll on screen |
| `onVisibleChange?` | `(change: VisibilityChange) => void` | - | Called when the set of visible items changes (see [Tracking visibility](#tracking-visibility)) |

## License

ISC

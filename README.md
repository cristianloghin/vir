# @mikrostack/vir

A high-performance React virtual list component with measured variable heights, visibility reporting, and data provider support.

## Features

- **Virtual Scrolling**: Only renders visible items for optimal performance with large datasets
- **Dynamic Heights**: Items measure their own height (ResizeObserver, border-box) — no fixed row height required
- **Visibility reporting**: `isVisible` per item and an `onVisibleChange` callback to coordinate work (e.g. fetching) outside the items
- **Imperative API**: `scrollToItem` / `scrollToTop` via an `apiRef`
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

## Expanding items

The library has no built-in "maximize" concept. Because items measure their own
height (ResizeObserver), **an expanded item is just one that renders taller** —
the list remeasures and re-lays-out automatically. Keep "which item is expanded"
as your own state:

```tsx
function List({ items }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dataProvider = useDataProvider(items, normalize);

  // The item reads its expanded flag from your state (via context, a store, or
  // by folding it into `content`) and renders bigger when expanded.
  return <VirtualizedList dataProvider={dataProvider} ItemComponent={Item} />;
}
```

To scroll the expanded item into view, use the imperative API below.

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
| `state` | `{ visibleItems, viewportInfo, showScrollToTop, isInitialized, error }` |
| `scrollToItem(id)` | Scroll the item with this id into view |
| `scrollToTop()` | Smooth-scroll the container to the top |
| `measureItem(id, height)` | Report a measured height for an item |

(When using `<VirtualizedList>` rather than the hook, the same `scrollToItem` /
`scrollToTop` are available via the [`apiRef`](#imperative-api-scrolltoitem) prop.)

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
| `scrollContainerRef?` | `RefObject<HTMLElement>` | The scroll container reference |
| `scrollButtonPortalRef?` | `RefObject<HTMLElement>` | Reference to a container in which to render the scroll top button |
| `apiRef?` | `Ref<VirtualizedListHandle>` | Imperative handle exposing `scrollToItem(id)` and `scrollToTop()` |

### VirtualizedListConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `gap?` | `number` | 0 | The space in pixels between list items |
| `defaultItemHeight?` | `number` | 100 | Default list item height in pixels |
| `visibilityMargin?` | `number` | 200 | Margin (px) around the viewport for deciding visibility, so items count as visible shortly before they scroll on screen |
| `onVisibleChange?` | `(change: VisibilityChange) => void` | - | Called when the set of visible items changes (see [Tracking visibility](#tracking-visibility)) |

## License

ISC

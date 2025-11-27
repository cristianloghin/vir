# @mikrostack/vir

A high-performance React virtual list component with advanced item maximization and data provider support.

## Features

- **Virtual Scrolling**: Only renders visible items for optimal performance with large datasets
- **Dynamic Heights**: Supports items with variable heights
- **Item Maximization**: Expandable/collapsible items with configurable behavior
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

const ItemComponent = ({ id, content, isMaximized, onToggleMaximize, type, metadata }) => (
  <div>
    <h3>{content.title}</h3>
    <p>{content.description}</p>
    {isMaximized && <div>Expanded content here...</div>}
    <button onClick={onToggleMaximize}>
      {isMaximized ? 'Collapse' : 'Expand'}
    </button>
    <small>Item #{id}</small>
  </div>
);

// Create data provider
const dataProvider = useDataProvider(items, (item) => ({ id: item.id, content: item }));

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

## Maximization Configuration

Control how items behave when expanded using the `config` prop:

### Configuration Options

```tsx
interface MaximizationConfig {
  mode: 'fixed' | 'natural' | 'percentage' | 'custom';
  maxHeight?: number; // for 'custom' mode
  containerPercentage?: number; // for 'percentage' mode (default 0.8)
  clipOverflow?: boolean; // whether to add overflow:hidden (default true)
  neighborSpace?: number; // space to leave for neighboring items (default 120)
}
```

### Maximization Modes

#### 1. Fixed Mode (default)
Items expand to a calculated height based on container percentage:

```tsx
<VirtualizedList
  dataProvider={dataProvider}
  ItemComponent={ItemComponent}
  config={{
    maximization: {
      mode: 'fixed',
      containerPercentage: 0.7, // 70% of container height
      clipOverflow: true,
      neighborSpace: 100
    }
  }}
/>
```

#### 2. Natural Mode
Items expand to their natural content height:

```tsx
<VirtualizedList
  dataProvider={dataProvider}
  ItemComponent={ItemComponent}
  config={{
    maximization: {
      mode: 'natural',
      clipOverflow: false // Let content show naturally
    }
  }}
/>
```

#### 3. Percentage Mode
Explicit percentage-based sizing:

```tsx
<VirtualizedList
  dataProvider={dataProvider}
  ItemComponent={ItemComponent}
  config={{
    maximization: {
      mode: 'percentage',
      containerPercentage: 0.6, // 60% of container
      neighborSpace: 80
    }
  }}
/>
```

#### 4. Custom Mode
Fixed pixel height:

```tsx
<VirtualizedList
  dataProvider={dataProvider}
  ItemComponent={ItemComponent}
  config={{
    maximization: {
      mode: 'custom',
      maxHeight: 300, // Always 300px when expanded
      clipOverflow: true
    }
  }}
/>
```

## Data Providers

### Simple Provider
For static or locally managed data:

```tsx
import { useDataProvider } from '@mikrostack/vir';

const items = [...]
const dataProvider = useDataProvider(items, (item) => ({ id: item.name, content: item }));
```

### React Query Provider
For server-side data with caching and synchronization:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useDataProvider } from '@mikrostack/vir';

const { data, isLoading, isRefetching, error } = useQuery({
  queryKey: ['items'],
  queryFn: () => ...,
})

const dataProvider = useDataProvider(
  data, 
  (item) => ({ id: item.id, content: item }), 
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
interface VirtualizedItemProps<TContent = any> {
  /** Unique identifier for the item */
  id: string;
  /** The actual data content, placeholder, or error state */
  content: ItemContentState<TContent>;
  /** Whether this item is currently maximized/expanded */
  isMaximized: boolean;
  /** Function to toggle the maximized state */
  onToggleMaximize: () => void;
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
  isMaximized,
  onToggleMaximize,
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
      <span>Position: {content.position}</span>
      {isMaximized && <div>Extended content...</div>}
      <button onClick={onToggleMaximize}>Toggle</button>
    </div>
  );
};
```

## Handling Loading States

When using React Query data providers, your components automatically receive loading and error states:

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
const { data, isLoading, isRefetching, error } = useQuery(...)
const dataProvider = useDataProvider(
  data,
  (record) => ({ id: record.id, content: record }),
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

### Custom Maximized Heights
Override the configuration for specific items:

```tsx
const handleToggleMaximize = (itemId: string) => {
  // Custom height for this specific item
  toggleMaximize(itemId, 400);
};
```

### Styling Maximized Items
The component automatically applies appropriate styling based on configuration:

- **Fixed/Percentage/Custom modes**: Sets explicit height and optional overflow clipping
- **Natural mode**: Only applies overflow clipping if enabled

```css
.virtualized-item {
  /* Your custom styles */
  transition: height 0.3s ease; /* Smooth expand/collapse */
}
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

### VirtualizedListConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `gap?` | `number` | 0 | The space in pixels between list items |
| `defaultItemHeight?` | `number` | 100 | Default list item height in pixels |
| `maximization?` | `MaximizationConfig` | see below | Controls how the maximization works in the list |


### MaximizationConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | `'fixed' \| 'natural' \| 'percentage' \| 'custom'` | `'fixed'` | How items behave when maximized |
| `maxHeight` | `number` | - | Fixed height for `custom` mode |
| `containerPercentage` | `number` | `0.8` | Percentage of container height |
| `clipOverflow` | `boolean` | `true` | Whether to clip overflowing content |
| `neighborSpace` | `number` | `120` | Space to leave for neighboring items |

## License

ISC

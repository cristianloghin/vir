import React, { memo } from "react";
import { useQueryDataProvider } from "../hooks/useReactQueryDataProvider";
import { ListItem, SelectorFunction } from "../types";
import { VirtualizedList } from "../components";

// Example usage
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  userId: number;
  category: "work" | "personal";
  priority: "high" | "medium" | "low";
}

async function fetchTodos(): Promise<Todo[]> {
  // Mock API call
  return Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    title: `Todo ${i + 1}: ${
      ["Buy groceries", "Fix bug", "Call client", "Write docs"][i % 4]
    }`,
    completed: Math.random() > 0.7,
    userId: Math.floor(Math.random() * 5) + 1,
    category: Math.random() > 0.5 ? "work" : "personal",
    priority: ["high", "medium", "low"][i % 3] as "high" | "medium" | "low",
  }));
}

// Demo component

interface TodoItemProps {
  item: ListItem<Todo>;
  id: string;
  title: string;
  description: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

const TodoItem = memo<TodoItemProps>(
  ({ id, title, description, isMaximized, onToggleMaximize, item }) => {
    return (
      <div key={item.id} className="p-2 bg-gray-50 rounded text-sm">
        <div>
          <strong>ID:</strong> {item.id}
        </div>
        <div>
          <strong>Title:</strong> {(item.content as Todo).title}
        </div>
        <div>
          <strong>Category:</strong> {item.type}
        </div>
        <div>
          <strong>Completed:</strong>{" "}
          {(item.content as Todo).completed ? "Yes" : "No"}
        </div>
      </div>
    );
  }
);

const SelectorPatternDemo: React.FC = () => {
  const [searchText, setSearchText] = React.useState("");
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [showCompleted, setShowCompleted] = React.useState(true);

  // Selector function with dependencies
  const todoSelector: SelectorFunction<Todo, Todo> = (
    allItems,
    search,
    types,
    includeCompleted
  ) => {
    let filtered = allItems;

    // Apply type filter
    if (types.length > 0) {
      const typeSet = new Set(types);
      filtered = filtered.filter((item) => item.type && typeSet.has(item.type));
    }

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((item) =>
        item.content.title.toLowerCase().includes(searchLower)
      );
    }

    // Apply completion filter
    if (!includeCompleted) {
      filtered = filtered.filter((item) => !item.content.completed);
    }

    return filtered;
  };

  const { dataProvider, queryResult, selectorInfo } = useQueryDataProvider(
    ["todos"],
    fetchTodos,
    {
      selector: todoSelector,
      dependencies: [searchText, selectedTypes, showCompleted] as const,
      refetchInterval: 30000,
      transformData: (todos: Todo[]) =>
        todos.map((todo) => ({
          id: todo.id.toString(),
          type: todo.category,
          content: todo,
        })),
    }
  );

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Selector Pattern Demo</h2>

      {/* Controls */}
      <div className="bg-gray-50 p-4 rounded space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Search:</label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search todos..."
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Categories:</label>
          <div className="flex space-x-2">
            {["work", "personal"].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setSelectedTypes((prev) =>
                    prev.includes(type)
                      ? prev.filter((t) => t !== type)
                      : [...prev, type]
                  );
                }}
                className={`px-3 py-1 text-sm rounded ${
                  selectedTypes.includes(type)
                    ? "bg-blue-500 text-white"
                    : "bg-white border"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="mr-2"
            />
            Show completed todos
          </label>
        </div>
      </div>

      {/* Results info */}
      <div className="bg-blue-50 p-4 rounded">
        <h3 className="font-medium mb-2">Selector Results:</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>Raw Items: {selectorInfo.rawCount}</div>
          <div>Filtered Items: {selectorInfo.selectedCount}</div>
          <div>Has Selector: {selectorInfo.hasSelector ? "Yes" : "No"}</div>
        </div>
        <div className="mt-2 text-xs text-gray-600">
          Loading: {queryResult.isLoading ? "Yes" : "No"} | Fetching:{" "}
          {queryResult.isFetching ? "Yes" : "No"} | Error:{" "}
          {queryResult.error ? "Yes" : "No"}
        </div>
      </div>

      {/* Sample results */}
      <div className="bg-white border rounded p-4">
        <h3 className="font-medium mb-2">Sample Results (first 5):</h3>
        <VirtualizedList
          dataProvider={dataProvider}
          ItemComponent={TodoItem}
          className="w-full h-full"
        />
      </div>

      <div className="text-sm text-gray-600 bg-gray-100 p-3 rounded">
        <strong>Usage:</strong> The selector function runs whenever searchText,
        selectedTypes, or showCompleted changes. The virtualized list
        automatically updates with the filtered results while maintaining scroll
        position and performance.
      </div>
    </div>
  );
};

export default SelectorPatternDemo;

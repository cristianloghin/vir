import { memo } from "react";
import { VirtualizedList } from "../components";
import { useInMemoryDataProvider } from "../hooks";

// Example item component
interface ExampleItemProps {
  id: string;
  title: string;
  description: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

const ExampleItem = memo<ExampleItemProps>(
  ({ id, title, description, isMaximized, onToggleMaximize }) => {
    return (
      <div
        className={`bg-white border border-gray-200 rounded-lg p-4 m-2 shadow-sm transition-all duration-200 ${
          isMaximized ? "shadow-xl border-blue-300 ring-2 ring-blue-200" : ""
        }`}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-gray-600 mb-3">{description}</p>

            {isMaximized && (
              <div className="mt-4 p-4 bg-blue-50 rounded border-l-4 border-blue-400">
                <h4 className="font-medium text-blue-900 mb-2">
                  Expanded Content
                </h4>
                <p className="text-blue-800 mb-3">
                  This is additional content that only shows when the item is
                  maximized. It could load a different component or fetch
                  additional data.
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between">
                    <span>Detail 1:</span>
                    <span className="font-medium">Value 1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Detail 2:</span>
                    <span className="font-medium">Value 2</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Detail 3:</span>
                    <span className="font-medium">Value 3</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onToggleMaximize}
            className="ml-3 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors flex-shrink-0"
          >
            {isMaximized ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
    );
  }
);

// Demo component showing usage
const VirtualizedListDemo: React.FC = () => {
  const dataProvider = useInMemoryDataProvider(
    Array.from({ length: 1000 }, (_, i) => ({
      id: `item-${i}`,
      content: {
        title: `Item ${i + 1}`,
        description: `This is the description for item ${
          i + 1
        }. It demonstrates the new data provider pattern with stable references and better performance.`,
      },
    }))
  );

  return (
    <div className="w-full h-96 bg-gray-100 rounded-lg border">
      <VirtualizedList
        dataProvider={dataProvider}
        ItemComponent={ExampleItem}
        className="w-full h-full"
      />
    </div>
  );
};

// Export all the useful pieces
export default VirtualizedListDemo;

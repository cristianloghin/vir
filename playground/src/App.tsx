import { useState } from "react";
import { examples } from "./examples";

export function App() {
  const [activeId, setActiveId] = useState(examples[0].id);
  const active = examples.find((e) => e.id === activeId) ?? examples[0];
  const Active = active.Component;

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Virtualized list</h1>
        <div className="pkg">@mikrostack/vir</div>
        {examples.map((example) => (
          <button
            key={example.id}
            className={"nav-item" + (example.id === activeId ? " active" : "")}
            onClick={() => setActiveId(example.id)}
          >
            {example.title}
          </button>
        ))}
      </nav>

      <main className="content">
        <header>
          <h2>{active.title}</h2>
          <p>{active.description}</p>
        </header>
        {/* Remount on example switch so each starts clean */}
        <Active key={active.id} />
      </main>
    </div>
  );
}

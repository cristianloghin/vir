import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// StrictMode is intentional: it double-invokes effects and exercises the
// initialize/dispose/initialize cycle the library is hardened against.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

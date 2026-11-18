import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { startRouter } from "./app/router-store.js";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
startRouter();
const tree = import.meta.env.DEV ? (
  <StrictMode>
    <App />
  </StrictMode>
) : (
  <App />
);
createRoot(root).render(tree);

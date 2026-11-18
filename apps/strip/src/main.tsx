import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const tree = import.meta.env.DEV ? (
  <StrictMode>
    <App />
  </StrictMode>
) : (
  <App />
);
createRoot(root).render(tree);

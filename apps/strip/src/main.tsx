import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { startRouter } from "./app/router-store.js";
import { registerServiceWorker } from "./services/sw-register.js";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
startRouter();
if (import.meta.env.PROD && !__STRIP_GALLERY__) registerServiceWorker();
const tree = import.meta.env.DEV ? (
  <StrictMode>
    <App />
  </StrictMode>
) : (
  <App />
);
createRoot(root).render(tree);

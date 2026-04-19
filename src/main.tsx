import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App";
import { useAppStore } from "./store";

// In dev builds, expose a helper so the DevTools console can call Tauri
// commands without needing to know the docId ahead of time.
if (import.meta.env.DEV) {
  (window as Record<string, unknown>).__collateDebug = {
    getDocId: () => useAppStore.getState().activeDocId,
    invoke: (cmd: string, args?: Record<string, unknown>) => {
      const docId = useAppStore.getState().activeDocId;
      return (window as Record<string, unknown>).__TAURI_INTERNALS__
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (window as any).__TAURI_INTERNALS__.invoke(cmd, { docId, pageIndex: 0, ...args })
        : Promise.reject("Tauri IPC not found");
    },
  };
}

document.addEventListener("contextmenu", (e) => {
  // Allow the native context menu in text inputs so right-click → Paste works.
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

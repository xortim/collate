import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import App from "./App";

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

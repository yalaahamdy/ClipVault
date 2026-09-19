import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/base.css";
import "./styles/components.css";
import "./styles/overlays.css";
import "../public/fonts/fonts.css";

import App from "./App";

// Prevent the native browser context menu — ClipVault draws its own
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea")) {
    e.preventDefault();
  }
});

function start() {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// DEV ONLY: UI preview in a plain browser (`npm run dev`) is backed by an
// in-memory mock. No-op inside the real Tauri shell where
// __TAURI_INTERNALS__ already exists — the app boots exactly as before.
if ("__TAURI_INTERNALS__" in window) {
  start();
} else {
  import("./dev/browserMock").then((m) => {
    m.installBrowserMock();
    start();
  });
}

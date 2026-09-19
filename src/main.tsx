import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "./styles/base.css";
import "./styles/components.css";
import "./styles/overlays.css";
import "../public/fonts/fonts.css";

import App from "./App";
import { SnipOverlay } from "./components/SnipOverlay";
import { I18nProvider } from "./i18n";

// Prevent the native browser context menu — ClipVault draws its own
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea")) {
    e.preventDefault();
  }
});

function start() {
  // The snip window renders only the region-selection overlay — no app shell.
  let isSnipWindow = false;
  try {
    isSnipWindow = getCurrentWindow().label === "snip";
  } catch { /* browser preview → main */ }

  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  if (isSnipWindow) {
    root.render(
      <React.StrictMode>
        <I18nProvider>
          <SnipOverlay />
        </I18nProvider>
      </React.StrictMode>,
    );
    return;
  }

  root.render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
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

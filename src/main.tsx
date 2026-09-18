import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "./styles/base.css";
import "./styles/components.css";
import "./styles/overlays.css";
import "../public/fonts/fonts.css";

// Prevent the native browser context menu — ClipVault draws its own
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea")) {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

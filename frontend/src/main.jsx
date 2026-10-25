import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import { RouterProvider } from "./router/router.jsx";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/app.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element #root is missing from index.html");
}

// React 19: no legacy ReactDOM.render needed.
createRoot(container).render(
  <React.StrictMode>
    <RouterProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </RouterProvider>
  </React.StrictMode>,
);

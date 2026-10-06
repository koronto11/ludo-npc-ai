import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./planning.css";
import "./relationship.css";
import "./flowFixes.css";
import "./workbenchMenus.css";
import "./emptyStates.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

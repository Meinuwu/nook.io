import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { initPreferencesOnBoot } from "./lib/preferences";
import { initBackend } from "./lib/backend";
import "./index.css";

initPreferencesOnBoot();
void initBackend();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

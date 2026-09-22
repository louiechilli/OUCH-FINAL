import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles/global.css";

const isPortalRoute = /^\/portal\//.test(window.location.pathname);
if (!isPortalRoute) {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSettings } from "./utils/settings";
import "./i18n";
import "./index.css";

// Initialize theme and font settings on app start
const settings = getSettings();
const root = document.documentElement;
if (settings.theme === "light") {
  root.setAttribute("data-theme", "light");
} else {
  root.setAttribute("data-theme", "dark");
}
root.style.setProperty("--font-family", settings.fontFamily);
root.style.setProperty("--font-size", `${settings.fontSize}px`);
root.style.setProperty("--number-font-family", settings.numberFontFamily);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


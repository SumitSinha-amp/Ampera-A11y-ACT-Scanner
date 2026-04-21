import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getSavedTheme, applyTheme } from "./pages/settings";

// Apply the persisted theme before first render to avoid flash
applyTheme(getSavedTheme());

// Re-apply when OS colour preference changes (for "system" mode)
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  applyTheme(getSavedTheme());
});

createRoot(document.getElementById("root")!).render(<App />);

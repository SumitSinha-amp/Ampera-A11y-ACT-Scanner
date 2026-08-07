import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  getSavedTheme,
  applyTheme,
  getSavedAccentColor,
  applyAccentColor,
  getSavedBackgroundImage,
  applyBackgroundImage,
} from "./pages/settings";

// Apply the persisted theme, accent, and background before first render
applyTheme(getSavedTheme());
applyAccentColor(getSavedAccentColor());
applyBackgroundImage(getSavedBackgroundImage());

// Re-apply when OS colour preference changes (for "system" mode)
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  applyTheme(getSavedTheme());
});

createRoot(document.getElementById("root")!).render(<App />);

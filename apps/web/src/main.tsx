import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initI18n } from "./app/i18n";
import { api } from "./data/api";
import "./styles/tokens.css";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

// The saved language (or the browser's) is known before the first render, so there is no flash of the wrong one.
void api.getSettings().then(async (settings) => {
  await initI18n(settings.locale);
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

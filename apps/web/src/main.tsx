import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initI18n } from "./app/i18n";
import { api } from "./data/api";
import { mutate } from "./data/hooks";
import "./styles/tokens.css";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

// The saved language (or the browser's) is known before the first render, so there is no flash of the wrong one.
// If the settings cannot be read (e.g. 401 before the origin key is stored) the app still renders, in the browser's language,
// so the notice that explains the problem is visible.
void api
  .getSettings()
  .then((settings) => settings.locale, () => "system" as const)
  .then(async (locale) => {
    await initI18n(locale);
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    // ADR 72 point 5: opening the web asks for a background sync; the server applies the minimum intervals.
    void mutate(api.syncAll("open")).catch(() => undefined);
  });

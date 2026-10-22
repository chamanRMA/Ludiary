import type { ReactNode } from "react";
import { useEffect } from "react";
import { AuthNotice } from "./components/AuthNotice";
import { Layout } from "./components/Layout";
import { matchRoute, navigate, useLocation, type Params } from "./app/router";
import { api } from "./data/api";
import { shouldShowWelcome } from "./app/welcome";
import { useQueryState } from "./data/hooks";
import { Game } from "./pages/Game";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { NotFound } from "./pages/NotFound";
import { Settings } from "./pages/Settings";
import { Store } from "./pages/Store";
import { Collections, Local, Prices } from "./pages/Simple";
import { Welcome } from "./pages/Welcome";

// ADR 68 routes. `/welcome` renders without the app frame.
const ROUTES: readonly [pattern: string, render: (p: Params) => ReactNode][] = [
  ["/", () => <Home />],
  ["/library", () => <Library />],
  ["/game/:id", (p) => <Game id={p["id"] ?? ""} />],
  ["/collections", () => <Collections />],
  ["/store/:id", (p) => <Store id={p["id"] ?? ""} />],
  ["/local", () => <Local />],
  ["/prices", () => <Prices />],
  ["/settings", () => <Settings section="general" />],
  ["/settings/:section", (p) => <Settings section={p["section"] ?? "general"} />],
];

export function App() {
  return (
    <>
      <AuthNotice />
      <Routes />
    </>
  );
}

function Routes() {
  const { path } = useLocation();
  const { data: onboarding, stale } = useQueryState(() => api.getOnboarding());
  const needsWelcome = shouldShowWelcome(onboarding, stale, path);

  useEffect(() => {
    if (needsWelcome) navigate("/welcome", true);
  }, [needsWelcome]);

  if (onboarding === undefined || needsWelcome) return null;
  if (path === "/welcome") return <Welcome />;

  for (const [pattern, render] of ROUTES) {
    const params = matchRoute(pattern, path);
    if (params) return <Layout>{render(params)}</Layout>;
  }
  return <Layout><NotFound /></Layout>;
}

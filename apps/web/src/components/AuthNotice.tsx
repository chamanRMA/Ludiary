import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { authIssues } from "../data/http";
import ui from "../styles/ui.module.css";

/** Shown when the server answers 401: missing origin key (open again from the shortcut) or no session. */
export function AuthNotice() {
  const { t } = useTranslation();
  const issue = useSyncExternalStore(authIssues.subscribe, authIssues.get);
  if (!issue) return null;
  return (
    <div className={ui.error} role="alert" style={{ padding: "12px 20px", textAlign: "center" }}>
      {t(issue === "origin-key-required" ? "auth.originKeyRequired" : "auth.sessionRequired")}
    </div>
  );
}

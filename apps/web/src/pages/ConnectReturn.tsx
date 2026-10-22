import type { WizardResponseDto, WizardTarget } from "@ludiary/api-contract";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseReturnTo, returnPath, takeReturnQuery, WIZARD_RETURN_KEY } from "../app/connectReturn";
import { errorText } from "../app/errors";
import { navigate } from "../app/router";
import { api } from "../data/api";
import { WIZARD_ID_KEY } from "../data/real";
import { ApiError } from "../data/http";
import { cx } from "../components/bits";
import { ConnectWizard } from "../components/ConnectWizard";
import ui from "../styles/ui.module.css";
import styles from "./welcome.module.css";

const STEAM: WizardTarget = { kind: "store", store: "steam" };

type State = { phase: "working" } | { phase: "step"; response: WizardResponseDto } | { phase: "expired" } | { phase: "failed"; text: string };

function readReturn(key: string = WIZARD_RETURN_KEY): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** `/connect/return` (ADR 74 point 3): OpenID comes back here. The query is wiped first, then only `openid.*` is sent. */
export function ConnectReturn() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ phase: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the query can only be taken once
    started.current = true;
    const query = takeReturnQuery(readReturn(WIZARD_ID_KEY));
    if (query === null) {
      setState({ phase: "expired" });
      return;
    }
    api.wizardCallback("steam", query).then(
      (res) => setState(res === null ? { phase: "expired" } : { phase: "step", response: res }),
      (e: unknown) => setState(e instanceof ApiError && e.status === 404 ? { phase: "expired" } : { phase: "failed", text: errorText(t, e) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, []);

  function back(): void {
    const to = parseReturnTo(readReturn());
    try {
      sessionStorage.removeItem(WIZARD_RETURN_KEY);
    } catch {
      /* ignore */
    }
    navigate(returnPath(to), true);
  }
  const cancel = (): void => {
    void api.cancelWizard(STEAM);
    back();
  };

  // A rejected or finished answer has no step to show: the user goes back to start again or to continue.
  const response = state.phase === "step" ? state.response : null;
  useEffect(() => {
    if (response?.kind === "done") back();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the answer only
  }, [response]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <section className={styles.body}>
          {state.phase === "working" && <p role="status">{t("connect.working")}</p>}
          {(state.phase === "expired" || state.phase === "failed" || response?.kind === "rejected") && (
            <>
              <h1 tabIndex={-1}>{t("connect.failedTitle")}</h1>
              <p role="alert">
                {state.phase === "expired"
                  ? t("wizard.expired")
                  : state.phase === "failed"
                    ? state.text
                    : response?.kind === "rejected"
                      ? t(response.error.key, { defaultValue: t("errors.generic") })
                      : ""}
              </p>
              <button type="button" className={cx(ui.btn, ui.primary)} onClick={cancel}>
                {t("connect.startAgain")}
              </button>
            </>
          )}
          {response && response.kind !== "done" && response.kind !== "rejected" && (
            <ConnectWizard target={STEAM} resume={{ target: STEAM, response }} onDone={back} onCancel={cancel} />
          )}
        </section>
      </div>
    </div>
  );
}

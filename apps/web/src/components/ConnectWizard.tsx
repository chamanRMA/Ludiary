import type { TranslatedErrorDto, WizardFieldDto, WizardResponseDto, WizardStepDto, WizardTarget } from "@ludiary/api-contract";
import i18next, { type TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { WIZARD_RETURN_KEY } from "../app/connectReturn";
import { STORE_BRAND } from "../app/stores";
import { api, isSimulated } from "../data/api";
import { mutate } from "../data/hooks";
import { ApiError } from "../data/http";
import { safeExternalUrl, validateField, valuesToSend } from "../data/validate";
import ui from "../styles/ui.module.css";
import { cx, StepText } from "./bits";
import { Icon } from "./Icon";
import { SecretField } from "./SecretField";
import styles from "./wizard.module.css";

interface Props {
  target: WizardTarget;
  /** Continue a wizard that already has a step (OpenID return, ADR 74) instead of starting one. */
  resume?: { target: WizardTarget; response: WizardResponseDto };
  onDone(): void;
  onCancel(): void;
}

const targetId = (t: WizardTarget): string => (t.kind === "store" ? t.store : t.service);
/** Server and transport errors are always translation keys (invariant 6). */
interface Rejected {
  key: string;
  params?: TranslatedErrorDto["params"] | undefined;
}
const errorOf = (e: unknown): Rejected =>
  e instanceof ApiError ? { key: e.key, ...(e.params ? { params: e.params } : {}) } : { key: "errors.generic" };
const rejectedText = (t: TFunction, r: Rejected): string => t(i18next.exists(r.key) ? r.key : "errors.generic", r.params ? { ...r.params } : {});
const stepFields = (s: WizardStepDto): readonly WizardFieldDto[] => (s.kind === "info" || s.kind === "embedded-login" ? [] : (s.fields ?? []));

/**
 * One connection wizard for stores and services; the same component serves the first run and Settings (ADR 69).
 * Typed values live only in this component's state and are dropped when the step changes or the wizard closes.
 */
export function ConnectWizard({ target, resume, onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const id = targetId(target);
  const [step, setStep] = useState<WizardStepDto | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState<Rejected | null>(null);
  const [connectedAs, setConnectedAs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

  function apply(res: WizardResponseDto): void {
    if (res.kind === "done") {
      setValues({});
      if (res.accountLabel) setConnectedAs(res.accountLabel); // show who is connected, the user closes it
      else onDone();
    } else if (res.kind === "rejected") {
      setRejected(res.error); // same step stays; the typed values stay so the user can fix them
    } else {
      setStep(res);
      setValues({}); // previous step's values are discarded (ADR 68)
      setRejected(null);
    }
  }

  useEffect(() => {
    let live = true;
    const first = resume ? Promise.resolve(resume.response) : api.startWizard(target);
    void first.then((res) => live && apply(res), (e: unknown) => live && setRejected(errorOf(e)));
    return () => {
      live = false;
      if (!resume) void api.cancelWizard(target); // a resumed wizard is cancelled by its page: StrictMode would kill it here
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the target changes
  }, [id]);

  useEffect(() => title.current?.focus(), [step?.id]);

  async function send(input: Parameters<typeof api.submitWizard>[1]): Promise<void> {
    setBusy(true);
    try {
      apply(await mutate(api.submitWizard(target, input)));
    } catch (e) {
      setRejected(errorOf(e)); // e.g. the wizard expired (404): the key is wizard.expired
    } finally {
      setBusy(false);
    }
  }

  if (connectedAs !== null) {
    return (
      <div className={styles.wizard}>
        <p role="status">{t("wizard.connectedAs", { name: connectedAs })}</p>
        <div className={styles.buttons}>
          <button type="button" className={cx(ui.btn, ui.primary)} onClick={onDone}>
            {t("common.continue")}
          </button>
        </div>
      </div>
    );
  }
  if (!step) {
    return rejected ? (
      <div className={styles.wizard}>
        <p className={styles.rejected} role="alert">{rejectedText(t, rejected)}</p>
        <div className={styles.buttons}>
          <button type="button" className={ui.btn} onClick={onCancel}>{t("common.cancel")}</button>
        </div>
      </div>
    ) : (
      <div className={styles.wizard} role="status">{t("common.loading")}</div>
    );
  }

  const fields = stepFields(step);
  const allValid = fields.length > 0 && fields.every((f) => validateField(values[f.name] ?? "", f).ok);
  const url = step.kind === "open-external" ? safeExternalUrl(step.url) : null;
  // Outside the simulator, the OpenID step is a link (same tab) and the return page does the rest (ADR 74).
  const realLogin = step.kind === "open-external" && step.awaits === "callback" && !isSimulated;
  const advance = (): Promise<void> => send(step.kind === "open-external" && step.awaits === "callback" ? { kind: "callback", query: {} } : { kind: "continue" });
  const rememberReturn = (): void => {
    try {
      sessionStorage.setItem(WIZARD_RETURN_KEY, location.pathname === "/welcome" ? "welcome" : "settings");
    } catch {
      /* blocked: the return page then defaults to Settings */
    }
  };
  const submitFields = (): void => {
    if (allValid) void send({ kind: "fields", values: valuesToSend(fields, values) });
  };

  return (
    <div className={styles.wizard}>
      <h4 ref={title} tabIndex={-1}>
        {t(step.titleKey)}
      </h4>
      <div>
        <StepText text={t(step.bodyKey)} />
      </div>

      {step.kind === "open-external" && step.awaits === "input" && (
        url ? (
          <a className={cx(ui.btn, ui.primary)} href={url} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
            <Icon name="external" size={18} />
            {t("wizard.openPage")}
            <span className="sr-only">{t("wizard.newTab")}</span>
          </a>
        ) : (
          <p className={ui.error}>{t("wizard.badLink")}</p>
        )
      )}

      {realLogin && (
        url ? (
          // Same tab on purpose (ADR 74): the return lands in this tab. Only this kind of step; the others open a new tab.
          <a className={cx(ui.btn, ui.primary)} href={url} rel="noreferrer" onClick={rememberReturn} style={{ alignSelf: "flex-start" }}>
            <Icon name="external" size={18} />
            {t("wizard.signIn", { store: target.kind === "store" ? STORE_BRAND[target.store].name : id })}
          </a>
        ) : (
          <p className={ui.error}>{t("wizard.badLink")}</p>
        )
      )}

      {step.kind === "open-external" && step.awaits === "callback" && isSimulated && (
        <p className={styles.note} role="status">{t("wizard.simulatedLogin")}</p>
      )}

      {fields.map((f) => (
        <SecretField
          key={`${step.id}-${f.name}`}
          field={f}
          value={values[f.name] ?? ""}
          onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
          formatErrorKey={`connectors.${id}.error.format`}
          onEnter={submitFields}
        />
      ))}

      {step.kind === "embedded-login" && busy && <p className={styles.note} role="status">{t("wizard.embedded.waiting")}</p>}

      {rejected && <p className={styles.rejected} role="alert">{rejectedText(t, rejected)}</p>}

      <div className={styles.buttons}>
        {step.kind === "embedded-login" ? (
          // The request stays open while the window does (ADR 80); Cancel closes the wizard, which closes the window.
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={busy} onClick={() => void send({ kind: "continue" })}>
            <Icon name="external" size={18} />
            {t("wizard.embedded.open")}
          </button>
        ) : fields.length > 0 ? (
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={!allValid || busy} onClick={submitFields}>
            {t("wizard.verify")}
          </button>
        ) : (
          !realLogin && (
            <button type="button" className={cx(ui.btn, ui.primary)} disabled={busy} onClick={() => void advance()}>
              {t("common.continue")}
            </button>
          )
        )}
        {id === "steam" && step.id === "choose" && (
          // Real: no key means "installed only", which is the default mode, so cancel and close (ADR 74 point 4).
          <button type="button" className={ui.btn} disabled={busy} onClick={isSimulated ? () => void send({ kind: "fields", values: { mode: "installed-only" } }) : onCancel}>
            {t("connectors.steam.choose.noKey")}
          </button>
        )}
        <button type="button" className={ui.btn} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

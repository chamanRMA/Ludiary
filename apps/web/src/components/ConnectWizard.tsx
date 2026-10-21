import type { WizardFieldDto, WizardResponseDto, WizardStepDto, WizardTarget } from "@ludiary/api-contract";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isSimulated } from "../data/api";
import { mutate } from "../data/hooks";
import { safeExternalUrl, validateField } from "../data/validate";
import ui from "../styles/ui.module.css";
import { cx, StepText } from "./bits";
import { Icon } from "./Icon";
import { SecretField } from "./SecretField";
import styles from "./wizard.module.css";

interface Props {
  target: WizardTarget;
  onDone(): void;
  onCancel(): void;
}

const targetId = (t: WizardTarget): string => (t.kind === "store" ? t.store : t.service);
const stepFields = (s: WizardStepDto): readonly WizardFieldDto[] => (s.kind === "info" ? [] : (s.fields ?? []));

/**
 * One connection wizard for stores and services; the same component serves the first run and Settings (ADR 69).
 * Typed values live only in this component's state and are dropped when the step changes or the wizard closes.
 */
export function ConnectWizard({ target, onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const id = targetId(target);
  const [step, setStep] = useState<WizardStepDto | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rejectedKey, setRejectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

  function apply(res: WizardResponseDto): void {
    if (res.kind === "done") {
      setValues({});
      onDone();
    } else if (res.kind === "rejected") {
      setRejectedKey(res.error.key); // same step stays; the typed values stay so the user can fix them
    } else {
      setStep(res);
      setValues({}); // previous step's values are discarded (ADR 68)
      setRejectedKey(null);
    }
  }

  useEffect(() => {
    let live = true;
    void api.startWizard(target).then((res) => live && apply(res));
    return () => {
      live = false;
      void api.cancelWizard(target);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the target changes
  }, [id]);

  useEffect(() => title.current?.focus(), [step?.id]);

  async function send(input: Parameters<typeof api.submitWizard>[1]): Promise<void> {
    setBusy(true);
    try {
      apply(await mutate(api.submitWizard(target, input)));
    } finally {
      setBusy(false);
    }
  }

  if (!step) return <div className={styles.wizard} role="status">{t("common.loading")}</div>;

  const fields = stepFields(step);
  const allValid = fields.length > 0 && fields.every((f) => validateField(values[f.name] ?? "", f).ok);
  const url = step.kind === "open-external" ? safeExternalUrl(step.url) : null;
  const advance = (): Promise<void> => send(step.kind === "open-external" ? { kind: "callback", query: {} } : { kind: "continue" });
  const submitFields = (): void => {
    if (allValid) void send({ kind: "fields", values });
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

      {rejectedKey && <p className={styles.rejected} role="alert">{t(rejectedKey)}</p>}

      <div className={styles.buttons}>
        {fields.length > 0 ? (
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={!allValid || busy} onClick={submitFields}>
            {t("wizard.verify")}
          </button>
        ) : (
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={busy} onClick={() => void advance()}>
            {t("common.continue")}
          </button>
        )}
        {id === "steam" && step.id === "choose" && (
          <button type="button" className={ui.btn} disabled={busy} onClick={() => void send({ kind: "fields", values: { mode: "installed-only" } })}>
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

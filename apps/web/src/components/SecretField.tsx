import type { WizardFieldDto } from "@ludiary/api-contract";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { validateField } from "../data/validate";
import ui from "../styles/ui.module.css";
import { Icon } from "./Icon";
import styles from "./wizard.module.css";

interface Props {
  field: WizardFieldDto;
  value: string;
  onChange(value: string): void;
  /** i18n key of the message shown when the format is wrong. */
  formatErrorKey: string;
  onEnter?(): void;
}

/**
 * Secret input (ADR 43, 68): password type, no form element (so password managers do not offer to save it),
 * Paste button with a Ctrl+V fallback, and immediate format validation. The value never leaves this component's state.
 */
export function SecretField({ field, value, onChange, formatErrorKey, onEnter }: Props) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [manualHint, setManualHint] = useState(false);
  const check = value === "" ? null : validateField(value, field);
  const messageId = `msg-${field.name}`;

  async function paste(): Promise<void> {
    try {
      onChange((await navigator.clipboard.readText()).trim());
      setManualHint(false);
    } catch {
      input.current?.focus(); // denied or unsupported: the user pastes with Ctrl+V (ADR 43)
      setManualHint(true);
    }
  }

  return (
    <div className={styles.field}>
      <label htmlFor={`f-${field.name}`}>{t(field.labelKey)}</label>
      <div className={styles.fieldRow}>
        <input
          id={`f-${field.name}`}
          ref={input}
          className={styles.input}
          type={field.secret ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          maxLength={field.maxLength}
          value={value}
          aria-invalid={check?.ok === false}
          aria-describedby={messageId}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
        />
        {field.paste && (
          <button type="button" className={ui.btn} onClick={() => void paste()}>
            <Icon name="paste" size={18} />
            {t("wizard.paste")}
          </button>
        )}
      </div>
      <p id={messageId} role="status" className={check?.ok === false ? ui.error : check?.ok ? ui.ok : ui.muted}>
        {check === null
          ? manualHint
            ? t("wizard.pasteManual")
            : ""
          : check.ok
            ? t("wizard.formatOk")
            : check.reason === "format"
              ? t(formatErrorKey)
              : t(check.reason === "too-long" ? "wizard.tooLong" : "wizard.empty")}
      </p>
    </div>
  );
}

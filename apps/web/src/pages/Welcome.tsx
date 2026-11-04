import { UpdateModePicker } from "../components/UpdatesPanel";
import type { DetectionMode, ServiceId, StoreId } from "@ludiary/api-contract";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { changeLocale, type UiLocale } from "../app/i18n";
import { navigate } from "../app/router";
import { STORE_BRAND } from "../app/stores";
import { api, isSimulated } from "../data/api";
import { mutate, useQuery } from "../data/hooks";
import { cx } from "../components/bits";
import { TargetRow } from "../components/TargetRow";
import ui from "../styles/ui.module.css";
import styles from "./welcome.module.css";

type StepName = "language" | "detection" | "stores" | "services" | "done";
// Services are simulated until the server has them: the real app does not offer them.
const STEPS: readonly StepName[] = isSimulated ? ["language", "detection", "stores", "services", "done"] : ["language", "detection", "stores", "done"];
const DETECTION: readonly DetectionMode[] = ["auto-and-manual", "manual-only", "later"];
const WIZARD_STORES: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];
const WIZARD_SERVICES: readonly ServiceId[] = isSimulated ? ["rawg", "igdb"] : []; // ADR 69: IsThereAnyDeal does not appear until phase 3

/** First-run wizard (ADR 69): five steps, every one skippable, and "Skip all". */
export function Welcome() {
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(() => (new URLSearchParams(location.search).get("step") === "stores" ? STEPS.indexOf("stores") : 0)); // back from the Steam sign-in (ADR 74)
  const [pick, setPick] = useState<DetectionMode>("auto-and-manual");
  const heading = useRef<HTMLHeadingElement>(null);
  const stores = useQuery(() => api.getStores());
  const services = useQuery(() => api.getServices());
  const settings = useQuery(() => api.getSettings());
  const updates = useQuery(() => api.getUpdates());
  const step: StepName = STEPS[index] ?? "done";

  useEffect(() => heading.current?.focus(), [index]);

  const go = (delta: number): void => setIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));

  async function chooseLocale(locale: UiLocale): Promise<void> {
    await mutate(api.updateSettings({ locale }));
    await changeLocale(locale);
  }

  async function next(): Promise<void> {
    if (step === "detection") await mutate(api.updateSettings({ detection: pick }));
    go(1);
  }

  async function finish(): Promise<void> {
    await mutate(api.completeOnboarding(settings?.detection ?? null));
    navigate("/library", true);
  }

  async function skipAll(): Promise<void> {
    await mutate(api.completeOnboarding(settings?.detection ?? null));
    navigate("/", true);
  }

  const detection = settings?.detection ?? null;
  const connectedStore = (id: StoreId): boolean => stores?.find((s) => s.store === id)?.connection === "connected";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.head}>
          <span className={styles.brand}>
            <span className={styles.mark} aria-hidden="true" />
            {t("app.name")}
          </span>
          <button type="button" className={ui.btn} onClick={() => void skipAll()}>
            {t("onboarding.skipAll")}
          </button>
        </header>

        <ol className={styles.steps} aria-label={t("onboarding.progress")}>
          {STEPS.map((name, i) => (
            <li key={name} className={cx(i === index && styles.current, i < index && styles.past)} {...(i === index ? { "aria-current": "step" as const } : {})}>
              <span className={styles.num}>{i + 1}</span>
              <span className={styles.stepName}>{t(`onboarding.${name}.short`)}</span>
            </li>
          ))}
        </ol>

        <section className={styles.body}>
          <h1 ref={heading} tabIndex={-1}>
            {t(`onboarding.${step}.title`)}
          </h1>
          <p className={ui.muted}>{t(`onboarding.${step}.intro`)}</p>

          {step === "language" && (
            <fieldset className={styles.options}>
              <legend className="sr-only">{t("onboarding.language.title")}</legend>
              {(["es", "en"] as const).map((l) => (
                <label key={l} className={cx(styles.option, i18n.language === l && styles.selected)}>
                  <input type="radio" name="locale" checked={i18n.language === l} onChange={() => void chooseLocale(l)} />
                  <span>
                    <b>{t(`onboarding.language.${l}`)}</b>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {step === "language" && updates && updates.state !== "unsupported" && (
            <>
              <h2>{t("updates.wizard.title")}</h2>
              <p className={ui.muted}>{t("updates.wizard.body")}</p>
              <UpdateModePicker name="wizard-update-mode" value={updates.mode} onPick={(mode) => void mutate(api.updateUpdateSettings({ mode }))} />
              <p className={ui.muted}>{t("updates.privacy")}</p>
            </>
          )}

          {step === "detection" && (
            <>
              <fieldset className={styles.options}>
                <legend className="sr-only">{t("onboarding.detection.title")}</legend>
                {DETECTION.map((mode) => (
                  <label key={mode} className={cx(styles.option, pick === mode && styles.selected)}>
                    <input type="radio" name="detection" checked={pick === mode} onChange={() => setPick(mode)} />
                    <span>
                      <b>
                        {t(`detection.${mode}.title`)} {mode === "auto-and-manual" && <span className={ui.chip}>{t("common.recommended")}</span>}
                      </b>
                      <small>{t(`detection.${mode}.desc`)}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className={ui.muted}>{t("detection.reads")}</p>
            </>
          )}

          {step === "stores" && (
            <>
              {detection === "later" && <p className={styles.notice}>{t("onboarding.stores.laterWarning")}</p>}
              {detection === "manual-only" && <p className={styles.notice}>{t("onboarding.stores.manualWarning")}</p>}
              <div>{stores && WIZARD_STORES.map((id) => { const s = stores.find((x) => x.store === id); return s ? <TargetRow key={id} store={s} /> : null; })}</div>
            </>
          )}

          {step === "services" && (
            <>
              <p>{t("onboarding.services.choose")}</p>
              <div>{services && WIZARD_SERVICES.map((id) => { const s = services.find((x) => x.service === id); return s ? <TargetRow key={id} service={s} /> : null; })}</div>
            </>
          )}

          {step === "done" && (
            <>
              <ul className={styles.summary}>
                <li>
                  <b>{t("onboarding.done.language")}</b>
                  <span>{t(`onboarding.language.${i18n.language === "es" ? "es" : "en"}`)}</span>
                </li>
                <li>
                  <b>{t("onboarding.done.detection")}</b>
                  <span className={detection ? ui.ok : ui.muted}>{detection ? t(`detection.${detection}.title`) : t("onboarding.done.skipped")}</span>
                </li>
                {(["steam", "gog", "epic"] as const).map((id) => (
                  <li key={id}>
                    <b>{STORE_BRAND[id].name}</b>
                    <span className={connectedStore(id) ? ui.ok : ui.muted}>{connectedStore(id) ? t("onboarding.done.connected") : t("onboarding.done.skipped")}</span>
                  </li>
                ))}
                {WIZARD_SERVICES.map((id) => (
                  <li key={id}>
                    <b>{id === "rawg" ? "RAWG" : "IGDB"}</b>
                    <span className={services?.find((s) => s.service === id)?.configured ? ui.ok : ui.muted}>
                      {services?.find((s) => s.service === id)?.configured ? t("onboarding.done.configured") : t("onboarding.done.skipped")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={ui.muted}>{t("onboarding.done.later")}</p>
            </>
          )}
        </section>

        <footer className={styles.foot}>
          <button type="button" className={ui.btn} onClick={() => go(-1)} disabled={index === 0}>
            {t("common.back")}
          </button>
          <span className={styles.spacer} />
          {step !== "done" && (
            <button type="button" className={ui.btn} onClick={() => go(1)}>
              {t("onboarding.skipStep")}
            </button>
          )}
          {step === "done" ? (
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void finish()}>
              {t("onboarding.done.cta")}
            </button>
          ) : (
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void next()}>
              {t("common.next")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

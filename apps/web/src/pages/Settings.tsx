import type { DetectionMode, ScanRootDto } from "@ludiary/api-contract";
import i18next from "i18next";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { changeLocale } from "../app/i18n";
import { Link } from "../app/Link";
import { navigate } from "../app/router";
import { setThemePref, useThemePref, type ThemePref } from "../app/theme";
import { errorText } from "../app/errors";
import { STORE_BRAND } from "../app/stores";
import { api, isSimulated } from "../data/api";
import type { GeneralSettings, SettingsUpdate } from "../data/api";
import { mutate, useQuery } from "../data/hooks";
import { cx, PageTitle, relativeTime, SimNote } from "../components/bits";
import { CollectionsStatusLine, withCollections } from "../components/CollectionsStatus";
import { TargetRow } from "../components/TargetRow";
import ui from "../styles/ui.module.css";
import styles from "./settings.module.css";

const ALL_SECTIONS = ["general", "stores", "services", "folders", "backups", "privacy", "about"] as const;
export type SettingsSection = (typeof ALL_SECTIONS)[number];
// Services and backups only exist in the simulator for now: the real app must not suggest them (ADR 57).
export const SETTINGS_SECTIONS: readonly SettingsSection[] = isSimulated ? ALL_SECTIONS : ALL_SECTIONS.filter((s) => s !== "services" && s !== "backups");
const isSection = (v: string): v is SettingsSection => (SETTINGS_SECTIONS as readonly string[]).includes(v);

function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <span className={styles.switch}>
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
    </span>
  );
}

function Segmented<T extends string>({ name, legend, value, options, onChange }: { name: string; legend: string; value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <fieldset className={styles.seg}>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className={ui.row}>
      <div>
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

export function Settings({ section: raw }: { section: string }) {
  const { t } = useTranslation();
  const section: SettingsSection = isSection(raw) ? raw : "general";
  return (
    <>
      <header>
        <PageTitle>{t("settings.title")}</PageTitle>
        <p className={ui.muted}>{t("settings.subtitle")}</p>
      </header>
      <div className={styles.cols}>
        <nav className={styles.nav} aria-label={t("settings.sections")}>
          {SETTINGS_SECTIONS.map((s) => (
            <Link key={s} to={`/settings/${s}`}>
              {t(`settings.${s}.title`)}
            </Link>
          ))}
        </nav>
        <div className={styles.body}>
          <section className={ui.panel} aria-labelledby="settings-section">
            <h2 id="settings-section">{t(`settings.${section}.title`)}</h2>
            {section === "general" && <General />}
            {section === "stores" && <Stores />}
            {section === "services" && <Services />}
            {section === "folders" && <Folders />}
            {section === "backups" && <Backups />}
            {section === "privacy" && <Privacy />}
            {section === "about" && <About />}
          </section>
        </div>
      </div>
    </>
  );
}

function useSettings(): [GeneralSettings | undefined, (patch: SettingsUpdate) => Promise<void>] {
  const settings = useQuery(() => api.getSettings());
  return [settings, async (patch) => void (await mutate(api.updateSettings(patch)))];
}

function General() {
  const { t } = useTranslation();
  const [settings, update] = useSettings();
  const theme = useThemePref();
  if (!settings) return null;
  return (
    <>
      <Row title={t("settings.general.language")} hint={t("settings.general.languageHint")}>
        <Segmented
          name="locale"
          legend={t("settings.general.language")}
          value={settings.locale}
          options={[
            { value: "system", label: t("settings.general.system") },
            { value: "es", label: t("onboarding.language.es") },
            { value: "en", label: t("onboarding.language.en") },
          ]}
          onChange={(locale) => void update({ locale }).then(() => changeLocale(locale))}
        />
      </Row>
      <Row title={t("settings.general.theme")}>
        <Segmented<ThemePref>
          name="theme"
          legend={t("settings.general.theme")}
          value={theme}
          options={[
            { value: "system", label: t("settings.general.system") },
            { value: "light", label: t("settings.general.light") },
            { value: "dark", label: t("settings.general.dark") },
          ]}
          onChange={setThemePref}
        />
      </Row>
      {isSimulated && (
        <>
          <Row title={t("settings.general.autostart")} hint={t("settings.general.autostartHint")}>
            <Switch checked={settings.autostart} label={t("settings.general.autostart")} onChange={(autostart) => void update({ autostart })} />
          </Row>
          <Row title={t("settings.general.syncOnStart")} hint={t("settings.general.syncOnStartHint")}>
            <Switch checked={settings.syncOnStart} label={t("settings.general.syncOnStart")} onChange={(syncOnStart) => void update({ syncOnStart })} />
          </Row>
        </>
      )}
      <Row title={t("settings.general.repeat")} hint={t("settings.general.repeatHint")}>
        <button
          type="button"
          className={ui.btn}
          onClick={() => void mutate(api.resetOnboarding()).then(() => navigate("/welcome"))}
        >
          {t("settings.general.repeatButton")}
        </button>
      </Row>
    </>
  );
}

/** ADR 88: the switches of the collections mirror of one store, with its status line. */
function StoreCollections({ store }: { store: ReturnType<typeof withCollections>[number] }) {
  const { t } = useTranslation();
  const [settings, update] = useSettings();
  const mine = settings?.storeCollections[store.store];
  if (!mine) return null;
  const name = STORE_BRAND[store.store].name;
  const set = (patch: { enabled?: boolean; unverifiedFavorites?: boolean }) => void update({ storeCollections: { [store.store]: patch } });
  return (
    <>
      <Row title={t("settings.stores.collections.enabled", { store: name })} hint={t("settings.stores.collections.enabledHint", { store: name })}>
        <Switch checked={mine.enabled} label={t("settings.stores.collections.enabled", { store: name })} onChange={(enabled) => set({ enabled })} />
      </Row>
      {mine.enabled && store.collections.accountVerified === false && (
        <Row title={t("settings.stores.collections.unverified", { store: name })} hint={t("settings.stores.collections.unverifiedHint", { store: name })}>
          <Switch checked={mine.unverifiedFavorites} label={t("settings.stores.collections.unverified", { store: name })} onChange={(unverifiedFavorites) => set({ unverifiedFavorites })} />
        </Row>
      )}
      <CollectionsStatusLine status={store} />
    </>
  );
}

function Stores() {
  const { t } = useTranslation();
  const stores = useQuery(() => api.getStores());
  const [done, setDone] = useState(false);
  const epic = stores?.find((s) => s.store === "epic");
  return (
    <>
      <p className={ui.muted}>{t("settings.stores.intro")}</p>
      <div>{stores?.map((s) => <TargetRow key={s.store} store={s} />)}</div>
      {withCollections(stores).map((s) => <StoreCollections key={s.store} store={s} />)}
      {isSimulated && epic?.connection === "connected" && (
        <Row title={t("settings.stores.simulate")} hint={t("settings.stores.simulateHint")}>
          <button type="button" className={ui.btn} onClick={() => void mutate(api.simulateExpiredSession("epic")).then(() => setDone(true))}>
            {t("settings.stores.simulateButton")}
          </button>
        </Row>
      )}
      <SimNote show={done} />
    </>
  );
}

function Services() {
  const { t } = useTranslation();
  const services = useQuery(() => api.getServices());
  const order = ["rawg", "igdb", "itad"] as const;
  return (
    <>
      <p className={ui.muted}>{t("settings.services.intro")}</p>
      <div>
        {order.map((id) => {
          const s = services?.find((x) => x.service === id);
          return s ? <TargetRow key={id} service={s} /> : null;
        })}
      </div>
      <p className={ui.muted}>{t("settings.services.attribution")}</p>
    </>
  );
}

function Folders() {
  const { t, i18n } = useTranslation();
  const [settings, update] = useSettings();
  const maintenance = useQuery(() => api.getMaintenance());
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeId = useId();
  if (!settings) return null;
  // The picker is a native dialog opened by the server (ADR 72); cancelling it is not an error.
  const run = async (action: Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await mutate(action);
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const rootLabel = (root: ScanRootDto): string => (root.labelKey && i18next.exists(root.labelKey) ? t(root.labelKey) : root.path);
  const rootHint = (root: ScanRootDto): string => {
    const origin = root.origin === "user" ? t("settings.folders.user") : t("settings.folders.discovered");
    return root.store ? `${STORE_BRAND[root.store].name} · ${origin}` : origin;
  };
  return (
    <>
      <fieldset className={styles.modes} aria-labelledby={modeId}>
        <legend id={modeId}>{t("settings.folders.mode")}</legend>
        {(["auto-and-manual", "manual-only", "later"] as const satisfies readonly DetectionMode[]).map((mode) => (
          <label key={mode}>
            <input type="radio" name="detection" checked={settings.detection === mode} onChange={() => void update({ detection: mode })} />
            <span>
              <b>{t(`detection.${mode}.title`)}</b>
              <small>{t(`detection.${mode}.desc`)}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {settings.detection === "manual-only" && <p className={styles.notice}>{t("onboarding.stores.manualWarning")}</p>}
      {settings.detection === "later" && <p className={styles.notice}>{t("onboarding.stores.laterWarning")}</p>}

      <h3>{t("settings.folders.list")}</h3>
      {settings.scanRoots.map((root) => (
        <div key={root.id} className={ui.row}>
          <div>
            <span className={ui.path}>{rootLabel(root)}</span>
            {rootLabel(root) !== root.path && <small className={ui.path} style={{ display: "block" }}>{root.path}</small>}
            <small style={{ display: "block", color: "var(--mu)" }}>{rootHint(root)}</small>
          </div>
          <div className={ui.actions}>
            {root.origin === "user" && (
              <button type="button" className={cx(ui.btn, ui.small)} onClick={() => void run(api.removeScanRoot(root.id))}>
                {t("common.remove")}
              </button>
            )}
            <Switch checked={root.enabled} label={t("settings.folders.enable", { path: root.path })} onChange={(enabled) => void run(api.setScanRootEnabled(root.id, enabled))} />
          </div>
        </div>
      ))}
      <div className={ui.actions} style={{ justifyContent: "flex-start" }}>
        <button type="button" className={ui.btn} onClick={() => void run(api.addScanRoot())}>
          {t("settings.folders.add")}
        </button>
        <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void run(api.scan()).then(() => setScanned(true))}>
          {t("settings.folders.scan")}
        </button>
      </div>
      <p className={ui.muted}>
        {maintenance?.lastScanAt ? t("settings.folders.lastScan", { when: relativeTime(maintenance.lastScanAt, i18n.language) }) : t("settings.folders.neverScanned")}
      </p>
      {error && <p className={ui.error} role="alert">{error}</p>}
      <SimNote show={scanned && isSimulated} />
      {isSimulated && <p className={ui.muted}>{t("settings.folders.simulatedPicker")}</p>}
    </>
  );
}

function Backups() {
  const { t, i18n } = useTranslation();
  const [settings, update] = useSettings();
  const maintenance = useQuery(() => api.getMaintenance());
  const [made, setMade] = useState(false);
  if (!settings) return null;
  return (
    <>
      <p className={ui.muted}>{t("settings.backups.intro")}</p>
      <Row title={t("settings.backups.periodic")} hint={t("settings.backups.periodicHint")}>
        <Switch checked={settings.backups.periodic} label={t("settings.backups.periodic")} onChange={(periodic) => void update({ backups: { ...settings.backups, periodic } })} />
      </Row>
      <Row title={t("settings.backups.folder")} hint={settings.backups.folder ?? t("settings.backups.defaultFolder")}>
        <span />
      </Row>
      <Row
        title={t("settings.backups.now")}
        hint={maintenance?.lastBackupAt ? t("settings.backups.last", { when: relativeTime(maintenance.lastBackupAt, i18n.language) }) : t("settings.backups.never")}
      >
        <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void mutate(api.createBackup()).then(() => setMade(true))}>
          {t("settings.backups.button")}
        </button>
      </Row>
      <SimNote show={made} />
      <p className={ui.muted}>{t("settings.backups.noKey")}</p>
    </>
  );
}

function Privacy() {
  const { t } = useTranslation();
  const [exported, setExported] = useState(false);
  return (
    <>
      <ul className={styles.list}>
        {(["noTelemetry", "local", "secrets", "logs"] as const).map((k) => (
          <li key={k}>{t(`settings.privacy.${k}`)}</li>
        ))}
      </ul>
      {isSimulated && (
        <Row title={t("settings.privacy.export")} hint={t("settings.privacy.exportHint")}>
          <button type="button" className={ui.btn} onClick={() => void mutate(api.exportLogs()).then(() => setExported(true))}>
            {t("settings.privacy.exportButton")}
          </button>
        </Row>
      )}
      <SimNote show={exported} />
      <Row title={t("settings.privacy.revoke")} hint={t("settings.privacy.revokeHint")}>
        <button type="button" className={ui.btn} onClick={() => window.confirm(t("settings.privacy.revokeConfirm")) && void mutate(api.revokeSessions())}>
          {t("settings.privacy.revokeButton")}
        </button>
      </Row>
    </>
  );
}

function About() {
  const { t } = useTranslation();
  const [settings, update] = useSettings();
  return (
    <>
      <p>{t("settings.about.what")}</p>
      <p className={ui.muted}>{t("settings.about.license")}</p>
      <p className={ui.muted}>{t("settings.about.affiliation")}</p>
      {isSimulated && settings && (
        <Row title={t("settings.about.autoUpdate")} hint={t("settings.about.autoUpdateHint")}>
          <Switch checked={settings.autoUpdate} label={t("settings.about.autoUpdate")} onChange={(autoUpdate) => void update({ autoUpdate })} />
        </Row>
      )}
    </>
  );
}

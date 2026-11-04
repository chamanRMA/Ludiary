import { useTranslation } from "react-i18next";
import styles from "./restarting.module.css";

/** ADR 89 point 6.5: shown in the old tab instead of the app while the server restarts into a new one. */
export function Restarting() {
  const { t } = useTranslation();
  return (
    <div role="alert" className={styles.screen}>
      <p>{t("settings.backups.restarting")}</p>
    </div>
  );
}

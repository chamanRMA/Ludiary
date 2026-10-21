import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { PageTitle, cx } from "../components/bits";
import ui from "../styles/ui.module.css";

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className={ui.stack}>
      <PageTitle>{t("notFound.title")}</PageTitle>
      <p className={ui.muted}>{t("notFound.body")}</p>
      <Link to="/" className={cx(ui.btn, ui.primary)} style={{ alignSelf: "flex-start" }}>
        {t("notFound.home")}
      </Link>
    </div>
  );
}

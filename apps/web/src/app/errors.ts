import i18next, { type TFunction } from "i18next";
import { ApiError } from "../data/http";

/** Translated text for an error coming from the API layer. Unknown keys fall back to a generic message. */
export function errorText(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (i18next.exists(error.key)) return t(error.key, error.params ? { ...error.params } : {});
    if (error.status === 0) return t("errors.unreachable");
  }
  return t("errors.generic");
}

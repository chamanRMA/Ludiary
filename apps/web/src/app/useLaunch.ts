import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isSimulated } from "../data/api";
import { errorText } from "./errors";

export interface LaunchMessage {
  text: string;
  error: boolean;
}

/**
 * Play button logic shared by the game page and the library cards. Only stored ids travel (invariant 3);
 * the button stays disabled for 5 s so a double click cannot start the game twice.
 */
export function useLaunch() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<LaunchMessage | null>(null);
  const [launching, setLaunching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function play(gameId: string, title: string, storeName: string, propertyId?: string, action: "play" | "install" = "play"): Promise<void> {
    setLaunching(true);
    timer.current = setTimeout(() => setLaunching(false), 5000);
    try {
      await api.launchGame(gameId, propertyId, action === "play" ? undefined : action);
      setMessage({ text: isSimulated ? t("game.playSimulated", { title }) : storeName === "" && action === "play" ? t("game.launchingLocal", { title }) : t(action === "install" ? "game.installing" : "game.launching", { store: storeName }), error: false });
    } catch (e) {
      setMessage({ text: errorText(t, e), error: true });
    }
  }

  return { launching, message, setMessage, play };
}

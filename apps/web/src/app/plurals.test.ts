import i18next from "i18next";
import { expect, it } from "vitest";
import { webCatalogs } from "@ludiary/i18n/web";

it("counted texts agree in number in es and en (singular for 1, plural otherwise)", async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "es",
    resources: { es: { translation: webCatalogs.es }, en: { translation: webCatalogs.en } },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { prefix: "{", suffix: "}", escapeValue: false },
  });
  expect(i18n.t("collections.games", { count: 1 })).toBe("1 juego");
  expect(i18n.t("collections.games", { count: 0 })).toBe("0 juegos");
  expect(i18n.t("nav.storeLabel", { store: "Steam", count: 1 })).toBe("Steam, 1 juego");
  expect(i18n.t("library.count", { shown: 1, count: 1 })).toBe("1 de 1 juego");
  expect(i18n.t("collections.games", { count: 1_000_000 })).toBe("1000000 juegos"); // Spanish uses _many for millions
  await i18n.changeLanguage("en");
  expect(i18n.t("collections.games", { count: 1 })).toBe("1 game");
  expect(i18n.t("collections.games", { count: 2 })).toBe("2 games");
  expect(i18n.t("library.count", { shown: 2, count: 5 })).toBe("2 of 5 games");
});

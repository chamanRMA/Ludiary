import type { StoreId } from "@ludiary/api-contract";

export const STORE_IDS: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];

/** Brand names and colors are not translatable text; they come from the approved design. */
export const STORE_BRAND: Record<StoreId, { name: string; letter: string; color: string }> = {
  steam: { name: "Steam", letter: "S", color: "#66c0f4" },
  gog: { name: "GOG", letter: "G", color: "#b58cf0" },
  epic: { name: "Epic Games", letter: "E", color: "#d4d4d4" },
  ubisoft: { name: "Ubisoft", letter: "U", color: "#6aa5ff" },
  ea: { name: "EA", letter: "EA", color: "#ff8a7e" },
};

export const isStoreId = (v: string): v is StoreId => (STORE_IDS as readonly string[]).includes(v);

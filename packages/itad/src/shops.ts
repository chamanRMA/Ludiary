// StoreId <-> IsThereAnyDeal shop id (ADR 86, point 6). Checked against the recorded service/shops/v1 answer (fixtures/).
import type { StoreId } from "@ludiary/contracts";

export const ITAD_SHOP_IDS: Readonly<Record<StoreId, number>> = { steam: 61, gog: 35, epic: 16, ubisoft: 62, ea: 52 };

const BY_ID = new Map<number, StoreId>(Object.entries(ITAD_SHOP_IDS).map(([s, id]) => [id, s as StoreId]));
export const storeIdOf = (shopId: number): StoreId | null => BY_ID.get(shopId) ?? null;

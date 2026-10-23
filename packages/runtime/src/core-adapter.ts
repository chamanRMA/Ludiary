import type { LudiaryCoreFacade } from "@ludiary/api";
import type {
  GameDetailDto,
  GameSummaryDto,
  ScanRootDto,
  SettingsDto,
  StoreStatusDto,
  SyncStatusDto,
  TranslatedErrorDto,
  WizardResponseDto,
} from "@ludiary/api-contract";
import { ConnectorError } from "@ludiary/contracts";
import {
  CoreError,
  toErrorInfo,
  type CoreErrorInfo,
  type GameDetail,
  type GameSummary,
  type LudiaryCore,
  type WizardResponse,
  type ScanRootRecord,
  type StoreStatus,
  type SyncStateRecord,
} from "@ludiary/core";

/**
 * Error in the shape `api` understands (`code`, `key`, `params`). It carries no `cause` and no message from the
 * original exception: the HTTP layer only sends the code and the translation key (ADR 72 point 5).
 */
export class FacadeCoreError extends Error {
  readonly code: string;
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
  constructor(info: CoreErrorInfo) {
    super(`core error: ${info.code}`);
    this.name = "FacadeCoreError";
    this.code = info.code;
    this.key = info.key;
    if (info.params) this.params = info.params;
  }
}

/** CoreError and ConnectorError become FacadeCoreError; anything else is left alone and ends as a 500 without detail. */
export function toFacadeError(e: unknown): unknown {
  if (e instanceof CoreError || e instanceof ConnectorError) return new FacadeCoreError(toErrorInfo(e));
  return e;
}

const errorDto = (e: CoreErrorInfo): TranslatedErrorDto => ({
  code: e.code,
  key: e.key,
  ...(e.params ? { params: e.params } : {}),
});

export function summaryDto(g: GameSummary): GameSummaryDto {
  return {
    id: g.id,
    title: g.title,
    ...(g.coverUrl !== undefined ? { coverUrl: g.coverUrl } : {}),
    ...(g.coverFallbackUrl !== undefined ? { coverFallbackUrl: g.coverFallbackUrl } : {}),
    stores: [...g.stores],
    installed: g.installed,
    favorite: g.favorite,
    playtimeMinutes: g.playtimeMinutes,
    ...(g.lastPlayedAt !== undefined ? { lastPlayedAt: g.lastPlayedAt } : {}),
    tags: [...g.tags],
    ...(g.mainAction !== undefined ? { mainAction: g.mainAction } : {}),
    ...(g.unsynced !== undefined ? { unsynced: g.unsynced } : {}),
  };
}

/** Only `rejected` differs: the core carries CoreErrorInfo, the wire carries TranslatedErrorDto. */
export function wizardResponseDto(r: WizardResponse): WizardResponseDto {
  if (r.kind === "rejected") return { kind: "rejected", stepId: r.stepId, error: errorDto(r.error) };
  // ADR 80: the window parameters and the capture rules stay on the server.
  if (r.kind === "embedded-login") return { kind: "embedded-login", id: r.id, titleKey: r.titleKey, bodyKey: r.bodyKey };
  return r;
}

export function detailDto(g: GameDetail): GameDetailDto {
  return {
    ...summaryDto(g),
    properties: g.properties.map((p) => ({
      id: p.id,
      store: p.store,
      installed: p.installed,
      ...(p.installPath !== undefined ? { installPath: p.installPath } : {}),
      actions: [...p.actions],
    })),
    dlc: g.dlc.map((d) => ({ id: d.id, title: d.title, store: d.store })),
    collections: g.collections.map((c) => ({ id: c.id, name: c.name })),
  };
}

function syncDto(s: SyncStateRecord): SyncStatusDto {
  return {
    operation: s.operation,
    state: s.status,
    ...(s.lastSuccessAt !== null ? { lastSuccessAt: s.lastSuccessAt } : {}),
    ...(s.nextAllowedAt !== null ? { nextAllowedAt: s.nextAllowedAt } : {}),
    ...(s.error ? { error: errorDto(s.error) } : {}),
  };
}

export function storeStatusDto(s: StoreStatus): StoreStatusDto {
  return {
    store: s.store,
    access: s.access,
    connection: s.connection,
    mode: s.mode,
    ...(s.accountLabel !== undefined ? { accountLabel: s.accountLabel } : {}),
    sync: s.sync.map(syncDto),
  };
}

export function scanRootDto(r: ScanRootRecord): ScanRootDto {
  return {
    id: r.id,
    origin: r.origin,
    path: r.path,
    ...(r.store ? { store: r.store } : {}),
    enabled: r.enabled,
    ...(r.declarationId ? { declarationId: r.declarationId } : {}),
    ...(r.tag ? { tag: r.tag } : {}),
  };
}

/** Wraps the core in the facade `api` consumes (ADR 72 point 4): domain types to DTOs, errors to `FacadeCoreError`. */
export function createCoreFacade(core: LudiaryCore): LudiaryCoreFacade {
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw toFacadeError(e);
    }
  };
  const settingsDto = async (): Promise<SettingsDto> => {
    const [settings, roots] = await Promise.all([core.getSettings(), core.listScanRoots()]);
    return { locale: settings.locale, detection: settings.detection, scanRoots: roots.map(scanRootDto) };
  };

  return {
    listLibrary: () => guard(async () => (await core.listLibrary()).map(summaryDto)),
    getGame: (id) =>
      guard(async () => {
        const g = await core.getGame(id);
        return g ? detailDto(g) : null;
      }),
    launch: (id, propertyId, action) => guard(() => core.launch(id, propertyId, action)),
    requestSync: (req) =>
      guard(() => core.requestSync({ trigger: req.trigger, ...(req.operations ? { operations: req.operations } : {}) })),
    storeStatus: () => guard(async () => (await core.storeStatus()).map(storeStatusDto)),
    getSettings: () => guard(settingsDto),
    updateSettings: (patch) =>
      guard(async () => {
        await core.updateSettings({
          ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
          ...(patch.detection !== undefined ? { detection: patch.detection } : {}),
        });
        return settingsDto();
      }),
    getOnboarding: () => guard(async () => ({ ...(await core.getOnboarding()) })),
    completeOnboarding: (mode) => guard(() => core.completeOnboarding(mode)),
    resetOnboarding: () => guard(() => core.resetOnboarding()),
    setScanRootEnabled: (id, enabled) => guard(async () => void (await core.setScanRootEnabled(id, enabled))),
    pickScanRoot: () =>
      guard(async () => {
        const r = await core.pickScanRoot();
        return r ? scanRootDto(r) : null;
      }),
    removeScanRoot: (id) => guard(() => core.removeScanRoot(id)),
    startWizard: (store, returnBase) =>
      guard(async () => {
        const { wizardId, response } = await core.startWizard(store, returnBase);
        return { wizardId, response: wizardResponseDto(response) };
      }),
    submitWizard: (wizardId, stepId, input) => guard(async () => wizardResponseDto(await core.submitWizard(wizardId, stepId, input))),
    wizardCallback: (wizardId, query) =>
      guard(async () => {
        const { store, response } = await core.wizardCallback(wizardId, query);
        return { store, response: wizardResponseDto(response) };
      }),
    cancelWizard: (wizardId) => guard(() => core.cancelWizard(wizardId)),
    disconnect: (store) => guard(() => core.disconnect(store)),
  };
}

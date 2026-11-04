// Adapter between the update service and the HTTP layer (ADR 90 point 10).
import type { UpdatesFacade } from "@ludiary/api";
import { UpdateError, type UpdateService } from "./service";

export function createUpdatesFacade(svc: UpdateService): UpdatesFacade {
  const supported = () => {
    if (!svc.supported) throw new UpdateError("update.unsupported", 409);
  };
  return {
    status: () => svc.status(),
    async setSettings(patch) {
      supported();
      if (patch.mode !== undefined) await svc.setMode(patch.mode);
      if (patch.later) await svc.later();
      if (patch.ack) await svc.acknowledge();
      return svc.status();
    },
    checkNow: () => svc.checkNow(),
    async download(retryBad) {
      supported();
      const running = svc.download({ retryBad });
      running.catch(() => undefined); // later failures show up in the status (`error`), not here
      // The checks before the first network step reject within a tick; anything slower is the download itself.
      await Promise.race([running, new Promise<void>((r) => setTimeout(r, 0))]);
    },
    restart: () => svc.restart(),
  };
}

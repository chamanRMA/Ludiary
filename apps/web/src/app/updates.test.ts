import type { UpdateStatusDto } from "@ludiary/api-contract";
import { describe, expect, it } from "vitest";
import { errorKey, isBusy, releaseNotesUrl, showPrompt, statusLine, updateNotices } from "./updates";

const base: UpdateStatusDto = { mode: "notify", current: "0.2.0", state: "idle" };

describe("updates texts", () => {
  it("the notice shows only in notify, for a verified available or ready version, not snoozed and not failed before (point 20)", () => {
    const avail: UpdateStatusDto = { ...base, state: "available", latest: "0.3.0" };
    expect(showPrompt(avail)).toBe(true);
    expect(showPrompt({ ...avail, state: "ready" })).toBe(true);
    expect(showPrompt({ ...avail, mode: "auto" })).toBe(false);
    expect(showPrompt({ ...avail, mode: "off" })).toBe(false);
    expect(showPrompt({ ...avail, snoozed: true })).toBe(false);
    expect(showPrompt({ ...avail, latestFailedBefore: true })).toBe(false);
    for (const state of ["idle", "checking", "up-to-date", "downloading", "failed", "unsupported", "rolled-back"] as const) expect(showPrompt({ ...avail, state }), state).toBe(false);
  });

  it("one status line per state, with the numbers the line shows", () => {
    expect(statusLine({ ...base, state: "downloading", latest: "0.3.0", progress: 45 }, "").params).toEqual({ version: "0.3.0", percent: 45 });
    expect(statusLine({ ...base, state: "available", latest: "0.3.0" }, "").key).toBe("updates.state.available");
    expect(statusLine({ ...base, state: "available", latest: "0.3.0", latestFailedBefore: true }, "").key).toBe("updates.state.availableFailedBefore");
    expect(statusLine({ ...base, state: "ready", latest: "0.3.0" }, "").key).toBe("updates.state.ready");
    expect(statusLine({ ...base, state: "up-to-date" }, "hace 2 h").params).toEqual({ time: "hace 2 h" });
    expect(statusLine({ ...base, state: "failed", error: "check-failed" }, "").params).toEqual({ code: "check-failed" });
  });

  it("error codes without a text fall back to the generic one", () => {
    expect(errorKey("hash-mismatch", () => true)).toBe("updates.error.hash-mismatch");
    expect(errorKey("never-heard-of", () => false)).toBe("updates.error.unknown");
    expect(errorKey(undefined, () => true)).toBe("updates.error.unknown");
  });

  it("notices of the last update and the link to the notes (outside the app)", () => {
    expect(updateNotices({ ...base, updated: "0.3.0", rolledBack: { from: "0.2.0", to: "0.4.0", code: "1" }, downgraded: true }).map((n) => n.kind)).toEqual(["updated", "rolledBack", "downgraded"]);
    expect(releaseNotesUrl("0.3.0")).toBe("https://github.com/chamanRMA/Ludiary/releases/tag/0.3.0");
    expect(releaseNotesUrl("0.1.0")).toBe("https://github.com/chamanRMA/Ludiary/releases/tag/v0.1.0");
    expect(releaseNotesUrl("0.1.1")).toBe("https://github.com/chamanRMA/Ludiary/releases/tag/v0.1.1");
    expect(releaseNotesUrl("0.1.2")).toBe("https://github.com/chamanRMA/Ludiary/releases/tag/0.1.2");
  });

  it("polls only while something is moving", () => {
    expect(isBusy({ ...base, state: "downloading" })).toBe(true);
    expect(isBusy({ ...base, state: "ready" })).toBe(false);
    expect(isBusy(undefined)).toBe(false);
  });
});

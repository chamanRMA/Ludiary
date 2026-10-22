import { expect, it } from "vitest";
import { shouldShowWelcome } from "./welcome";

const pending = { completedAt: null, detection: null };
const done = { completedAt: 1, detection: "auto-and-manual" as const };

it("redirects to the wizard only with fresh data saying it is not completed", () => {
  expect(shouldShowWelcome(pending, false, "/library")).toBe(true);
  // Just after "Finish": the old answer is still there while it reloads. Must not send the user back to step 1.
  expect(shouldShowWelcome(pending, true, "/library")).toBe(false);
  expect(shouldShowWelcome(done, false, "/library")).toBe(false);
  expect(shouldShowWelcome(pending, false, "/welcome")).toBe(false);
  expect(shouldShowWelcome(undefined, false, "/")).toBe(false);
});

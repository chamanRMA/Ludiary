import type { OnboardingDto } from "@ludiary/api-contract";

/**
 * First-run redirect (ADR 69). Only decided on fresh data: right after "Finish" the previous answer
 * (not completed) is still on screen while it reloads, and redirecting on it showed the wizard twice.
 */
export function shouldShowWelcome(onboarding: OnboardingDto | undefined, stale: boolean, path: string): boolean {
  return !stale && onboarding !== undefined && onboarding.completedAt === null && path !== "/welcome" && path !== "/connect/return";
}

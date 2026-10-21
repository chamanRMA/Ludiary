import { randomInt } from "node:crypto";

/** ADR 53 */
export const AUTO_PORT_MIN = 20000;
export const AUTO_PORT_MAX = 39999;
export const AUTO_PORT_ATTEMPTS = 20;
export const OS_PORT_ATTEMPTS = 5;
export const MANUAL_PORT_MIN = 1024;
export const MANUAL_PORT_MAX = 65535;

export const isValidManualPort = (p: number) => Number.isInteger(p) && p >= MANUAL_PORT_MIN && p <= MANUAL_PORT_MAX;

/**
 * Candidate ports in order: the saved one, up to 20 random ones in 20000-39999, then 0 (let the OS choose) a few times:
 * the port the OS gives for 127.0.0.1 may already be taken on [::1] (ADR 66).
 * The caller really tries to listen on each, instead of computing a free port (ADR 53).
 */
export function* candidatePorts(saved: number | null): Generator<number> {
  if (saved !== null && isValidManualPort(saved)) yield saved;
  for (let i = 0; i < AUTO_PORT_ATTEMPTS; i++) yield randomInt(AUTO_PORT_MIN, AUTO_PORT_MAX + 1);
  for (let i = 0; i < OS_PORT_ATTEMPTS; i++) yield 0;
}

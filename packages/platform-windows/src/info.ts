import { dirname, join } from "node:path";
import type { PlatformInfo } from "@ludiary/contracts";
import { openWithShellHandler } from "./process-launcher";

export interface WindowsPlatformOptions {
  /** Technical identifier (ADR 44); names the data folder. */
  appId: string;
  /** Full path of the running executable. */
  execPath: string;
  env: NodeJS.ProcessEnv;
}

export function createWindowsPlatformInfo(opts: WindowsPlatformOptions): PlatformInfo {
  const localAppData = opts.env["LOCALAPPDATA"];
  if (!localAppData) throw new Error("LOCALAPPDATA is not set");
  const dataDir = opts.env["LUDIARY_DATA_DIR"] || join(localAppData, opts.appId);
  return {
    os: "windows",
    arch: process.arch,
    dataDir,
    installDir: dirname(opts.execPath),
    // Assumption: the formatting locale is a good proxy for the UI language (refine with GetUserDefaultUILanguage).
    systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    openUrl(url: string): Promise<void> {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return Promise.reject(new Error("only http(s) URLs can be opened"));
      }
      // No shell involved: rundll32 hands the URL to the default browser.
      return openWithShellHandler(parsed.href, undefined, opts.env);
    },
  };
}

export { CredentialManagerKeyStore, type KeyringBinding } from "./keystore";
export { HelperProcessTrayHost } from "./tray";
export { createWindowsPlatformInfo, type WindowsPlatformOptions } from "./info";
export { HelperProcessDialogs } from "./dialogs";
export { createHelperRunner, type DisposableHelperRunner, type HelperRunner } from "./helper-io";
export { WindowsLocationResolver, type WindowsLocationResolverOptions } from "./location-resolver";
export { HelperProcessUserFolders, parseKnownFolderResponse } from "./user-folders";
export { HelperProcessFolderPicker, parsePickFolderResponse } from "./folder-picker";
export {
  childEnv,
  createWindowsProcessLauncher,
  validateLaunchUri,
  openWithShellHandler,
  rundll32Path,
  type SpawnFn,
  type WindowsProcessLauncherOptions,
} from "./process-launcher";
export { buildRegistryRequest, parseRegistryResponse, type RegistryQuery, type RegistryResult } from "./registry-protocol";
export {
  HelperProcessEmbeddedLogin,
  helperEnv,
  interpret as interpretEmbeddedLogin,
  removeTree,
  type EmbeddedLoginSpawn,
  type HelperEmbeddedLoginOptions,
} from "./embedded-login";
export { createWindowsUpdatePlatform, type WindowsUpdatePlatform } from "./update-platform";

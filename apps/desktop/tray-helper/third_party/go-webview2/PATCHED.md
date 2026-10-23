# Patched copy of github.com/wailsapp/go-webview2

Vendored by Ludiary for the embedded login window (ADR 80, points 5 and 18: A1, A2, A3, M3, M5).

- **Origin:** https://github.com/wailsapp/go-webview2, commit `e08e9397f04ad0b1050d7e5bdc8e27faddc87987`
  (merge of PR #33, 14 November 2025). Taken on 23 October 2026.
- **Licenses (checked 23-10-2026):** module `LICENSE` is MIT (John Chadwick; parts Serge Zaitsev). `webviewloader/LICENSE` is
  ISC (John Chadwick, Wails Project Developers): it is a Go port of OpenWebView2Loader. `pkg/edge/guid.go` carries its own
  MIT header (Yasuhiro Matsumoto). The COM names, GUIDs and vtable layouts follow the Microsoft WebView2 SDK (BSD 3-Clause,
  Copyright Microsoft): `pkg/edge/NOTICE-MICROSOFT.txt`. `apps/desktop/scripts/build.mjs` copies the licenses of the
  subpackages (`webviewloader`, `pkg/edge`) into `THIRD-PARTY-NOTICES.txt`. `NOTICE-MICROSOFT.txt` was compared with the `LICENSE.txt` of
  Microsoft.Web.WebView2 1.0.4314.35 on 23-10-2026: identical. The go-ole notice of `guid.go` is in `pkg/edge/NOTICE-go-ole.txt`.

## What was removed

- `pkg/webview2` (generated definitions of every interface). They are not used, and the ones read were wrong (for example
  `GetSource` passes a nil pointer and the `ExecuteScript` handler takes a Go `string`). The COM calls come from the hand
  written `pkg/edge`, which Wails uses in production, plus `ludiary.go`.
- `pkg/edge/chromium*.go` (type `Chromium`): it registers `AddScriptToExecuteOnDocumentCreated`, logs to the console and
  calls `os.Exit` on any error. Also `ICoreWebView2_3.go` and the full-screen handler, which depended on it.
- `webviewloader/native_module*.go`, the embedded `WebView2Loader.dll` files (x64, x86, arm64), `create_env_native.go`
  and every upstream test: only the pure Go loader is used, no DLL is distributed. `go-winloader` and `testify` are gone
  from `go.mod`.
- Unused wrappers `AddWebMessageReceived`, `AddScriptToExecuteOnDocumentCreated`, `PostWebMessageAsString` and `OpenDevToolsWindow` of `ICoreWebView2`.
- `init()` of `pkg/edge/corewebview2.go` (locked the main thread and initialised COM for every mode of the helper).

## What was added

`pkg/edge/ludiary.go` (+ `ludiary_test.go`): type `Browser` and `Open`, with the closed list of ADR 80 M5 and nothing else:

- events: `NavigationStarting` (with `IsRedirected`), `FrameNavigationStarting`, `NavigationCompleted`,
  `NewWindowRequested`, `DownloadStarting`, `PermissionRequested`, `LaunchingExternalUriScheme`,
  `ClientCertificateRequested`; the last five are always denied or cancelled inside the library;
- interfaces: `ICoreWebView2Profile2.ClearBrowsingDataAll` (through `ICoreWebView2_13.Profile`) and
  `ICoreWebView2Environment5.BrowserProcessExited`;
- settings set to false: DevTools, default context menus, web messages, host objects, status bar, browser accelerator keys,
  password autosave, general autofill. The environment gets no additional browser arguments and OS single sign-on stays at
  its default (off). `ServerCertificateErrorDetected` is not subscribed;
- vtable slots of derived interfaces are absolute positions in the C vtable of `WebView2.h` (Microsoft.Web.WebView2 1.0.4314.35),
  because each one repeats the methods of the interface it extends: 12, 105, 75, 77, 117 and 12 for Environment5, `_13`, `_4`,
  `_5`, `_18` and Profile2. A test pins them;
- if any `QueryInterface` of the list fails, `Open` returns `ErrRuntimeMissing` before the window has been shown;
- `AddScriptToExecuteOnDocumentCreated` is never called (`ExecuteScript` is used only from the helper, after its state machine).

## Notes

- `webviewloader` sets `WEBVIEW2_*` to empty strings on purpose (it also blocks the registry overrides); the helper first
  removes every `WEBVIEW2_*` variable (`scrubWebView2Env`).
- Run the library tests with `go test github.com/wailsapp/go-webview2/pkg/edge` from `apps/desktop/tray-helper`.
- Drop this copy and the `replace` in `../../go.mod` if upstream ever offers these members.

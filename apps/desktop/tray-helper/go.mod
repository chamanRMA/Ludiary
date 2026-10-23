module github.com/ludiary/tray-helper

go 1.25.0

require (
	github.com/gogpu/systray v0.3.0
	golang.org/x/sys v0.47.0
)

require (
	github.com/go-webgpu/goffi v0.6.3 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
)

// Patched copy: upstream v0.3.0 never shows the tooltip on Windows (see third_party/gogpu-systray/PATCHED.md).
replace github.com/gogpu/systray => ./third_party/gogpu-systray

// Patched copy: closed list of extra WebView2 events/interfaces for the embedded login (see third_party/go-webview2/PATCHED.md).
require github.com/wailsapp/go-webview2 v0.0.0-00010101000000-000000000000

replace github.com/wailsapp/go-webview2 => ./third_party/go-webview2

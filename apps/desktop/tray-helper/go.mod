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

# Patched copy of github.com/gogpu/systray v0.3.0

Vendored by Ludiary (ADR 45) because the upstream release has no fix yet. MIT license, see `LICENSE`.

Only change, in `internal/platform_windows.go` (lines marked `Ludiary patch`):

- The icon is registered with `NOTIFYICON_VERSION_4`. In that mode Windows shows the standard hover tooltip only when
  `NIF_SHOWTIP` (0x80) is set. Upstream defines that value as the unused constant `nifShovel` and never sends it, so
  the tooltip never appears. The patch renames it to `nifShowTip` and adds it to the add and modify flags.

Tests and examples of the upstream module were left out. Drop this copy and the `replace` in `../../go.mod` once an
upstream release includes the fix.

//go:build !windows

package main

import (
	"os"
	"path/filepath"
)

// Stand-ins so the portable logic compiles and its tests run elsewhere; Ludiary itself only ships for Windows.
func replaceFileDurable(from, to string) error { return os.Rename(from, to) }
func openExclusive(path string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
}
func openSharedRead(path string) (*os.File, error) { return os.Open(path) }
func mutexExists(string) bool                      { return false }
func uiIsSpanish() bool                            { return false }
func showMessage(string, string)                   {}

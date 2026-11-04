//go:build ludiarytest

package main

import "os"

// Test variant only (go build -tags ludiarytest): the same data-folder hook as LUDIARY_DATA_DIR in Ludiary.exe.
func testDataDir() string { return os.Getenv("LUDIARY_DATA_DIR") }

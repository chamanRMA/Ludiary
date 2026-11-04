//go:build !ludiarytest

package main

// The release build reads no test hook from the environment (ADR 65, B5).
func testDataDir() string { return "" }

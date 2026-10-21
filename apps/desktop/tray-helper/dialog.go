package main

import (
	"bufio"
	"encoding/json"
	"os"

	"golang.org/x/sys/windows"
)

// Dialog protocol: one JSON line on stdin, {"kind":"error","title":"...","body":"..."}; answers {"result":"ok"} on stdout.
type dialogRequest struct {
	Kind  string `json:"kind"`
	Title string `json:"title"`
	Body  string `json:"body"`
}

func runDialog() int {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	if !scanner.Scan() {
		return 2
	}
	var req dialogRequest
	if err := json.Unmarshal(scanner.Bytes(), &req); err != nil || req.Kind != "error" {
		return 2
	}
	title, err1 := windows.UTF16PtrFromString(req.Title)
	body, err2 := windows.UTF16PtrFromString(req.Body)
	if err1 != nil || err2 != nil {
		return 2
	}
	// MB_SETFOREGROUND: the launcher was started from a shortcut, so the box must not hide behind other windows.
	_, _ = windows.MessageBox(0, body, title, windows.MB_OK|windows.MB_ICONERROR|windows.MB_SETFOREGROUND)
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"result": "ok"})
	return 0
}

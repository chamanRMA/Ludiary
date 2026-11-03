package main

// `ludiary-tray.exe --known-folder documents` (ADR 89, point 16): path of a Windows known folder.
//
// No stdin. stdout: one JSON object (UTF-8).
//
//	ok    : {"path":"C:\Users\x\OneDrive\Documents"}  exit 0 (follows OneDrive redirection)
//	error : {"error":"bad-request"} exit 2 (missing, unsupported or extra argument)
//	        {"error":"failed"}      exit 1 (the API could not resolve the folder)
import (
	"encoding/json"
	"io"

	"golang.org/x/sys/windows"
)

func handleKnownFolder(args []string, out io.Writer) int {
	respond := func(v map[string]any, code int) int {
		_ = json.NewEncoder(out).Encode(v)
		return code
	}
	if len(args) != 1 || args[0] != "documents" {
		return respond(map[string]any{"error": "bad-request"}, 2)
	}
	path, err := windows.KnownFolderPath(windows.FOLDERID_Documents, 0)
	if err != nil || path == "" {
		return respond(map[string]any{"error": "failed"}, 1)
	}
	return respond(map[string]any{"path": path}, 0)
}

package main

// `ludiary-tray.exe --processes` (ADR 92): the full image paths of the running processes this user can query.
//
// No stdin. stdout: one JSON line {"paths":[...]} (UTF-8), no repeats, at most maxProcessPaths entries. Always exits 0:
// a process that cannot be opened or read (other session, protected, gone meanwhile) is left out. The paths are personal
// data: the helper never writes them anywhere but stdout.
import (
	"encoding/json"
	"io"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const maxProcessPaths = 8192

func listProcessPaths() []string {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return []string{}
	}
	defer windows.CloseHandle(snap)
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	paths := []string{}
	seen := map[string]bool{}
	for err = windows.Process32First(snap, &entry); err == nil && len(paths) < maxProcessPaths; err = windows.Process32Next(snap, &entry) {
		if entry.ProcessID == 0 {
			continue
		}
		h, e := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, entry.ProcessID)
		if e != nil {
			continue
		}
		buf := make([]uint16, 32768)
		n := uint32(len(buf))
		e = windows.QueryFullProcessImageName(h, 0, &buf[0], &n)
		windows.CloseHandle(h)
		if e != nil || n == 0 {
			continue
		}
		p := windows.UTF16ToString(buf[:n])
		if p == "" || seen[strings.ToLower(p)] {
			continue
		}
		seen[strings.ToLower(p)] = true
		paths = append(paths, p)
	}
	return paths
}

func handleProcesses(out io.Writer) int {
	_ = json.NewEncoder(out).Encode(map[string]any{"paths": listProcessPaths()})
	return 0
}

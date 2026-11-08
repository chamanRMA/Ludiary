package main

// `ludiary-tray.exe --pick-folder` (ADR 72): native folder dialog (IFileOpenDialog, no CGO).
//
// Protocol: one JSON line on stdin {"title":"<already translated>"}; one JSON line on stdout:
//
//	{"path":"D:\\Games"} | {"cancelled":true} | {"error":"<code>"}
//
// Exit code 0 for path and cancelled, 1 for a dialog error, 2 for a bad request.
// Error codes: bad-request, dialog-unavailable, dialog-failed.

import (
	"bufio"
	"encoding/json"
	"io"
	"runtime"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	fosNoChangeDir     = 0x00000008
	fosPickFolders     = 0x00000020
	fosForceFileSystem = 0x00000040
	fosPathMustExist   = 0x00000800
	fosFileMustExist   = 0x00001000
	sigdnFileSysPath   = 0x80058000
	hresultCancelled   = 0x800704C7
	maxTitleLen        = 512
)

var (
	clsidFileOpenDialog = windows.GUID{Data1: 0xDC1C5A9C, Data2: 0xE88A, Data3: 0x4DDE, Data4: [8]byte{0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7}}
	iidFileOpenDialog   = windows.GUID{Data1: 0xD57C7288, Data2: 0xD4AD, Data3: 0x4768, Data4: [8]byte{0xBE, 0x02, 0x9D, 0x96, 0x95, 0x32, 0xD9, 0x60}}

	ole32                = windows.NewLazySystemDLL("ole32.dll")
	procCoCreateInstance = ole32.NewProc("CoCreateInstance")

	user32                  = windows.NewLazySystemDLL("user32.dll")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procShowWindow          = user32.NewProc("ShowWindow")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
)

type pickRequest struct {
	Title      string `json:"title"`
	FilterName string `json:"filterName"` // --pick-file only; the pattern is never read from the request
}

// filePattern is the only filter --pick-file offers (ADR 93).
const filePattern = "*.exe"

// filterSpec is COMDLG_FILTERSPEC.
type filterSpec struct{ name, spec *uint16 }

var fileFilter filterSpec

func parsePickRequest(line []byte) (pickRequest, bool) {
	var req pickRequest
	if err := json.Unmarshal(line, &req); err != nil || len(req.Title) > maxTitleLen || len(req.FilterName) > maxTitleLen {
		return pickRequest{}, false
	}
	return req, true
}

// comCall calls method `index` of the COM object `obj` (vtable slot).
func comCall(obj unsafe.Pointer, index int, args ...uintptr) uintptr {
	vtbl := *(*unsafe.Pointer)(obj)
	fn := *(*uintptr)(unsafe.Add(vtbl, index*int(unsafe.Sizeof(uintptr(0)))))
	all := append([]uintptr{uintptr(obj)}, args...)
	r, _, _ := syscall.SyscallN(fn, all...)
	return r
}

func comRelease(obj unsafe.Pointer) { comCall(obj, 2) }

// Vtable slots (IUnknown 0-2, IModalWindow 3, IFileDialog 4..).
const (
	slotShow       = 3
	slotSetFileTypes = 4
	slotSetOptions = 9
	slotGetOptions = 10
	slotSetTitle   = 17
	slotGetResult  = 20
	slotItemName   = 5 // IShellItem::GetDisplayName
)

// dialogOptions adds the flags of each mode. File mode never sets FOS_NODEREFERENCELINKS (0x100): a shortcut is
// resolved to its target by the dialog (ADR 93, A5).
func dialogOptions(opts uint32, file bool) uint32 {
	opts |= fosForceFileSystem | fosNoChangeDir | fosPathMustExist
	if file {
		return opts | fosFileMustExist
	}
	return opts | fosPickFolders
}

// newDialog creates the folder dialog, or in file mode an "Open file" dialog limited to *.exe, and configures it
// (without showing it). The shortcut (.lnk) is resolved by the dialog: FOS_NODEREFERENCELINKS is not set (ADR 93, A5).
// The caller releases it.
func newDialog(title string, file bool, filterName string) (unsafe.Pointer, error) {
	var dlg unsafe.Pointer
	const clsctxInprocServer = 0x1
	hr, _, _ := procCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidFileOpenDialog)), 0, clsctxInprocServer,
		uintptr(unsafe.Pointer(&iidFileOpenDialog)), uintptr(unsafe.Pointer(&dlg)))
	if int32(hr) < 0 || dlg == nil {
		return nil, windows.Errno(hr)
	}
	var opts uint32
	if hr := comCall(dlg, slotGetOptions, uintptr(unsafe.Pointer(&opts))); int32(hr) < 0 {
		comRelease(dlg)
		return nil, windows.Errno(hr)
	}
	opts = dialogOptions(opts, file)
	if hr := comCall(dlg, slotSetOptions, uintptr(opts)); int32(hr) < 0 {
		comRelease(dlg)
		return nil, windows.Errno(hr)
	}
	if file {
		name, err1 := windows.UTF16PtrFromString(filterName)
		spec, err2 := windows.UTF16PtrFromString(filePattern)
		if err1 != nil || err2 != nil {
			comRelease(dlg)
			return nil, windows.ERROR_INVALID_PARAMETER
		}
		// Package-level (not on the stack) so the address handed to COM as a uintptr cannot move.
		fileFilter = filterSpec{name, spec}
		hr := comCall(dlg, slotSetFileTypes, 1, uintptr(unsafe.Pointer(&fileFilter)))
		if int32(hr) < 0 {
			comRelease(dlg)
			return nil, windows.Errno(hr)
		}
	}
	if title != "" {
		t, err := windows.UTF16PtrFromString(title)
		if err == nil {
			comCall(dlg, slotSetTitle, uintptr(unsafe.Pointer(t)))
			runtime.KeepAlive(t)
		}
	}
	return dlg, nil
}

// foregroundOwner makes a 0x0 top-most tool window to own the dialog, so it opens in front of the browser.
func foregroundOwner() uintptr {
	class, _ := windows.UTF16PtrFromString("STATIC")
	const wsPopup = 0x80000000
	const exToolWindow, exTopmost = 0x80, 0x8
	hwnd, _, _ := procCreateWindowExW.Call(exToolWindow|exTopmost, uintptr(unsafe.Pointer(class)), 0, wsPopup, 0, 0, 0, 0, 0, 0, 0, 0)
	if hwnd != 0 {
		procShowWindow.Call(hwnd, 5)
		procSetForegroundWindow.Call(hwnd)
	}
	return hwnd
}

// pickPath returns (path, cancelled, error).
func pickPath(title string, file bool, filterName string) (string, bool, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED); err != nil {
		return "", false, err
	}
	defer windows.CoUninitialize()

	dlg, err := newDialog(title, file, filterName)
	if err != nil {
		return "", false, err
	}
	defer comRelease(dlg)

	owner := foregroundOwner()
	if owner != 0 {
		defer procDestroyWindow.Call(owner)
	}
	if hr := comCall(dlg, slotShow, owner); hr != 0 {
		if uint32(hr) == hresultCancelled {
			return "", true, nil
		}
		return "", false, windows.Errno(hr)
	}
	var item unsafe.Pointer
	if hr := comCall(dlg, slotGetResult, uintptr(unsafe.Pointer(&item))); int32(hr) < 0 || item == nil {
		return "", false, windows.Errno(hr)
	}
	defer comRelease(item)
	var name *uint16
	if hr := comCall(item, slotItemName, sigdnFileSysPath, uintptr(unsafe.Pointer(&name))); int32(hr) < 0 || name == nil {
		return "", false, windows.Errno(hr)
	}
	defer windows.CoTaskMemFree(unsafe.Pointer(name))
	return windows.UTF16PtrToString(name), false, nil
}

func handlePickFolder(in io.Reader, out io.Writer) int { return handlePick(in, out, false) }

// handlePickFile is `--pick-file` (ADR 93): same protocol, one .exe.
func handlePickFile(in io.Reader, out io.Writer) int { return handlePick(in, out, true) }

func handlePick(in io.Reader, out io.Writer, file bool) int {
	respond := func(v map[string]any, code int) int {
		_ = json.NewEncoder(out).Encode(v)
		return code
	}
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 0, 4096), 64*1024)
	if !scanner.Scan() {
		return respond(map[string]any{"error": "bad-request"}, 2)
	}
	req, ok := parsePickRequest(scanner.Bytes())
	if !ok {
		return respond(map[string]any{"error": "bad-request"}, 2)
	}
	path, cancelled, err := pickPath(req.Title, file, req.FilterName)
	switch {
	case err != nil:
		return respond(map[string]any{"error": "dialog-failed"}, 1)
	case cancelled:
		return respond(map[string]any{"cancelled": true}, 0)
	default:
		return respond(map[string]any{"path": path}, 0)
	}
}

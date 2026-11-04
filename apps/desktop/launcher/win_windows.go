package main

import (
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	user32          = syscall.NewLazyDLL("user32.dll")
	procMoveFileEx  = kernel32.NewProc("MoveFileExW")
	procOpenMutex   = kernel32.NewProc("OpenMutexW")
	procUILanguage  = kernel32.NewProc("GetUserDefaultUILanguage")
	procMessageBoxW = user32.NewProc("MessageBoxW")
)

const (
	moveReplaceExisting = 0x1
	moveWriteThrough    = 0x8
	synchronize         = 0x00100000
)

// replaceFileDurable is MoveFileEx(REPLACE_EXISTING | WRITE_THROUGH) (M2).
func replaceFileDurable(from, to string) error {
	f, err := syscall.UTF16PtrFromString(from)
	if err != nil {
		return err
	}
	t, err := syscall.UTF16PtrFromString(to)
	if err != nil {
		return err
	}
	r, _, e := procMoveFileEx.Call(uintptr(unsafe.Pointer(f)), uintptr(unsafe.Pointer(t)), moveReplaceExisting|moveWriteThrough)
	if r == 0 {
		return e
	}
	return nil
}

func createFile(path string, access, share uint32, disposition uint32) (*os.File, error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	h, err := syscall.CreateFile(p, access, share, nil, disposition, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(h), path), nil
}

// openExclusive creates the file and opens it with no sharing at all: the system releases it if this process dies (A3).
func openExclusive(path string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	return createFile(path, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, syscall.OPEN_ALWAYS)
}

// openSharedRead lets others read but not write or delete the file while it is open (B1).
func openSharedRead(path string) (*os.File, error) {
	return createFile(path, syscall.GENERIC_READ, syscall.FILE_SHARE_READ, syscall.OPEN_EXISTING)
}

// mutexExists is OpenMutex on the name Inno's SetupMutex creates (W4: to confirm with Inno 6.7 on a real install).
func mutexExists(name string) bool {
	n, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return false
	}
	h, _, _ := procOpenMutex.Call(synchronize, 0, uintptr(unsafe.Pointer(n)))
	if h == 0 {
		return false
	}
	syscall.CloseHandle(syscall.Handle(h))
	return true
}

func uiIsSpanish() bool {
	r, _, _ := procUILanguage.Call()
	return r&0x3ff == 0x0a
}

func showMessage(title, text string) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10) // MB_OK | MB_ICONERROR
}

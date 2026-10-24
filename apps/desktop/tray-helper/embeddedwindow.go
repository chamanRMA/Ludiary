package main

// The window and WebView2 half of `--embedded-login` (ADR 80). The decisions live in embeddedlogin.go and in the
// patched third_party/go-webview2/pkg/edge/ludiary.go; this file only wires them to a Win32 window.

import (
	"bufio"
	"io"
	"net/url"
	"path/filepath"
	"runtime"
	"time"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

const (
	wmDestroy = 0x0002
	wmSize    = 0x0005
	wmClose   = 0x0010
	wmTimer   = 0x0113
	wmApp     = 0x8000

	wmAppStdinClosed  = wmApp + 1
	wmAppTimeout      = wmApp + 2
	wmAppClearTimeout = wmApp + 3
	wmAppForceQuit    = wmApp + 4

	wsCaption     = 0x00C00000
	wsSysMenu     = 0x00080000
	wsMinimizeBox = 0x00020000
	wsClipKids    = 0x02000000
	wsExAppWindow = 0x00040000

	swHide, swShow = 0, 5
	gwlpHwndParent = ^uintptr(7) // -8
	idcArrow       = 32512

	loginClientW, loginClientH = 460, 690 // as the Galaxy window
	loginLimit                 = 11 * time.Minute
	captureEvery               = 500 * time.Millisecond
	captureWindow              = 10 * time.Second
	clearFallback              = 3 * time.Second
	exitFallback               = 5 * time.Second
	timerRetry                 = 1
)

var (
	procRegisterClassExW   = user32.NewProc("RegisterClassExW")
	procDefWindowProcW     = user32.NewProc("DefWindowProcW")
	procGetMessageW        = user32.NewProc("GetMessageW")
	procTranslateMessage   = user32.NewProc("TranslateMessage")
	procDispatchMessageW   = user32.NewProc("DispatchMessageW")
	procPostQuitMessage    = user32.NewProc("PostQuitMessage")
	procPostMessageW       = user32.NewProc("PostMessageW")
	procSetTimer           = user32.NewProc("SetTimer")
	procKillTimer          = user32.NewProc("KillTimer")
	procSetWindowTextW     = user32.NewProc("SetWindowTextW")
	procGetClientRect      = user32.NewProc("GetClientRect")
	procAdjustWindowRectEx = user32.NewProc("AdjustWindowRectEx")
	procGetSystemMetrics   = user32.NewProc("GetSystemMetrics")
	procSetProcessDPIAware = user32.NewProc("SetProcessDPIAware")
	procGetDpiForSystem    = user32.NewProc("GetDpiForSystem")
	procLoadCursorW        = user32.NewProc("LoadCursorW")
	procSetWindowLongPtrW  = user32.NewProc("SetWindowLongPtrW")
)

type wndClassEx struct {
	size       uint32
	style      uint32
	wndProc    uintptr
	clsExtra   int32
	wndExtra   int32
	instance   uintptr
	icon       uintptr
	cursor     uintptr
	background uintptr
	menuName   *uint16
	className  *uint16
	iconSm     uintptr
}

type winMsg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      [2]int32
	private uint32
}

type winRect struct{ left, top, right, bottom int32 }

// loginRun is the single login in progress; every field is touched only on the UI thread.
type loginRun struct {
	req        loginRequest
	hwnd       uintptr
	browser    *edge.Browser
	blocked    blockedSet
	machine    captureMachine
	script     string
	capStart   time.Time
	finishing  bool
	closing    bool
	result     loginResult
	retryArmed bool
}

var run *loginRun

func postToWindow(hwnd uintptr, msg uint32) { procPostMessageW.Call(hwnd, uintptr(msg), 0, 0) }

// tmpRoot is %LOCALAPPDATA%\Ludiary\tmp from the known-folder API, not from an environment variable.
func tmpRoot() string {
	base, err := windows.KnownFolderPath(windows.FOLDERID_LocalAppData, 0)
	if err != nil {
		return ""
	}
	return filepath.Join(base, "Ludiary", "tmp")
}

func handleEmbeddedLogin(in io.Reader, out io.Writer) int {
	reader := bufio.NewReader(in)
	line, err := readRequestLine(reader)
	var req loginRequest
	if err == nil {
		req, err = parseLoginRequest(line, tmpRoot())
	}
	if err != nil {
		return writeResult(out, loginResult{Error: "bad-request"})
	}
	scrubWebView2Env() // ADR 80, A2: nothing from the server's environment reaches WebView2
	script, err := buildCaptureScript(req.Capture)
	if err != nil {
		return writeResult(out, loginResult{Error: "failed"})
	}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED); err != nil {
		return writeResult(out, loginResult{Error: "failed"})
	}
	defer windows.CoUninitialize()

	run = &loginRun{req: req, script: script, machine: captureMachine{
		doneURL: req.DoneURL, captureURL: req.CaptureURL, exact: req.Capture[0].Source == srcDocumentJSON}}
	res := run.execute(reader)
	return writeResult(out, res)
}

func (r *loginRun) execute(stdin io.Reader) loginResult {
	procSetProcessDPIAware.Call()
	hwnd, err := r.createWindow()
	if err != nil {
		return loginResult{Error: "failed"}
	}
	r.hwnd = hwnd
	go func() { // stdin closing means the server cancelled or died
		_, _ = io.Copy(io.Discard, stdin)
		postToWindow(hwnd, wmAppStdinClosed)
	}()
	limit := time.AfterFunc(loginLimit, func() { postToWindow(hwnd, wmAppTimeout) })
	defer limit.Stop()

	browser, err := edge.Open(hwnd, r.req.DataDir, edge.Events{
		MainNavigation:       r.onMainNavigation,
		FrameNavigation:      r.onFrameNavigation,
		NavigationCompleted:  r.onNavigationCompleted,
		BrowserProcessExited: r.onBrowserExited,
	})
	if err != nil {
		if !r.finishing { // nothing was shown or loaded: there is no data to clear
			procDestroyWindow.Call(hwnd)
			if err == edge.ErrRuntimeMissing {
				return loginResult{Error: "runtime-missing"}
			}
			return loginResult{Error: "failed"}
		}
		return r.result
	}
	if r.finishing { // cancelled while the browser was being created: nothing was shown or loaded
		return r.result
	}
	r.browser = browser
	if r.showAndStart() != nil {
		r.finish(loginResult{Error: "failed"})
	}
	var msg winMsg
	for {
		got, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if got == 0 || int32(got) < 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
	if !r.finishing {
		return loginResult{Error: "failed"}
	}
	return r.result
}

// fitBrowser makes the web view fill the client area and draw: the controller is created while the window is still
// hidden, and without an explicit put_IsVisible(TRUE) it loads the page but paints nothing (blank window).
func (r *loginRun) fitBrowser() error {
	var rc winRect
	procGetClientRect.Call(r.hwnd, uintptr(unsafe.Pointer(&rc)))
	if err := r.browser.SetBounds(edge.Rect{Left: rc.left, Top: rc.top, Right: rc.right, Bottom: rc.bottom}); err != nil {
		return err
	}
	return r.browser.SetVisible(true)
}

func (r *loginRun) showAndStart() error {
	// Owned by a 0x0 top-most window, so it opens in front of the browser, like the folder dialog.
	if owner := foregroundOwner(); owner != 0 {
		procSetWindowLongPtrW.Call(r.hwnd, gwlpHwndParent, owner)
	}
	procShowWindow.Call(r.hwnd, swShow)
	procSetForegroundWindow.Call(r.hwnd)
	if err := r.fitBrowser(); err != nil {
		return err
	}
	return r.browser.Navigate(r.req.StartURL)
}

func (r *loginRun) createWindow() (uintptr, error) {
	var inst windows.Handle
	_ = windows.GetModuleHandleEx(windows.GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, nil, &inst)
	cursor, _, _ := procLoadCursorW.Call(0, idcArrow)
	class, _ := windows.UTF16PtrFromString("LudiaryEmbeddedLogin")
	wc := wndClassEx{wndProc: windows.NewCallback(wndProc), instance: uintptr(inst), cursor: cursor, className: class}
	wc.size = uint32(unsafe.Sizeof(wc))
	if atom, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); atom == 0 {
		return 0, err
	}
	dpi := uintptr(96)
	if procGetDpiForSystem.Find() == nil {
		if d, _, _ := procGetDpiForSystem.Call(); d != 0 {
			dpi = d
		}
	}
	const style = wsCaption | wsSysMenu | wsMinimizeBox | wsClipKids // fixed size: no resize, no maximise
	rc := winRect{0, 0, int32(loginClientW * dpi / 96), int32(loginClientH * dpi / 96)}
	procAdjustWindowRectEx.Call(uintptr(unsafe.Pointer(&rc)), style, 0, wsExAppWindow)
	w, h := rc.right-rc.left, rc.bottom-rc.top
	sw, _, _ := procGetSystemMetrics.Call(0)
	sh, _, _ := procGetSystemMetrics.Call(1)
	x, y := (int32(sw)-w)/2, (int32(sh)-h)/2
	title, _ := windows.UTF16PtrFromString(r.req.Title)
	hwnd, _, err := procCreateWindowExW.Call(wsExAppWindow, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)), style,
		uintptr(x), uintptr(y), uintptr(w), uintptr(h), 0, 0, uintptr(inst), 0)
	if hwnd == 0 {
		return 0, err
	}
	return hwnd, nil
}

func wndProc(hwnd, msg, wp, lp uintptr) uintptr {
	r := run
	if r != nil {
		switch uint32(msg) {
		case wmClose:
			r.finish(loginResult{Cancelled: true})
			return 0
		case wmAppStdinClosed:
			r.finish(loginResult{Cancelled: true})
			return 0
		case wmAppTimeout:
			r.finish(loginResult{Error: "failed"})
			return 0
		case wmAppClearTimeout:
			r.closeBrowser()
			return 0
		case wmAppForceQuit:
			procDestroyWindow.Call(hwnd)
			return 0
		case wmTimer:
			procKillTimer.Call(hwnd, timerRetry)
			r.retryArmed = false
			if !r.finishing && r.machine.state == stateCapture {
				r.attemptCapture()
			}
			return 0
		case wmSize:
			if r.browser != nil {
				_ = r.fitBrowser()
			}
		case wmDestroy:
			procPostQuitMessage.Call(0)
			return 0
		}
	}
	ret, _, _ := procDefWindowProcW.Call(hwnd, msg, wp, lp)
	return ret
}

// ---- browser events ----

func (r *loginRun) setTitleHost(raw string) {
	host := ""
	if u, err := url.Parse(raw); err == nil {
		host = u.Hostname()
	}
	text := r.req.Title
	if host != "" {
		text += " | " + host
	}
	p, _ := windows.UTF16PtrFromString(text)
	procSetWindowTextW.Call(r.hwnd, uintptr(unsafe.Pointer(p)))
}

func (r *loginRun) onMainNavigation(uri string, _ bool, navID uint64) bool {
	if r.finishing || !allowMainNavigation(uri, r.req.AllowedHosts) { // redirects take the same road
		r.blocked.add(uri)
		return false
	}
	if r.machine.onStarting(uri, navID) == actFail { // document-json: the page being read navigated away
		r.finish(loginResult{Error: "capture-missing"})
		return false
	}
	r.setTitleHost(uri)
	return true
}

func (r *loginRun) onFrameNavigation(uri string) bool {
	if r.finishing || !allowFrameNavigation(uri) {
		r.blocked.add(uri)
		return false
	}
	return true
}

func (r *loginRun) onNavigationCompleted(success bool, navID uint64) {
	if r.finishing || r.browser == nil {
		return
	}
	src, err := r.browser.Source()
	if err != nil {
		return
	}
	switch r.machine.onCompleted(navID, success, src) {
	case actNavigateToCapture:
		if r.browser.Navigate(r.req.CaptureURL) != nil {
			r.finish(loginResult{Error: "failed"})
		}
	case actCapture:
		r.capStart = time.Now()
		r.attemptCapture()
	case actFail:
		r.finish(loginResult{Error: "capture-missing"})
	}
}

// attemptCapture runs the fixed script once, after checking Source() again (ADR 80, M3).
func (r *loginRun) attemptCapture() {
	src, err := r.browser.Source()
	if err != nil || !r.machine.mayExecute(src) {
		if r.machine.exact { // nothing launched a new navigation to wait for
			r.finish(loginResult{Error: "capture-missing"})
			return
		}
		r.machine.leftCapture()
		return
	}
	err = r.browser.ExecuteScript(r.script, func(hr uintptr, resultJSON string, tooBig bool) {
		if r.finishing {
			return
		}
		if tooBig {
			r.finish(loginResult{Error: "capture-missing"})
			return
		}
		if int32(hr) >= 0 {
			if vals, ok := parseCaptureResult(resultJSON, r.req.Capture); ok {
				r.finish(loginResult{Captured: vals})
				return
			}
		}
		if time.Since(r.capStart) >= captureWindow {
			r.finish(loginResult{Error: "capture-missing"})
			return
		}
		if !r.retryArmed {
			r.retryArmed = true
			procSetTimer.Call(r.hwnd, timerRetry, uintptr(captureEvery/time.Millisecond), 0)
		}
	})
	if err != nil {
		r.finish(loginResult{Error: "failed"})
	}
}

func (r *loginRun) onBrowserExited() {
	if !r.finishing { // the browser died under us
		r.finishing = true
		r.result = loginResult{Error: "failed"}
	}
	procDestroyWindow.Call(r.hwnd)
}

// finish ends the login by any road: it clears the profile (ADR 80, A3) and only then closes the browser; the process
// leaves when the browser processes have exited (or after a short margin).
func (r *loginRun) finish(res loginResult) {
	if r.finishing {
		return
	}
	r.finishing = true
	if res.Error == "" {
		res = resultWithBlocked(res, &r.blocked)
	}
	r.result = res
	procKillTimer.Call(r.hwnd, timerRetry)
	procShowWindow.Call(r.hwnd, swHide)
	if r.browser == nil {
		procDestroyWindow.Call(r.hwnd)
		return
	}
	hwnd := r.hwnd
	time.AfterFunc(clearFallback, func() { postToWindow(hwnd, wmAppClearTimeout) })
	if r.browser.ClearBrowsingData(r.closeBrowser) != nil {
		r.closeBrowser()
	}
}

func (r *loginRun) closeBrowser() {
	if r.closing {
		return
	}
	r.closing = true
	hwnd := r.hwnd
	time.AfterFunc(exitFallback, func() { postToWindow(hwnd, wmAppForceQuit) })
	r.browser.Close()
}

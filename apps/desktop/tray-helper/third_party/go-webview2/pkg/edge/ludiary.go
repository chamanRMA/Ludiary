//go:build windows

// Ludiary patch (ADR 80, points 5 and 18: A1, A3, M3, M5). Not part of upstream.
//
// A small, closed browser wrapper for the embedded login window. It replaces `Chromium` (removed from this copy):
// that type registers AddScriptToExecuteOnDocumentCreated, logs, and exits the process on any error.
//
// The closed list of COM members added here (vtable slots are the absolute positions in WebView2.h, see the constants below):
//
//	events:      NavigationStarting, FrameNavigationStarting, NavigationCompleted, NewWindowRequested,
//	             DownloadStarting (ICoreWebView2_4), PermissionRequested, LaunchingExternalUriScheme (ICoreWebView2_18),
//	             ClientCertificateRequested (ICoreWebView2_5)
//	interfaces:  ICoreWebView2Profile2.ClearBrowsingDataAll (through ICoreWebView2_13.Profile),
//	             ICoreWebView2Environment5.BrowserProcessExited
//
// If any QueryInterface of that list fails, Open returns ErrRuntimeMissing and nothing has been shown.
// Every callback runs on the thread that called Open (the UI thread of the helper).
package edge

import (
	"errors"
	"fmt"
	"sync/atomic"
	"time"
	"unsafe"

	"github.com/wailsapp/go-webview2/internal/w32"
	"golang.org/x/sys/windows"
)

// Rect is the bounds type of SetBounds.
type Rect = w32.Rect

// ErrRuntimeMissing means the WebView2 runtime is absent or too old for the closed list above.
var ErrRuntimeMissing = errors.New("webview2 runtime missing or too old")

const (
	permissionStateDeny = 2
	eFail               = 0x80004005
	slotsMax            = 128
)

// Vtable slots. A derived interface repeats every method of the one it extends, so these are absolute positions in
// the C vtable of WebView2.h (Microsoft.Web.WebView2 1.0.4314.35), not offsets after IUnknown. Event args are small
// interfaces without a base, so they count from IUnknown (slots 0 to 2). Fixed by a test.
const (
	slotEnv5AddBrowserProcessExited      = 12
	slotWV4AddDownloadStarting           = 75
	slotWV5AddClientCertificateRequested = 77
	slotWV13GetProfile                   = 105
	slotWV18AddLaunchingExternalUri      = 117
	slotProfile2ClearBrowsingDataAll     = 12

	slotNavStartGetUri      = 3 // get_Uri, get_IsUserInitiated, get_IsRedirected, get_RequestHeaders, get_Cancel, put_Cancel
	slotNavStartGetRedirect = 5
	slotNavStartPutCancel   = 8
	slotNavDoneIsSuccess    = 3
	slotNewWindowPutHandled = 6  // get_Uri 3, put_NewWindow 4, get_NewWindow 5, put_Handled 6
	slotDownloadPutCancel   = 5  // get_DownloadOperation 3, get_Cancel 4, put_Cancel 5
	slotPermissionPutState  = 7  // get_Uri 3, get_PermissionKind 4, get_IsUserInitiated 5, get_State 6, put_State 7
	slotExtUriPutCancel     = 7  // get_Uri 3, get_InitiatingOrigin 4, get_IsUserInitiated 5, get_Cancel 6, put_Cancel 7
	slotClientCertPutCancel = 11 // get_Host 3 .. put_SelectedCertificate 9, get_Cancel 10, put_Cancel 11
)

var (
	iidWebView4  = NewGUID("{20d02d59-6df2-42dc-bd06-f98a694b1302}")
	iidWebView5  = NewGUID("{bedb11b8-d63c-11eb-b8bc-0242ac130003}")
	iidWebView13 = NewGUID("{f75f09a8-667e-4983-88d6-c8773f315e84}")
	iidWebView18 = NewGUID("{7a626017-28be-49b2-b865-3ba2b3522d90}")
	iidProfile2  = NewGUID("{fa740d4b-5eae-4344-a8ad-74be31925397}")
	iidEnv5      = NewGUID("{319e423d-e0d7-4b8d-9254-ae9475de9b17}")
)

// ---- generic COM helpers ----

// slot returns method `index` of COM object `obj`.
func slot(obj uintptr, index int) ComProc {
	vtbl := *(**[slotsMax]ComProc)(unsafe.Pointer(obj))
	return vtbl[index]
}

func hrErr(hr uintptr) error {
	if int32(hr) < 0 {
		return windows.Errno(hr)
	}
	return nil
}

func release(obj uintptr) {
	if obj != 0 {
		slot(obj, 2).Call(obj)
	}
}

// queryInterface asks `obj` for `iid`. Any failure is ErrRuntimeMissing (the closed list could not be satisfied).
func queryInterface(obj uintptr, iid *GUID) (uintptr, error) {
	var out uintptr
	hr, _, _ := slot(obj, 0).Call(obj, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out)))
	if int32(hr) < 0 || out == 0 {
		return 0, ErrRuntimeMissing
	}
	return out, nil
}

// putBool calls a `put_X(BOOL)` method.
func putBool(obj uintptr, index int, v bool) uintptr {
	var b uintptr
	if v {
		b = 1
	}
	hr, _, _ := slot(obj, index).Call(obj, b)
	return hr
}

func getString(obj uintptr, index int) string {
	var p *uint16
	hr, _, _ := slot(obj, index).Call(obj, uintptr(unsafe.Pointer(&p)))
	if int32(hr) < 0 || p == nil {
		return ""
	}
	s := windows.UTF16PtrToString(p)
	windows.CoTaskMemFree(unsafe.Pointer(p))
	return s
}

// ---- generic event handler: Invoke(this, a, b) covers every handler used here ----

type handlerVtbl struct {
	QueryInterface ComProc
	AddRef         ComProc
	Release        ComProc
	Invoke         ComProc
}

type handler struct {
	vtbl *handlerVtbl
	fn   func(a, b uintptr) uintptr
}

// live keeps every handler reachable: the browser holds them for the whole life of the process.
var live []*handler

var handlerFn = handlerVtbl{
	QueryInterface: NewComProc(func(this, riid, out uintptr) uintptr {
		*(*uintptr)(unsafe.Pointer(out)) = this
		return 0
	}),
	AddRef:  NewComProc(func(this uintptr) uintptr { return 1 }),
	Release: NewComProc(func(this uintptr) uintptr { return 1 }),
	Invoke: NewComProc(func(this, a, b uintptr) (ret uintptr) {
		defer func() {
			if recover() != nil {
				ret = eFail
			}
		}()
		return (*handler)(unsafe.Pointer(this)).fn(a, b)
	}),
}

func newHandler(fn func(a, b uintptr) uintptr) uintptr {
	h := &handler{vtbl: &handlerFn, fn: fn}
	live = append(live, h)
	return uintptr(unsafe.Pointer(h))
}

// addEvent calls `add_X(handler, *token)`.
func addEvent(obj uintptr, index int, h uintptr) error {
	var token [8]byte
	hr, _, _ := slot(obj, index).Call(obj, h, uintptr(unsafe.Pointer(&token)))
	return hrErr(hr)
}

// denyHandler cancels or denies the request in args by calling put_X(BOOL or state) at `putIndex`.
func denyHandler(putIndex int, value uintptr) uintptr {
	return newHandler(func(_, args uintptr) uintptr {
		if args != 0 {
			slot(args, putIndex).Call(args, value)
		}
		return 0
	})
}

// ---- the browser ----

// Events are the decisions the caller takes. All run on the UI thread.
type Events struct {
	// MainNavigation decides every navigation of the main document, redirects included. false cancels it.
	MainNavigation func(uri string, redirected bool) bool
	// FrameNavigation decides every navigation of an iframe. false cancels it.
	FrameNavigation func(uri string) bool
	// NavigationCompleted reports the end of a main-document load.
	NavigationCompleted func(success bool)
	// BrowserProcessExited reports that the browser processes of this environment are gone.
	BrowserProcessExited func()
}

// Browser is one WebView2 instance with a throwaway profile.
type Browser struct {
	env        *ICoreWebView2Environment
	controller *ICoreWebView2Controller
	wv         *ICoreWebView2
	profile2   uintptr
	closed     bool
}

type envWaiter struct {
	done atomic.Bool
	res  uintptr
	env  *ICoreWebView2Environment
}

func (w *envWaiter) QueryInterface(_, _ uintptr) uintptr { return 0 }
func (w *envWaiter) AddRef() uintptr                     { return 1 }
func (w *envWaiter) Release() uintptr                    { return 1 }
func (w *envWaiter) EnvironmentCompleted(res uintptr, env *ICoreWebView2Environment) uintptr {
	if env != nil {
		env.vtbl.AddRef.Call(uintptr(unsafe.Pointer(env)))
	}
	w.res, w.env = res, env
	w.done.Store(true)
	return 0
}

// pump dispatches window messages until done() is true. It fails on WM_QUIT or after the timeout.
func pump(hwnd uintptr, done func() bool, timeout time.Duration) error {
	wake := time.AfterFunc(timeout, func() { procPostMessageW.Call(hwnd, 0, 0, 0) })
	defer wake.Stop()
	deadline := time.Now().Add(timeout)
	var msg w32.Msg
	for !done() {
		if time.Now().After(deadline) {
			return errors.New("webview2 timed out")
		}
		r, _, _ := w32.User32GetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if r == 0 || int32(r) < 0 {
			return errors.New("window closed")
		}
		w32.User32TranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		w32.User32DispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
	return nil
}

// Open creates the environment (profile in dataDir, no additional browser arguments, no OS single sign-on) and the
// controller inside hwnd, applies the hardened settings and registers the handlers. The caller shows the window after
// it returns. COM must already be initialised on this thread.
func Open(hwnd uintptr, dataDir string, ev Events) (*Browser, error) {
	const step = 30 * time.Second
	w := &envWaiter{}
	if err := createCoreWebView2EnvironmentWithOptions("", dataDir, newICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler(w), ""); err != nil {
		return nil, ErrRuntimeMissing
	}
	if err := pump(hwnd, w.done.Load, step); err != nil {
		return nil, err
	}
	if int32(w.res) < 0 || w.env == nil {
		return nil, fmt.Errorf("environment: %w", windows.Errno(w.res))
	}
	b := &Browser{env: w.env}

	// Environment5.BrowserProcessExited
	env := uintptr(unsafe.Pointer(b.env))
	env5, err := queryInterface(env, iidEnv5)
	if err != nil {
		return nil, err
	}
	defer release(env5)
	if err := addEvent(env5, slotEnv5AddBrowserProcessExited, newHandler(func(_, _ uintptr) uintptr {
		if ev.BrowserProcessExited != nil {
			ev.BrowserProcessExited()
		}
		return 0
	})); err != nil {
		return nil, ErrRuntimeMissing
	}

	// Controller
	var created atomic.Bool
	var ctlRes, ctlPtr uintptr
	h := newHandler(func(res, ctl uintptr) uintptr {
		if ctl != 0 {
			slot(ctl, 1).Call(ctl) // AddRef
		}
		ctlRes, ctlPtr = res, ctl
		created.Store(true)
		return 0
	})
	if hr, _, _ := b.env.vtbl.CreateCoreWebView2Controller.Call(env, hwnd, h); int32(hr) < 0 {
		return nil, fmt.Errorf("controller: %w", windows.Errno(hr))
	}
	if err := pump(hwnd, created.Load, step); err != nil {
		return nil, err
	}
	if int32(ctlRes) < 0 || ctlPtr == 0 {
		return nil, fmt.Errorf("controller: %w", windows.Errno(ctlRes))
	}
	b.controller = (*ICoreWebView2Controller)(unsafe.Pointer(ctlPtr))
	if b.wv, err = b.controller.GetCoreWebView2(); err != nil || b.wv == nil {
		return nil, ErrRuntimeMissing
	}
	b.wv.AddRef()
	if err := b.harden(ev); err != nil {
		return nil, err
	}
	return b, nil
}

func (b *Browser) harden(ev Events) error {
	wv := uintptr(unsafe.Pointer(b.wv))

	// Settings (ADR 80, A1 and point 5). Settings3 and Settings4 are part of the closed list.
	s, err := b.wv.GetSettings()
	if err != nil || s == nil {
		return ErrRuntimeMissing
	}
	s3, s4 := s.GetICoreWebView2Settings3(), s.GetICoreWebView2Settings4()
	if s3 == nil || s4 == nil {
		return ErrRuntimeMissing
	}
	for _, e := range []error{
		s.PutAreDevToolsEnabled(false),
		s.PutAreDefaultContextMenusEnabled(false),
		s.PutIsWebMessageEnabled(false),
		s.PutAreHostObjectsAllowed(false),
		s.PutIsStatusBarEnabled(false),
		s3.PutAreBrowserAcceleratorKeysEnabled(false),
		s4.PutIsPasswordAutosaveEnabled(false),
		s4.PutIsGeneralAutofillEnabled(false),
	} {
		if e != nil {
			return fmt.Errorf("settings: %w", e)
		}
	}

	// Profile2 for ClearBrowsingDataAll.
	wv13, err := queryInterface(wv, iidWebView13)
	if err != nil {
		return err
	}
	defer release(wv13)
	var profile uintptr
	if hr, _, _ := slot(wv13, slotWV13GetProfile).Call(wv13, uintptr(unsafe.Pointer(&profile))); int32(hr) < 0 || profile == 0 {
		return ErrRuntimeMissing
	}
	defer release(profile)
	if b.profile2, err = queryInterface(profile, iidProfile2); err != nil {
		return err
	}

	wv4, err := queryInterface(wv, iidWebView4)
	if err != nil {
		return err
	}
	defer release(wv4)
	wv5, err := queryInterface(wv, iidWebView5)
	if err != nil {
		return err
	}
	defer release(wv5)
	wv18, err := queryInterface(wv, iidWebView18)
	if err != nil {
		return err
	}
	defer release(wv18)

	navStarting := func(decide func(uri string, redirected bool) bool) uintptr {
		return newHandler(func(_, args uintptr) uintptr {
			if args == 0 {
				return eFail
			}
			uri := getString(args, slotNavStartGetUri)
			var redirected int32
			slot(args, slotNavStartGetRedirect).Call(args, uintptr(unsafe.Pointer(&redirected)))
			if decide == nil || !decide(uri, redirected != 0) {
				putBool(args, slotNavStartPutCancel, true)
			}
			return 0
		})
	}
	firstErr := func(l ...error) error {
		for _, e := range l {
			if e != nil {
				return e
			}
		}
		return nil
	}
	v := b.wv.vtbl
	var frame func(string, bool) bool
	if ev.FrameNavigation != nil {
		frame = func(uri string, _ bool) bool { return ev.FrameNavigation(uri) }
	}
	err = firstErr(
		addEvent(wv, slotOf(unsafe.Pointer(v), &v.AddNavigationStarting), navStarting(ev.MainNavigation)),
		addEvent(wv, slotOf(unsafe.Pointer(v), &v.AddFrameNavigationStarting), navStarting(frame)),
		addEvent(wv, slotOf(unsafe.Pointer(v), &v.AddNavigationCompleted), newHandler(func(_, args uintptr) uintptr {
			var ok int32
			if args != 0 {
				slot(args, slotNavDoneIsSuccess).Call(args, uintptr(unsafe.Pointer(&ok)))
			}
			if ev.NavigationCompleted != nil {
				ev.NavigationCompleted(ok != 0)
			}
			return 0
		})),
		addEvent(wv, slotOf(unsafe.Pointer(v), &v.AddNewWindowRequested), denyHandler(slotNewWindowPutHandled, 1)),
		addEvent(wv, slotOf(unsafe.Pointer(v), &v.AddPermissionRequested), denyHandler(slotPermissionPutState, permissionStateDeny)),
		addEvent(wv4, slotWV4AddDownloadStarting, denyHandler(slotDownloadPutCancel, 1)),
		addEvent(wv5, slotWV5AddClientCertificateRequested, denyHandler(slotClientCertPutCancel, 1)),
		addEvent(wv18, slotWV18AddLaunchingExternalUri, denyHandler(slotExtUriPutCancel, 1)),
	)
	// ServerCertificateErrorDetected is deliberately not subscribed: WebView2 then blocks invalid certificates.
	if err != nil {
		return fmt.Errorf("events: %w", err)
	}
	return nil
}

// slotOf is the vtable slot of a named method, so the numbers for ICoreWebView2 come from iCoreWebView2Vtbl
// (hand-checked upstream) and not from a second table here.
func slotOf(base unsafe.Pointer, field *ComProc) int {
	return int((uintptr(unsafe.Pointer(field)) - uintptr(base)) / unsafe.Sizeof(ComProc(0)))
}

// SetBounds sizes the web view to the client rectangle of the window.
func (b *Browser) SetBounds(r w32.Rect) error { return b.controller.PutBounds(r) }

// SetVisible shows or hides the web view.
func (b *Browser) SetVisible(v bool) error { return b.controller.PutIsVisible(v) }

// Navigate starts a navigation of the main document.
func (b *Browser) Navigate(url string) error { return b.wv.Navigate(url) }

// Source is the current URL of the main document.
func (b *Browser) Source() (string, error) { return b.wv.GetSource() }

// maxScriptResultUnits is the cap of the raw ExecuteScript result (64 KiB of UTF-16 code units).
const maxScriptResultUnits = 64 * 1024

// ExecuteScript runs js in the main document. done receives the HRESULT, the JSON text of the result and tooBig=true
// (with an empty text) if the raw result exceeded 64 KiB.
func (b *Browser) ExecuteScript(js string, done func(hr uintptr, resultJSON string, tooBig bool)) error {
	p, err := windows.UTF16PtrFromString(js)
	if err != nil {
		return err
	}
	h := newHandler(func(hr, result uintptr) uintptr {
		text, tooBig := readBounded(result, maxScriptResultUnits)
		done(hr, text, tooBig)
		return 0
	})
	wv := uintptr(unsafe.Pointer(b.wv))
	hr, _, _ := b.wv.vtbl.ExecuteScript.Call(wv, uintptr(unsafe.Pointer(p)), h)
	return hrErr(hr)
}

// readBounded reads a NUL-terminated UTF-16 string of at most max units.
func readBounded(ptr uintptr, max int) (string, bool) {
	if ptr == 0 {
		return "", false
	}
	n := 0
	for n <= max && *(*uint16)(unsafe.Add(unsafe.Pointer(ptr), n*2)) != 0 {
		n++
	}
	if n > max {
		return "", true
	}
	return windows.UTF16ToString(unsafe.Slice((*uint16)(unsafe.Pointer(ptr)), n)), false
}

// ClearBrowsingData removes every kind of browsing data of the profile; done runs when it has finished.
func (b *Browser) ClearBrowsingData(done func()) error {
	h := newHandler(func(_, _ uintptr) uintptr {
		done()
		return 0
	})
	hr, _, _ := slot(b.profile2, slotProfile2ClearBrowsingDataAll).Call(b.profile2, h)
	return hrErr(hr)
}

// Close closes the controller; the browser processes then exit and BrowserProcessExited fires. Idempotent.
func (b *Browser) Close() {
	if b == nil || b.closed || b.controller == nil {
		return
	}
	b.closed = true
	b.controller.vtbl.Close.Call(uintptr(unsafe.Pointer(b.controller)))
}

var procPostMessageW = windows.NewLazySystemDLL("user32.dll").NewProc("PostMessageW")

func boolToInt(v bool) int32 {
	if v {
		return 1
	}
	return 0
}

//go:build windows

package edge

import (
	"errors"
	"testing"
	"unsafe"
)

// fakeObject is a COM object whose vtable slots are Go callbacks; no window, no browser.
type fakeObject struct {
	vtbl *[slotsMax]ComProc
	puts map[int]uintptr
	qi   uintptr
}

// Callbacks are a scarce resource (Go allows about 2000): one per slot, created once and shared by every fake.
var (
	fakes     = map[uintptr]*fakeObject{}
	slotProcs = map[int]ComProc{}
	qiProc    = NewComProc(func(this, iid, out uintptr) uintptr { return fakes[this].qi })
)

func slotProc(i int) ComProc {
	if p, ok := slotProcs[i]; ok {
		return p
	}
	p := NewComProc(func(this, v uintptr) uintptr { fakes[this].puts[i] = v; return 0 })
	slotProcs[i] = p
	return p
}

func newFake(qiResult uintptr) (*fakeObject, uintptr) {
	f := &fakeObject{vtbl: new([slotsMax]ComProc), puts: map[int]uintptr{}, qi: qiResult}
	f.vtbl[0] = qiProc
	for _, i := range []int{slotNewWindowPutHandled, slotDownloadPutCancel, slotPermissionPutState, slotExtUriPutCancel, slotClientCertPutCancel} {
		f.vtbl[i] = slotProc(i)
	}
	p := uintptr(unsafe.Pointer(f))
	fakes[p] = f
	return f, p
}

func invoke(h uintptr, a, b uintptr) uintptr { return (*handler)(unsafe.Pointer(h)).fn(a, b) }

func TestDenyHandlersAlwaysSetTheirValue(t *testing.T) {
	cases := map[string]struct {
		slot  int
		value uintptr
	}{
		"new window handled":     {slotNewWindowPutHandled, 1},
		"download cancel":        {slotDownloadPutCancel, 1},
		"permission deny":        {slotPermissionPutState, permissionStateDeny},
		"external scheme cancel": {slotExtUriPutCancel, 1},
		"client cert cancel":     {slotClientCertPutCancel, 1},
	}
	for name, c := range cases {
		for i := 0; i < 3; i++ { // always, not just the first time
			f, args := newFake(0)
			if invoke(denyHandler(c.slot, c.value), 0, args) != 0 || f.puts[c.slot] != c.value {
				t.Fatalf("%s: slot %d got %v", name, c.slot, f.puts)
			}
		}
	}
}

func TestFailedQueryInterfaceMeansRuntimeMissing(t *testing.T) {
	_, bad := newFake(0x80004002) // E_NOINTERFACE
	if _, err := queryInterface(bad, iidWebView18); !errors.Is(err, ErrRuntimeMissing) {
		t.Fatalf("err = %v", err)
	}
}

func TestReadBoundedCapsTheResult(t *testing.T) {
	small := append([]uint16{'o', 'k'}, 0)
	if s, big := readBounded(uintptr(unsafe.Pointer(&small[0])), 10); s != "ok" || big {
		t.Errorf("small: %q %v", s, big)
	}
	long := make([]uint16, 20)
	for i := range long[:19] {
		long[i] = 'a'
	}
	if _, big := readBounded(uintptr(unsafe.Pointer(&long[0])), 10); !big {
		t.Error("over the cap must be reported")
	}
}

func TestSlotsMatchTheHandWrittenVtable(t *testing.T) {
	var v iCoreWebView2Vtbl
	base := unsafe.Pointer(&v)
	if slotOf(base, &v.Navigate) != 5 || slotOf(base, &v.AddNavigationStarting) != 7 {
		t.Error("ICoreWebView2 slots moved")
	}
}

// The six absolute positions below were read from WebView2.h of Microsoft.Web.WebView2 1.0.4314.35 (the C vtable of
// each interface, counted from QueryInterface = 0). A wrong slot would call another method of the browser.
func TestDerivedInterfaceSlotsMatchSDK_1_0_4314_35(t *testing.T) {
	for name, c := range map[string][2]int{
		"Environment5.add_BrowserProcessExited":      {slotEnv5AddBrowserProcessExited, 12},
		"WebView2_13.get_Profile":                    {slotWV13GetProfile, 105},
		"WebView2_4.add_DownloadStarting":            {slotWV4AddDownloadStarting, 75},
		"WebView2_5.add_ClientCertificateRequested":  {slotWV5AddClientCertificateRequested, 77},
		"WebView2_18.add_LaunchingExternalUriScheme": {slotWV18AddLaunchingExternalUri, 117},
		"Profile2.ClearBrowsingDataAll":              {slotProfile2ClearBrowsingDataAll, 12},
	} {
		if c[0] != c[1] {
			t.Errorf("%s = %d, want %d", name, c[0], c[1])
		}
	}
	if slotsMax <= 117 {
		t.Error("slotsMax must cover the highest slot")
	}
}

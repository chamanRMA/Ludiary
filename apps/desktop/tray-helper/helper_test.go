package main

import (
	"bytes"
	"encoding/json"
	"runtime"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func TestRegistryAccessIsReadOnly(t *testing.T) {
	// SET_VALUE, CREATE_SUB_KEY, NOTIFY, CREATE_LINK plus DELETE, WRITE_DAC and WRITE_OWNER.
	forbidden := uint32(registry.SET_VALUE | registry.CREATE_SUB_KEY | registry.NOTIFY | registry.CREATE_LINK | 0x10000 | 0x40000 | 0x80000)
	for _, view := range []string{"", "32", "64"} {
		mask, ok := registryAccess(view)
		if !ok {
			t.Fatalf("view %q rejected", view)
		}
		if mask&forbidden != 0 {
			t.Errorf("view %q: mask %#x contains write bits", view, mask)
		}
		if mask&^uint32(registry.WOW64_32KEY|registry.WOW64_64KEY) != registry.QUERY_VALUE|registry.ENUMERATE_SUB_KEYS {
			t.Errorf("view %q: mask %#x is not exactly QUERY_VALUE|ENUMERATE_SUB_KEYS", view, mask)
		}
		if mask&registry.QUERY_VALUE == 0 {
			t.Errorf("view %q: no QUERY_VALUE", view)
		}
	}
	m32, _ := registryAccess("32")
	m64, _ := registryAccess("64")
	if m32&registry.WOW64_32KEY == 0 || m64&registry.WOW64_64KEY == 0 {
		t.Error("view flags missing")
	}
	if _, ok := registryAccess("16"); ok {
		t.Error("view 16 accepted")
	}
}

func TestParseRegistryRequest(t *testing.T) {
	req, code := parseRegistryRequest([]byte(`{"queries":[{"hive":"HKCU","key":"Software\\X","value":"V","view":"32","kind":"value"}]}`))
	if code != "" || len(req.Queries) != 1 || req.Queries[0].View != "32" {
		t.Fatalf("good request: %v %q", req, code)
	}
	for _, bad := range []string{``, `nope`, `{}`, `{"queries":[]} x`, `{"queries":[],"extra":1}`} {
		if _, code := parseRegistryRequest([]byte(bad)); bad != `{"queries":[]} x` && code != "bad-request" {
			t.Errorf("%q: code %q", bad, code)
		}
	}
	if _, code := parseRegistryRequest([]byte(`{"queries":[]} {"queries":[]}`)); code != "bad-request" {
		t.Errorf("trailing object accepted: %q", code)
	}
	many := `{"queries":[` + strings.Repeat(`{"hive":"HKCU","key":"a","value":"b"},`, 32) + `{"hive":"HKCU","key":"a","value":"b"}]}`
	if _, code := parseRegistryRequest([]byte(many)); code != "too-many-queries" {
		t.Errorf("many: %q", code)
	}
	if _, code := parseRegistryRequest(bytes.Repeat([]byte(" "), maxRegistryRequestBytes+1)); code != "too-large" {
		t.Errorf("large: %q", code)
	}
}

func TestValidateRegistryQuery(t *testing.T) {
	cases := map[string]registryQuery{
		"invalid-hive":  {Hive: "HKCR", Key: "a", Value: "b"},
		"invalid-key":   {Hive: "HKCU", Key: `\a`, Value: "b"},
		"invalid-value": {Hive: "HKCU", Key: "a", Value: "b\x00c"},
		"invalid-kind":  {Hive: "HKCU", Key: "a", Value: "b", Kind: "write"},
		"invalid-view":  {Hive: "HKCU", Key: "a", Value: "b", View: "128"},
	}
	for want, q := range cases {
		if _, _, got := validateRegistryQuery(q); got != want {
			t.Errorf("want %s got %q", want, got)
		}
	}
	if _, _, got := validateRegistryQuery(registryQuery{Hive: "HKLM", Key: `SOFTWARE\Valve\Steam`, Value: "InstallPath", View: "32"}); got != "" {
		t.Errorf("valid query rejected: %q", got)
	}
}

// ADR 79: names runs parallel to values; a subkey without the value appears in neither.
func TestSubkeysReturnNamesParallelToValues(t *testing.T) {
	base := `Software\LudiaryTest\Subkeys`
	root, _, err := registry.CreateKey(registry.CURRENT_USER, base, registry.ALL_ACCESS)
	if err != nil {
		t.Skip("cannot write HKCU")
	}
	ids := []string{"900001", "900002", "900003"}
	defer func() {
		for _, n := range ids {
			_ = registry.DeleteKey(root, n)
		}
		root.Close()
		_ = registry.DeleteKey(registry.CURRENT_USER, base)
		_ = registry.DeleteKey(registry.CURRENT_USER, `Software\LudiaryTest`) // the parent CreateKey also made
	}()
	for _, n := range ids {
		k, _, err := registry.CreateKey(root, n, registry.ALL_ACCESS)
		if err != nil {
			t.Fatal(err)
		}
		if n != "900002" { // 900002 has no InstallDir
			_ = k.SetStringValue("InstallDir", "D:/G"+n+"/")
		}
		k.Close()
	}
	res := runRegistryQuery(registryQuery{Hive: "HKCU", Key: base, Value: "InstallDir", Kind: "subkeys"})
	if !res.OK || len(res.Values) != 2 || len(res.Names) != 2 {
		t.Fatalf("unexpected: %+v", res)
	}
	for i, n := range res.Names {
		if res.Values[i] != "D:/G"+n+"/" {
			t.Errorf("name %q not parallel to value %q", n, res.Values[i])
		}
	}
}

func TestSubkeyOutcome(t *testing.T) {
	cases := map[string]bool{"not-found": true, "unsupported-type": true, "access-denied": false, "failed": false}
	errs := map[string]error{
		"not-found":        registry.ErrNotExist,
		"unsupported-type": registry.ErrUnexpectedType,
		"access-denied":    windows.ERROR_ACCESS_DENIED,
		"failed":           windows.ERROR_INVALID_DATA,
	}
	for code, wantSkip := range cases {
		if skip, got := subkeyOutcome(errs[code]); skip != wantSkip || got != code {
			t.Errorf("%s: skip=%v code=%q", code, skip, got)
		}
	}
}

func TestHandleRegistryEndToEnd(t *testing.T) {
	in := `{"queries":[{"hive":"HKCU","key":"Software\\Ludiary\\DoesNotExist","value":"x"},{"hive":"HKCR","key":"a","value":"b"}]}`
	var out bytes.Buffer
	if code := handleRegistry(strings.NewReader(in), &out); code != 0 {
		t.Fatalf("exit %d", code)
	}
	var resp registryResponse
	if err := json.Unmarshal(out.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Results) != 2 || resp.Results[0].Error != "not-found" || resp.Results[1].Error != "invalid-hive" {
		t.Errorf("unexpected: %s", out.String())
	}
	out.Reset()
	if code := handleRegistry(strings.NewReader("garbage"), &out); code != 2 || !strings.Contains(out.String(), "bad-request") {
		t.Errorf("garbage: %d %s", code, out.String())
	}
}

func TestParsePickRequest(t *testing.T) {
	if r, ok := parsePickRequest([]byte(`{"title":"Elegir carpeta"}`)); !ok || r.Title != "Elegir carpeta" {
		t.Errorf("good: %v %v", r, ok)
	}
	if _, ok := parsePickRequest([]byte(`{"title":`)); ok {
		t.Error("bad json accepted")
	}
	if _, ok := parsePickRequest([]byte(`{"title":"` + strings.Repeat("a", maxTitleLen+1) + `"}`)); ok {
		t.Error("long title accepted")
	}
}

// Creates and configures the COM dialog without showing it.
func TestFolderDialogCreates(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED); err != nil {
		t.Skip("COM unavailable")
	}
	defer windows.CoUninitialize()
	dlg, err := newFolderDialog("Test")
	if err != nil {
		t.Fatal(err)
	}
	comRelease(dlg)
}

func TestKnownFolder(t *testing.T) {
	var out bytes.Buffer
	if code := handleKnownFolder([]string{"documents"}, &out); code != 0 {
		t.Fatalf("documents: exit %d, %s", code, out.String())
	}
	var ok struct{ Path string }
	if err := json.Unmarshal(out.Bytes(), &ok); err != nil || ok.Path == "" {
		t.Fatalf("bad output %q", out.String())
	}
	for _, args := range [][]string{nil, {"desktop"}, {"documents", "x"}, {""}} {
		out.Reset()
		if code := handleKnownFolder(args, &out); code != 2 || strings.TrimSpace(out.String()) != `{"error":"bad-request"}` {
			t.Errorf("args %q: exit %d, %q", args, code, out.String())
		}
	}
}

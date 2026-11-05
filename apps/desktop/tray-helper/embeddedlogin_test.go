package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var testHosts = []string{"connect.ubisoft.com", "account.ubisoft.com"}

// goodRequest returns a valid request whose dataDir exists under a temporary "tmp" root.
func goodRequest(t *testing.T) (map[string]any, string) {
	t.Helper()
	root := filepath.Join(t.TempDir(), "tmp")
	dir := filepath.Join(root, "webview-abc123")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return map[string]any{
		"title":        "Ubisoft login",
		"startUrl":     "https://connect.ubisoft.com/login?x=1",
		"doneUrl":      "https://connect.ubisoft.com/ready",
		"captureUrl":   "https://connect.ubisoft.com/change_domain/",
		"allowedHosts": testHosts,
		"capture": []any{map[string]any{
			"name": "rememberMeTicket", "storageKeys": []string{"PRODrememberMe", "PRODloginData"},
			"jsonField": "rememberMeTicket", "maxLength": 8192,
		}},
		"dataDir": dir,
	}, root
}

func parseMap(t *testing.T, m map[string]any, root string) error {
	t.Helper()
	b, _ := json.Marshal(m)
	_, err := parseLoginRequest(b, root)
	return err
}

func TestRequestAcceptsAValidOne(t *testing.T) {
	m, root := goodRequest(t)
	if err := parseMap(t, m, root); err != nil {
		t.Fatalf("valid request rejected: %v", err)
	}
}

func TestRequestRejections(t *testing.T) {
	cases := map[string]func(m map[string]any){
		"http start":              func(m map[string]any) { m["startUrl"] = "http://connect.ubisoft.com/login" },
		"host not allowed":        func(m map[string]any) { m["startUrl"] = "https://evil.example/login" },
		"user in url":             func(m map[string]any) { m["startUrl"] = "https://u:p@connect.ubisoft.com/" },
		"fragment":                func(m map[string]any) { m["doneUrl"] = "https://connect.ubisoft.com/ready#x" },
		"empty fragment":          func(m map[string]any) { m["doneUrl"] = "https://connect.ubisoft.com/ready#" },
		"query in doneUrl":        func(m map[string]any) { m["doneUrl"] = "https://connect.ubisoft.com/ready?x=1" },
		"odd port":                func(m map[string]any) { m["captureUrl"] = "https://connect.ubisoft.com:8443/x" },
		"title with control":      func(m map[string]any) { m["title"] = "a\u0007b" },
		"title with newline":      func(m map[string]any) { m["title"] = "a\nb" },
		"title of 201":            func(m map[string]any) { m["title"] = strings.Repeat("a", 201) },
		"no hosts":                func(m map[string]any) { m["allowedHosts"] = []string{} },
		"five hosts":              func(m map[string]any) { m["allowedHosts"] = []string{"a.com", "b.com", "c.com", "d.com", "e.com"} },
		"host with path":          func(m map[string]any) { m["allowedHosts"] = []string{"connect.ubisoft.com/x"} },
		"no capture":              func(m map[string]any) { m["capture"] = []any{} },
		"bad name":                func(m map[string]any) { setCap(m, "name", "1bad") },
		"bad key":                 func(m map[string]any) { setCap(m, "storageKeys", []string{"a b"}) },
		"four keys":               func(m map[string]any) { setCap(m, "storageKeys", []string{"a", "b", "c", "d"}) },
		"empty storageKeys":       func(m map[string]any) { setCap(m, "storageKeys", []string{}) },
		"missing storageKeys":     func(m map[string]any) { delete(m["capture"].([]any)[0].(map[string]any), "storageKeys") },
		"old source, no keys":     func(m map[string]any) { setCap(m, "source", "document-json"); setCap(m, "storageKeys", []string{}) },
		"fragment in captureUrl":  func(m map[string]any) { m["captureUrl"] = "https://connect.ubisoft.com/change_domain/#x" },
		"captureUrl ending in ?":  func(m map[string]any) { m["captureUrl"] = "https://connect.ubisoft.com/change_domain/?" },
		"bad jsonField":           func(m map[string]any) { setCap(m, "jsonField", "a;b") },
		"maxLength 0":             func(m map[string]any) { setCap(m, "maxLength", 0) },
		"maxLength 8193":          func(m map[string]any) { setCap(m, "maxLength", 8193) },
		"relative dataDir":        func(m map[string]any) { m["dataDir"] = "webview-abc" },
		"missing dataDir":         func(m map[string]any) { m["dataDir"] = "" },
		"unknown dataDir problem": func(m map[string]any) { m["dataDir"] = m["dataDir"].(string) + "-nope" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			m, root := goodRequest(t)
			mutate(m)
			if parseMap(t, m, root) == nil {
				t.Fatal("accepted")
			}
		})
	}
}

func setCap(m map[string]any, k string, v any) { m["capture"].([]any)[0].(map[string]any)[k] = v }

func TestRequestDataDirMustBeUnderTmpWithPrefix(t *testing.T) {
	m, root := goodRequest(t)
	outside := filepath.Join(t.TempDir(), "webview-x")
	os.MkdirAll(outside, 0o700)
	m["dataDir"] = outside
	if parseMap(t, m, root) == nil {
		t.Error("dataDir outside tmp accepted")
	}
	noPrefix := filepath.Join(root, "other")
	os.MkdirAll(noPrefix, 0o700)
	m["dataDir"] = noPrefix
	if parseMap(t, m, root) == nil {
		t.Error("dataDir without the webview- prefix accepted")
	}
	nested := filepath.Join(root, "webview-a", "webview-b")
	os.MkdirAll(nested, 0o700)
	m["dataDir"] = nested
	if parseMap(t, m, root) == nil {
		t.Error("dataDir nested deeper than tmp accepted")
	}
	traversal := filepath.Join(root, "webview-ok", "..", "..", "webview-x")
	m["dataDir"] = traversal
	if parseMap(t, m, root) == nil {
		t.Error("dataDir with .. accepted")
	}
}

func TestRequestLineLimit(t *testing.T) {
	read := func(n int) ([]byte, error) {
		return readRequestLine(bufio.NewReader(strings.NewReader(strings.Repeat("a", n) + "\n{}")))
	}
	if _, err := read(64 * 1024); err != nil {
		t.Errorf("64 KiB line rejected: %v", err)
	}
	if _, err := read(64*1024 + 1); err == nil {
		t.Error("64 KiB + 1 line accepted")
	}
	// It reads one line and nothing more, so stdin can stay open for the cancel signal.
	r := bufio.NewReader(strings.NewReader("one\ntwo\n"))
	line, _ := readRequestLine(r)
	rest, _ := r.ReadString('\n')
	if string(line) != "one" || rest != "two\n" {
		t.Errorf("line=%q rest=%q", line, rest)
	}
}

func TestRequestRejectsTrailingJSONAndGarbage(t *testing.T) {
	m, root := goodRequest(t)
	b, _ := json.Marshal(m)
	if _, err := parseLoginRequest(append(b, []byte(` {"x":1}`)...), root); err == nil {
		t.Error("two JSON values accepted")
	}
	if _, err := parseLoginRequest([]byte("not json"), root); err == nil {
		t.Error("garbage accepted")
	}
}

func TestScrubWebView2Env(t *testing.T) {
	t.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--remote-debugging-port=9222")
	t.Setenv("webview2_user_data_folder", `C:\x`)
	t.Setenv("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", `C:\y`)
	t.Setenv("WEBVIEW", "keep")
	scrubWebView2Env()
	for _, kv := range os.Environ() {
		if name, _, _ := strings.Cut(kv, "="); strings.HasPrefix(strings.ToUpper(name), "WEBVIEW2_") {
			t.Errorf("%s survived", name)
		}
	}
	if os.Getenv("WEBVIEW") != "keep" {
		t.Error("an unrelated variable was removed")
	}
}

func TestMainNavigationPolicy(t *testing.T) {
	for uri, want := range map[string]bool{
		"https://connect.ubisoft.com/login":                 true,
		"https://CONNECT.ubisoft.com/ready":                 true,
		"https://account.ubisoft.com/x?y=1":                 true,
		"https://evil.example/":                             false, // also what a redirect to another host does
		"http://connect.ubisoft.com/login":                  false, // also what a redirect to http does
		"https://connect.ubisoft.com.evil.example/":         false,
		"https://evil.example/https://connect.ubisoft.com/": false,
		"data:text/html,x":                                  false,
		"javascript:alert(1)":                               false,
		"file:///C:/x":                                      false,
		"about:blank":                                       false,
		"https://user@connect.ubisoft.com/":                 false,
	} {
		if got := allowMainNavigation(uri, testHosts); got != want {
			t.Errorf("%s: got %v want %v", uri, got, want)
		}
	}
}

func TestFrameNavigationPolicy(t *testing.T) {
	for uri, want := range map[string]bool{
		"https://captcha.example.net/frame": true,
		"about:blank":                       true,
		"about:srcdoc":                      true,
		"http://captcha.example.net/":       false,
		"data:text/html,x":                  false,
		"javascript:alert(1)":               false,
		"file:///C:/x":                      false,
		"ftp://x.example/":                  false,
		"about:config":                      false,
	} {
		if got := allowFrameNavigation(uri); got != want {
			t.Errorf("%s: got %v want %v", uri, got, want)
		}
	}
}

func TestBlockedHostsHaveNoPathOrQuery(t *testing.T) {
	var b blockedSet
	b.add("https://evil.example/path?token=secret#frag")
	b.add("http://evil.example/other")
	b.add("data:text/html,x")
	b.add("https://Other.example/")
	got, _ := json.Marshal(b.list())
	if string(got) != `["evil.example","data:","other.example"]` {
		t.Errorf("blocked = %s", got)
	}
	var many blockedSet
	for i := 0; i < 100; i++ {
		many.add("https://h" + strings.Repeat("a", i%5) + string(rune('a'+i%26)) + string(rune('a'+i/26)) + ".example/")
	}
	if len(many.list()) > maxBlockedHosts {
		t.Errorf("%d blocked hosts", len(many.list()))
	}
	if string((func() []byte { x, _ := json.Marshal((&blockedSet{}).list()); return x })()) != "[]" {
		t.Error("empty list must encode as []")
	}
}

const (
	ubiDone, ubiCapture = "https://connect.ubisoft.com/ready", "https://connect.ubisoft.com/login"
)

func TestUbisoftFlowStillCaptures(t *testing.T) {
	// The real flow (23-10-2026): /ready answers 404 with no redirect, the capture runs on /login, which loads.
	m := captureMachine{doneURL: ubiDone, captureURL: ubiCapture}
	m.onStarting(ubiDone, 7)
	if m.onCompleted(7, false, ubiDone) != actNavigateToCapture || m.state != stateDone {
		t.Fatal("a failed load of the armed navigation must still reach done")
	}
	m.onStarting(ubiCapture, 8)
	if m.onCompleted(8, false, ubiCapture) != actNone {
		t.Fatal("a failed load of the capture page must not be scripted")
	}
	if m.onCompleted(8, true, ubiCapture) != actCapture || !m.mayExecute(ubiCapture) {
		t.Fatal("capture on /login")
	}
}

func TestArmingIsBoundToItsNavigationId(t *testing.T) {
	m := captureMachine{doneURL: ubiDone, captureURL: ubiCapture}
	if m.onCompleted(1, true, ubiDone) != actNone {
		t.Fatal("without arming no load counts")
	}
	m.onStarting("https://connect.ubisoft.com/other", 4) // not doneUrl: does not arm
	if m.armed {
		t.Fatal("a navigation to another page armed")
	}
	m.onStarting(ubiDone, 5)
	if m.onCompleted(6, true, ubiDone) != actNone || m.state != stateStart {
		t.Fatal("a NavigationCompleted with another id must not arm done")
	}
	if m.onCompleted(5, false, "https://connect.ubisoft.com/x") != actNavigateToCapture || m.state != stateDone {
		t.Fatal("the same id, failed and at any URL, passes to done")
	}
	if m.onCompleted(5, true, ubiDone) != actNone {
		t.Fatal("the arming is consumed")
	}
}

func TestRedirectArms(t *testing.T) {
	m := captureMachine{doneURL: ubiDone, captureURL: ubiCapture}
	m.onStarting("https://connect.ubisoft.com/start", 3)
	m.onStarting(ubiDone, 3) // the redirect to doneUrl (IsRedirected) goes through the same road
	if m.onCompleted(3, true, "https://connect.ubisoft.com/") != actNavigateToCapture {
		t.Fatal("a redirect to doneUrl must arm; the load that follows, at another URL, leads to captureUrl")
	}
}

func TestSamePageCapturesAtDone(t *testing.T) {
	m := captureMachine{doneURL: ubiCapture, captureURL: ubiCapture}
	m.onStarting(ubiCapture, 1)
	if m.onCompleted(1, true, ubiCapture) != actCapture {
		t.Fatal("doneUrl equal to captureUrl must capture at once")
	}
}

func TestCaptureMachineNeverSkipsStates(t *testing.T) {
	const done, capture = "https://connect.ubisoft.com/ready", "https://connect.ubisoft.com/change_domain/"
	m := captureMachine{doneURL: done, captureURL: capture}
	m.onStarting(capture, 1)
	if m.onCompleted(1, true, capture) != actNone || m.mayExecute(capture) {
		t.Fatal("captureUrl reached before doneUrl must do nothing")
	}
	if m.mayExecute(done) {
		t.Fatal("may not execute in the start state")
	}
	m.onStarting(done+"?next=1", 2)
	if m.onCompleted(2, true, done) != actNavigateToCapture || m.mayExecute(capture) {
		t.Fatal("doneUrl (query ignored) must navigate to captureUrl, not execute yet")
	}
	if m.onCompleted(3, true, capture) != actCapture || !m.mayExecute(capture) {
		t.Fatal("captureUrl loaded after doneUrl must capture")
	}
	if m.mayExecute("https://connect.ubisoft.com/other") || m.mayExecute("https://evil.example/change_domain/") {
		t.Fatal("Source outside captureUrl must not execute")
	}
	m.leftCapture()
	if m.mayExecute(capture) {
		t.Fatal("after leaving captureUrl the script must wait for a new load")
	}
}

func TestBlockedHostsOfURLWithoutHostKeepOnlyTheScheme(t *testing.T) {
	var b blockedSet
	b.add("nucleus:rest#access_token=" + strings.Repeat("A", 64))
	b.add("data:text/html,secret")
	b.add("about:blank#x")
	b.add("javascript:alert(1)")
	b.add("file:///C:/secret")
	got, _ := json.Marshal(b.list())
	if string(got) != `["nucleus:","data:","about:","javascript:","file:"]` || strings.Contains(string(got), "AAAA") {
		t.Errorf("blocked = %s", got)
	}
}

func TestQueryInCaptureUrlIsRejected(t *testing.T) {
	m, root := goodRequest(t)
	m["captureUrl"] = "https://connect.ubisoft.com/auth?client_id=x"
	if parseMap(t, m, root) == nil {
		t.Error("query in captureUrl accepted")
	}
}

func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }

func TestCaptureScriptIsAConstantWithAJSONLiteral(t *testing.T) {
	fields := []captureField{{Name: "ticket", StorageKeys: []string{"a", `b"});alert(1);//`, "c"}, JSONField: "t", MaxLength: 10}}
	s, err := buildCaptureScript(fields)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(s, captureScript) || !strings.HasSuffix(s, ")") {
		t.Error("script is not the constant plus a literal")
	}
	lit := strings.TrimSuffix(strings.TrimPrefix(s, captureScript), ")")
	var back []map[string]any
	if json.Unmarshal([]byte(lit), &back) != nil || back[0]["keys"].([]any)[1] != `b"});alert(1);//` {
		t.Errorf("literal does not round-trip: %s", lit)
	}
	for _, banned := range []string{"document.cookie", "addEventListener", "keydown", "querySelector", "password", "AddScriptToExecuteOnDocumentCreated"} {
		if strings.Contains(captureScript, banned) {
			t.Errorf("script mentions %q", banned)
		}
	}
}

func TestCaptureResultKeepsOnlyRequestedStrings(t *testing.T) {
	fields := []captureField{{Name: "ticket", MaxLength: 8}, {Name: "id", MaxLength: 5}}
	if v, ok := parseCaptureResult(`{"ticket":"abcdefgh","id":"x","extra":"no"}`, fields); !ok || v["ticket"] != "abcdefgh" || len(v) != 2 {
		t.Errorf("valid result: %v %v", v, ok)
	}
	for name, js := range map[string]string{
		"missing":       `{"ticket":"abc"}`,
		"null":          `{"ticket":null,"id":"x"}`,
		"number":        `{"ticket":5,"id":"x"}`,
		"object":        `{"ticket":{"a":"b"},"id":"x"}`,
		"too long":      `{"ticket":"abcdefghi","id":"x"}`,
		"control chars": `{"ticket":"ab\u0000c","id":"x"}`,
		"newline":       `{"ticket":"ab\nc","id":"x"}`,
		"empty":         `{"ticket":"","id":"x"}`,
		"not an object": `"abc"`,
		"garbage":       `{`,
	} {
		if _, ok := parseCaptureResult(js, fields); ok {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestResultEncodingAndExitCodes(t *testing.T) {
	var b blockedSet
	enc := func(r loginResult) (string, int) {
		var out bytes.Buffer
		code := writeResult(&out, r)
		return strings.TrimSpace(out.String()), code
	}
	if s, c := enc(resultWithBlocked(loginResult{Captured: map[string]string{"a": "b"}}, &b)); s != `{"captured":{"a":"b"},"blockedHosts":[]}` || c != 0 {
		t.Errorf("captured: %s %d", s, c)
	}
	if s, c := enc(resultWithBlocked(loginResult{Cancelled: true}, &b)); s != `{"cancelled":true,"blockedHosts":[]}` || c != 0 {
		t.Errorf("cancelled: %s %d", s, c)
	}
	for e, want := range map[string]int{"bad-request": 2, "runtime-missing": 1, "capture-missing": 1, "failed": 1} {
		if s, c := enc(loginResult{Error: e}); s != `{"error":"`+e+`"}` || c != want {
			t.Errorf("%s: %s %d", e, s, c)
		}
	}
}

func TestHandleEmbeddedLoginRejectsBadInputWithoutOpeningAnything(t *testing.T) {
	var out bytes.Buffer
	code := handleEmbeddedLogin(strings.NewReader("{\"title\":\"x\"}\n"), &out)
	if code != 2 || strings.TrimSpace(out.String()) != `{"error":"bad-request"}` {
		t.Errorf("code=%d out=%s", code, out.String())
	}
	out.Reset()
	if code := handleEmbeddedLogin(strings.NewReader(""), &out); code != 2 {
		t.Errorf("empty stdin: code=%d", code)
	}
}

func TestFilteredNavigationToDoneUrlDoesNotArm(t *testing.T) {
	r := &loginRun{req: loginRequest{AllowedHosts: []string{"other.example.com"}}, machine: captureMachine{doneURL: ubiDone, captureURL: ubiCapture}}
	if r.onMainNavigation(ubiDone, false, 1) || r.machine.armed {
		t.Fatal("a navigation cancelled by the filter armed the machine")
	}
}

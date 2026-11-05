package main

// `ludiary-tray.exe --embedded-login` (ADR 80): the logic that needs no window. The window and WebView2 are in
// embeddedwindow.go.
//
// Protocol: ONE JSON line on stdin (64 KiB at most); stdin then stays open and its closing means "cancel".
//
//	{"title","startUrl","doneUrl","captureUrl","allowedHosts":[...],
//	 "capture":[{"name","storageKeys":[...],"jsonField","maxLength"}],"dataDir"}
//
// One JSON line on stdout:
//
//	{"captured":{"<name>":"<value>"},"blockedHosts":[...]} | {"cancelled":true,"blockedHosts":[...]}
//	| {"error":"bad-request"|"runtime-missing"|"capture-missing"|"failed"}
//
// Exit code: 0 with captured and cancelled, 1 with an error, 2 with bad-request.
// The helper writes no log and no file: what it captures leaves only through stdout.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxRequestLine   = 64 * 1024
	maxTitleRunes    = 200
	maxAllowedHosts  = 4
	maxCaptureFields = 4
	maxStorageKeys   = 3
	maxBlockedHosts  = 32
	dataDirPrefix    = "webview-"
)

var (
	nameRe  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]{0,31}$`)
	keyRe   = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)
	hostRe  = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)
	schemeRe = regexp.MustCompile(`^[a-z][a-z0-9+.-]{0,15}$`)
	errBad  = errors.New("bad request")
	errNone = errors.New("no request")
)

type captureField struct {
	Name        string   `json:"name"`
	StorageKeys []string `json:"storageKeys"`
	JSONField   string   `json:"jsonField"`
	MaxLength   int      `json:"maxLength"`
}

type loginRequest struct {
	Title        string         `json:"title"`
	StartURL     string         `json:"startUrl"`
	DoneURL      string         `json:"doneUrl"`
	CaptureURL   string         `json:"captureUrl"`
	AllowedHosts []string       `json:"allowedHosts"`
	Capture      []captureField `json:"capture"`
	DataDir      string         `json:"dataDir"`
}

// readRequestLine reads the first line of stdin (64 KiB at most, without the newline). It does not read further.
func readRequestLine(r *bufio.Reader) ([]byte, error) {
	var line []byte
	for {
		chunk, err := r.ReadSlice('\n')
		line = append(line, chunk...)
		if len(bytes.TrimRight(line, "\r\n")) > maxRequestLine {
			return nil, errBad
		}
		if err == nil {
			return bytes.TrimRight(line, "\r\n"), nil
		}
		if err != bufio.ErrBufferFull {
			if len(line) == 0 {
				return nil, errNone
			}
			if err == io.EOF {
				return bytes.TrimRight(line, "\r\n"), nil
			}
			return nil, err
		}
	}
}

// parseLoginRequest is the second barrier (ADR 80, points 5 and 18 B4). tmpRoot is %LOCALAPPDATA%\Ludiary\tmp.
func parseLoginRequest(line []byte, tmpRoot string) (loginRequest, error) {
	var req loginRequest
	dec := json.NewDecoder(bytes.NewReader(line))
	if len(line) > maxRequestLine || dec.Decode(&req) != nil || dec.More() {
		return req, errBad
	}
	if utf8.RuneCountInString(req.Title) > maxTitleRunes || strings.IndexFunc(req.Title, unicode.IsControl) >= 0 {
		return req, errBad
	}
	if n := len(req.AllowedHosts); n < 1 || n > maxAllowedHosts {
		return req, errBad
	}
	for _, h := range req.AllowedHosts {
		if !hostRe.MatchString(h) {
			return req, errBad
		}
	}
	for _, raw := range []string{req.StartURL, req.DoneURL, req.CaptureURL} {
		if !allowedURL(raw, req.AllowedHosts) {
			return req, errBad
		}
	}
	if n := len(req.Capture); n < 1 || n > maxCaptureFields {
		return req, errBad
	}
	seen := map[string]bool{}
	for i := range req.Capture {
		f := &req.Capture[i]
		if !nameRe.MatchString(f.Name) || seen[f.Name] || !keyRe.MatchString(f.JSONField) ||
			f.MaxLength < 1 || f.MaxLength > 8192 || len(f.StorageKeys) < 1 || len(f.StorageKeys) > maxStorageKeys {
			return req, errBad
		}
		seen[f.Name] = true
		for _, k := range f.StorageKeys {
			if !keyRe.MatchString(k) {
				return req, errBad
			}
		}
	}
	// No query in doneUrl or captureUrl.
	if strings.Contains(req.DoneURL, "?") || strings.Contains(req.CaptureURL, "?") {
		return req, errBad
	}
	if !validDataDir(req.DataDir, tmpRoot) {
		return req, errBad
	}
	return req, nil
}

// allowedURL: https, no user, no fragment, host exactly in hosts, default port.
func allowedURL(raw string, hosts []string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || strings.Contains(raw, "#") {
		return false
	}
	if p := u.Port(); p != "" && p != "443" {
		return false
	}
	return hostIn(u.Hostname(), hosts)
}

func hostIn(host string, hosts []string) bool {
	host = strings.ToLower(host)
	for _, h := range hosts {
		if host == h {
			return true
		}
	}
	return false
}

// validDataDir: absolute, directly under tmpRoot, name starting with webview-, an existing real directory.
func validDataDir(dir, tmpRoot string) bool {
	if dir == "" || tmpRoot == "" || !filepath.IsAbs(dir) || strings.ContainsRune(dir, 0) {
		return false
	}
	clean := filepath.Clean(dir)
	if !strings.EqualFold(filepath.Dir(clean), filepath.Clean(tmpRoot)) || !strings.HasPrefix(strings.ToLower(filepath.Base(clean)), dataDirPrefix) {
		return false
	}
	info, err := os.Lstat(clean)
	return err == nil && info.IsDir() && info.Mode()&(os.ModeSymlink|os.ModeIrregular) == 0
}

// scrubWebView2Env removes every WEBVIEW2_* variable (ADR 80, A2): they can change the runtime, the profile folder
// or the browser arguments (a remote debugging port, for one). Returns the names it removed.
func scrubWebView2Env() []string {
	var removed []string
	for _, kv := range os.Environ() {
		name, _, _ := strings.Cut(kv, "=")
		if len(name) >= 9 && strings.EqualFold(name[:9], "WEBVIEW2_") {
			os.Unsetenv(name)
			removed = append(removed, name)
		}
	}
	return removed
}

// ---- navigation policy (ADR 80, A1) ----

// allowMainNavigation applies to the main document and also to redirects: https and an exact allowed host.
func allowMainNavigation(raw string, hosts []string) bool { return allowedURL(raw, hosts) }

// allowFrameNavigation applies to iframes: https, about:blank or about:srcdoc. Any host (a captcha comes from elsewhere).
func allowFrameNavigation(raw string) bool {
	if raw == "about:blank" || raw == "about:srcdoc" {
		return true
	}
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != ""
}

// blockedSet collects the hosts (never paths or queries) of cancelled navigations.
type blockedSet struct{ hosts []string }

func (b *blockedSet) add(raw string) {
	u, err := url.Parse(raw)
	if err != nil {
		return
	}
	h := strings.ToLower(u.Hostname())
	if u.Host == "" { // nucleus:, data:, about:, javascript:, file:...: only the scheme (ADR 82, M2), never the rest
		if !schemeRe.MatchString(u.Scheme) {
			return
		}
		h = u.Scheme + ":"
	} else if !hostRe.MatchString(h) {
		return
	}
	if len(b.hosts) >= maxBlockedHosts {
		return
	}
	for _, x := range b.hosts {
		if x == h {
			return
		}
	}
	b.hosts = append(b.hosts, h)
}

func (b *blockedSet) list() []string {
	if b.hosts == nil {
		return []string{}
	}
	return b.hosts
}

// ---- capture ----

// sameOriginPath compares scheme, host, port and path; the query does not count.
func sameOriginPath(a, b string) bool {
	ua, ea := url.Parse(a)
	ub, eb := url.Parse(b)
	if ea != nil || eb != nil {
		return false
	}
	return ua.Scheme == ub.Scheme && strings.EqualFold(ua.Host, ub.Host) && ua.Path == ub.Path
}

type captureState int

const (
	stateStart   captureState = iota // loading startUrl; waiting to arm on doneUrl
	stateDone                        // the armed navigation to doneUrl completed; waiting for captureUrl
	stateCapture                     // captureUrl loaded; the script may run
)

// captureMachine is start -> done -> capture; it never skips a state (ADR 80, M3; ADR 82, point 3 c and M1).
type captureMachine struct {
	state               captureState
	doneURL, captureURL string
	armed               bool
	armedID             uint64 // NavigationId of the NavigationStarting that armed
}

type machineAction int

const (
	actNone machineAction = iota
	actNavigateToCapture
	actCapture
	actFail // capture-missing
)

// onStarting is called for a main-document navigation (redirects included) the policy ALLOWED; a cancelled one never arms.
func (m *captureMachine) onStarting(uri string, id uint64) {
	if m.state == stateStart && sameOriginPath(uri, m.doneURL) {
		m.armed, m.armedID = true, id
	}
}

// onCompleted reports the end of a main-document load with the NavigationId it belongs to, at `source`.
func (m *captureMachine) onCompleted(id uint64, success bool, source string) machineAction {
	switch m.state {
	case stateStart:
		if !m.armed || id != m.armedID { // only the navigation that armed counts, with or without success
			return actNone
		}
		m.armed = false
		if sameOriginPath(m.doneURL, m.captureURL) { // same page: it must have loaded
			if !success {
				return actFail
			}
			m.state = stateCapture
			return actCapture
		}
		m.state = stateDone
		return actNavigateToCapture
	case stateDone:
		if success && sameOriginPath(source, m.captureURL) {
			m.state = stateCapture
			return actCapture
		}
	}
	return actNone
}

// mayExecute is the check made before EVERY ExecuteScript, retries included.
func (m *captureMachine) mayExecute(source string) bool {
	return m.state == stateCapture && sameOriginPath(source, m.captureURL)
}

// leftCapture: the page went elsewhere during the retries; wait for the next load of captureUrl.
func (m *captureMachine) leftCapture() { m.state = stateDone }

// captureScript is the fixed script (ADR 80, point 5). It reads only the named localStorage keys; no forms, cookies or
// keystrokes. The parameters enter as a JSON literal, never concatenated.
const captureScript = `(function(spec){
var out={};
spec.forEach(function(f){
  var v=null;
  f.keys.forEach(function(k){
    if(v!==null)return;
    try{
      var raw=window.localStorage.getItem(k);
      if(raw===null)return;
      var o=JSON.parse(raw);
      if(o&&typeof o==="object"&&Object.prototype.hasOwnProperty.call(o,f.field)&&typeof o[f.field]==="string")v=o[f.field];
    }catch(e){}
  });
  out[f.name]=v;
});
return out;
})(`

// buildCaptureScript appends the fields to the fixed script as a JSON literal.
func buildCaptureScript(fields []captureField) (string, error) {
	type spec struct {
		Name  string   `json:"name"`
		Keys  []string `json:"keys,omitempty"`
		Field string   `json:"field"`
	}
	specs := make([]spec, len(fields))
	for i, f := range fields {
		specs[i] = spec{f.Name, f.StorageKeys, f.JSONField}
	}
	lit, err := json.Marshal(specs)
	if err != nil {
		return "", err
	}
	return captureScript + string(lit) + ")", nil
}

// parseCaptureResult keeps only strings under the requested names, within maxLength and without control characters.
// ok is true only if every requested name is present.
func parseCaptureResult(resultJSON string, fields []captureField) (map[string]string, bool) {
	var raw map[string]any
	if json.Unmarshal([]byte(resultJSON), &raw) != nil {
		return nil, false
	}
	out := make(map[string]string, len(fields))
	for _, f := range fields {
		s, isStr := raw[f.Name].(string)
		if !isStr || s == "" || utf8.RuneCountInString(s) > f.MaxLength || strings.IndexFunc(s, unicode.IsControl) >= 0 {
			return nil, false
		}
		out[f.Name] = s
	}
	return out, true
}

// ---- entry point ----

type loginResult struct {
	Captured  map[string]string `json:"captured,omitempty"`
	Cancelled bool              `json:"cancelled,omitempty"`
	Blocked   *[]string         `json:"blockedHosts,omitempty"`
	Error     string            `json:"error,omitempty"`
}

func (r loginResult) exitCode() int {
	switch {
	case r.Error == "bad-request":
		return 2
	case r.Error != "":
		return 1
	}
	return 0
}

func writeResult(out io.Writer, r loginResult) int {
	_ = json.NewEncoder(out).Encode(r)
	return r.exitCode()
}

func resultWithBlocked(r loginResult, b *blockedSet) loginResult {
	l := b.list()
	r.Blocked = &l
	return r
}

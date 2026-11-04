//go:build windows

package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

// Fake programs: the test binary copied as Ludiary.exe or Ludiary-Setup-<v>.exe behaves as the file next to it says.
type behavior struct {
	Codes   map[string]int `json:"codes"` // first matching argument -> exit code; "" is the default
	SleepMs int            `json:"sleepMs"`
	SleepOn string         `json:"sleepOn"` // sleep only when this argument is present ("" = always)
	MutexMs int            `json:"mutexMs"` // the mutex appears this long after the start
	Mutex   string         `json:"mutex"`   // the fake installer holds this named mutex (Inno's SetupMutex) while it "installs"
}

func TestMain(m *testing.M) {
	name := filepath.Base(os.Args[0])
	if name == "Ludiary.exe" || strings.HasPrefix(name, "Ludiary-Setup-") {
		os.Exit(fakeMain())
	}
	os.Exit(m.Run())
}

func fakeMain() int {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	var b behavior
	if data, err := os.ReadFile(filepath.Join(dir, "behavior.json")); err == nil {
		_ = json.Unmarshal(data, &b)
	}
	logPath := filepath.Join(dir, "calls.log")
	if f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600); err == nil {
		fmt.Fprintln(f, strings.Join(os.Args[1:], " "))
		f.Close()
	}
	if b.Mutex != "" {
		time.Sleep(time.Duration(b.MutexMs) * time.Millisecond)
		holdMutex(b.Mutex)
	}
	if b.SleepOn == "" || slices.Contains(os.Args[1:], b.SleepOn) {
		time.Sleep(time.Duration(b.SleepMs) * time.Millisecond)
	}
	for _, a := range os.Args[1:] {
		if code, ok := b.Codes[a]; ok {
			return code
		}
	}
	return b.Codes[""]
}

func holdMutex(name string) func() {
	p, _ := syscall.UTF16PtrFromString(name)
	r, _, _ := kernel32.NewProc("CreateMutexW").Call(0, 0, uintptr(unsafe.Pointer(p)))
	return func() { syscall.CloseHandle(syscall.Handle(r)) }
}

type testEnv struct {
	t      *testing.T
	c      *config
	fatals []string
	priv   ed25519.PrivateKey
	inst   *behavior // behavior of the fake installer; nil: holds the mutex briefly
}

func newEnv(t *testing.T) *testEnv {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	e := &testEnv{t: t, priv: priv}
	e.c = &config{
		root:            t.TempDir(),
		dataDir:         t.TempDir(),
		keys:            map[string]string{"test-1": base64.StdEncoding.EncodeToString(pub)},
		target:          "windows-x64",
		mutexName:       fmt.Sprintf("Ludiary-Setup-test-%d", time.Now().UnixNano()),
		lockWait:        400 * time.Millisecond,
		trialTimeout:    1500 * time.Millisecond,
		stopTimeout:     5 * time.Second,
		rollbackTimeout: 5 * time.Second,
		poll:            10 * time.Millisecond,
		fatal:           func(k string) { e.fatals = append(e.fatals, k) },
	}
	return e
}

func (e *testEnv) copySelf(dst string, b behavior) {
	e.t.Helper()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		e.t.Fatal(err)
	}
	src, _ := os.Open(os.Args[0])
	defer src.Close()
	out, err := os.Create(dst)
	if err != nil {
		e.t.Fatal(err)
	}
	io.Copy(out, src)
	out.Close()
	data, _ := json.Marshal(b)
	os.WriteFile(filepath.Join(filepath.Dir(dst), "behavior.json"), data, 0o644)
}

// app installs a fake app-<v>, complete.
func (e *testEnv) app(v string, b behavior) {
	e.copySelf(e.c.appExe(v), b)
	os.WriteFile(filepath.Join(e.c.appDir(v), ".complete"), nil, 0o644)
}

func (e *testEnv) setVersions(v versions) {
	if err := e.c.writeVersions(&v); err != nil {
		e.t.Fatal(err)
	}
}

func (e *testEnv) versions() *versions {
	v := e.c.readVersions()
	if v == nil {
		e.t.Fatal("versions.json missing or invalid")
	}
	return v
}

func (e *testEnv) calls(v string) []string {
	data, _ := os.ReadFile(filepath.Join(e.c.appDir(v), "calls.log"))
	return strings.Fields(strings.ReplaceAll(strings.TrimSpace(string(data)), "\r\n", "\n"))
}

func (e *testEnv) callLines(v string) []string {
	data, _ := os.ReadFile(filepath.Join(e.c.appDir(v), "calls.log"))
	if len(data) == 0 {
		return nil
	}
	return strings.Split(strings.TrimSuffix(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n"), "\n")
}

func ptr(s string) *string { return &s }

func TestVectorsAreShared(t *testing.T) {
	data, err := os.ReadFile("../../../packages/runtime/test/fixtures/update-vectors/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Keys  map[string]string `json:"keys"`
		Cases []struct {
			Name        string   `json:"name"`
			Manifest    string   `json:"manifest"`
			Signature   string   `json:"signature"`
			Tag         *string  `json:"tag"`
			Current     string   `json:"current"`
			BadVersions []string `json:"badVersions"`
			Target      string   `json:"target"`
			NodeOnly    bool     `json:"nodeOnly"`
			Expect      string   `json:"expect"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Cases {
		if c.NodeOnly {
			continue
		}
		tag := ""
		if c.Tag != nil {
			tag = *c.Tag
		}
		_, _, reason := verifyManifest([]byte(c.Manifest), c.Signature, v.Keys, tag, c.Current, c.BadVersions, c.Target)
		got := reason
		if got == "" {
			got = "ok"
		}
		if got != c.Expect {
			t.Errorf("%s: got %s, want %s", c.Name, got, c.Expect)
		}
	}
	if _, _, r := verifyManifest([]byte(v.Cases[0].Manifest), v.Cases[0].Signature, map[string]string{}, "", "0.2.0", nil, "windows-x64"); r != "key" {
		t.Errorf("no embedded keys must fail closed, got %q", r)
	}
}

func TestMessagesCompleteInBothLanguages(t *testing.T) {
	var all map[string]map[string]string
	if err := json.Unmarshal(messagesJSON, &all); err != nil {
		t.Fatal(err)
	}
	for k := range all["es"] {
		if all["en"][k] == "" || all["es"][k] == "" {
			t.Errorf("message %q missing in a language", k)
		}
	}
	if len(all["es"]) != len(all["en"]) {
		t.Error("languages have different keys")
	}
}

func TestPassThroughKeepsArgumentsAndExitCode(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{Codes: map[string]int{"--stop": 7}})
	e.setVersions(versions{Active: "0.2.0"})
	if code := e.c.run([]string{"--stop"}); code != 7 {
		t.Fatalf("exit code %d", code)
	}
	if got := e.callLines("0.2.0"); len(got) != 1 || got[0] != "--stop" {
		t.Fatalf("calls: %v", got)
	}
}

func TestShortcutAddsFromLauncher(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.setVersions(versions{Active: "0.2.0"})
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if got := e.callLines("0.2.0"); len(got) != 1 || got[0] != "--from-launcher" {
		t.Fatalf("calls: %v", got)
	}
}

func TestMissingOrInvalidVersionsUsesNewestCompleteFolder(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.app("0.10.0", behavior{})
	os.MkdirAll(e.c.appDir("0.11.0"), 0o755) // no .complete
	e.copySelf(e.c.appExe("0.11.0"), behavior{})
	for _, content := range []string{"", "{", `{"active":"1.0.0/../x","trial":false,"trials":0}`, `{"active":"0.2.0","trials":7}`} {
		os.WriteFile(e.c.versionsPath(), []byte(content), 0o644)
		if code := e.c.run(nil); code != 0 {
			t.Fatal(code)
		}
		if len(e.callLines("0.10.0")) == 0 || len(e.callLines("0.11.0")) != 0 {
			t.Fatalf("content %q: wrong folder chosen", content)
		}
		os.Remove(filepath.Join(e.c.appDir("0.10.0"), "calls.log"))
	}
}

func TestNoFolderAtAllShowsDamaged(t *testing.T) {
	e := newEnv(t)
	if code := e.c.run(nil); code == 0 || len(e.fatals) != 1 || e.fatals[0] != "damaged" {
		t.Fatalf("code %d fatals %v", code, e.fatals)
	}
}

// ---- code 20

type staged struct{ dir, installer string }

// stageUpdate writes updates/<to> with a signed manifest for a fake installer that holds the SetupMutex briefly.
func (e *testEnv) stageUpdate(to string, tamper func(e *testEnv, manifest *[]byte, sig *string, installer string)) staged {
	dir := filepath.Join(e.c.updatesDir(), to)
	name := "Ludiary-Setup-" + to + ".exe"
	installer := filepath.Join(dir, name)
	ib := behavior{Mutex: e.c.mutexName, SleepMs: 150}
	if e.inst != nil {
		ib = *e.inst
	}
	e.copySelf(installer, ib)
	raw, _ := os.ReadFile(installer)
	sum := sha256.Sum256(raw)
	manifest, _ := json.Marshal(map[string]any{
		"schema": 1, "product": "ludiary", "channel": "stable", "version": to, "publishedAt": "2026-11-20T10:00:00Z",
		"files": map[string]any{"windows-x64": map[string]any{"name": name, "size": len(raw), "sha256": hex.EncodeToString(sum[:])}},
	})
	sig := "ludiary-sig-v1 test-1 " + base64.StdEncoding.EncodeToString(ed25519.Sign(e.priv, append([]byte(signatureContext), manifest...))) + "\n"
	if tamper != nil {
		tamper(e, &manifest, &sig, installer)
	}
	os.WriteFile(filepath.Join(dir, "ludiary-update.json"), manifest, 0o644)
	os.WriteFile(filepath.Join(dir, "ludiary-update.json.sig"), []byte(sig), 0o644)
	st, _ := json.Marshal(map[string]any{"state": "applying", "from": "0.2.0", "to": to})
	os.WriteFile(filepath.Join(e.c.updatesDir(), "state.json"), st, 0o644)
	return staged{dir: dir, installer: installer}
}

func (e *testEnv) setupWantsUpdate() {
	e.app("0.2.0", behavior{Codes: map[string]int{"--from-launcher": exitApplyUpdate}})
	e.setVersions(versions{Active: "0.2.0"})
}

func TestCode20RunsTheVerifiedInstallerWithFixedArguments(t *testing.T) {
	e := newEnv(t)
	e.setupWantsUpdate()
	s := e.stageUpdate("0.3.0", nil)
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	time.Sleep(600 * time.Millisecond) // the fake installer is detached
	data, _ := os.ReadFile(filepath.Join(s.dir, "calls.log"))
	args := strings.TrimSpace(string(data))
	for _, want := range []string{"/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/UPDATE=1", "/LOG=" + filepath.Join(s.dir, "install.log")} {
		if !strings.Contains(args, want) {
			t.Errorf("installer arguments %q lack %q", args, want)
		}
	}
	if v := e.versions(); v.Applying == nil || v.Applying.To != "0.3.0" || v.Applying.Attempts != 1 || v.Active != "0.2.0" {
		t.Fatalf("versions %+v", v)
	}
	if f, err := openExclusive(e.c.lockPath()); err != nil {
		t.Fatal("apply.lock still held after the installer owns the mutex")
	} else {
		f.Close()
	}
}

func TestCode20RejectsBadSignatureHashOrTamperedInstaller(t *testing.T) {
	cases := map[string]func(*testEnv, *[]byte, *string, string){
		"installer byte changed": func(_ *testEnv, _ *[]byte, _ *string, inst string) {
			f, _ := os.OpenFile(inst, os.O_RDWR, 0)
			f.WriteAt([]byte{0xff, 0xfe}, 4096)
			f.Close()
		},
		"manifest changed after signing": func(_ *testEnv, m *[]byte, _ *string, _ string) {
			*m = []byte(strings.Replace(string(*m), "stable", "stablX", 1))
		},
		"signature of another key": func(_ *testEnv, m *[]byte, s *string, _ string) {
			_, other, _ := ed25519.GenerateKey(rand.Reader)
			*s = "ludiary-sig-v1 test-1 " + base64.StdEncoding.EncodeToString(ed25519.Sign(other, append([]byte(signatureContext), *m...))) + "\n"
		},
		"signature without context": func(e *testEnv, m *[]byte, s *string, _ string) {
			*s = "ludiary-sig-v1 test-1 " + base64.StdEncoding.EncodeToString(ed25519.Sign(e.priv, *m)) + "\n"
		},
	}
	for name, tamper := range cases {
		t.Run(name, func(t *testing.T) {
			e := newEnv(t)
			e.setupWantsUpdate()
			s := e.stageUpdate("0.3.0", tamper)
			e.c.run(nil)
			if _, err := os.Stat(s.dir); err == nil {
				t.Fatal("the rejected update folder must be deleted")
			}
			if e.versions().Applying != nil {
				t.Fatal("nothing must be marked as applying")
			}
			lines := e.callLines("0.2.0")
			if len(lines) != 2 || lines[1] != "" {
				t.Fatalf("expected a plain restart without --from-launcher, got %v", lines)
			}
		})
	}
}

func TestCode20ThirdAttemptMarksTheVersionBad(t *testing.T) {
	e := newEnv(t)
	e.setupWantsUpdate()
	e.stageUpdate("0.3.0", nil)
	v := e.versions()
	v.Applying = &applying{To: "0.3.0", Attempts: 2}
	e.setVersions(*v)
	e.c.run(nil)
	got := e.versions()
	if !got.isBad("0.3.0") || got.Applying != nil {
		t.Fatalf("versions %+v", got)
	}
}

func TestCode20WithABadVersionNeedsRetryBad(t *testing.T) {
	e := newEnv(t)
	e.setupWantsUpdate()
	s := e.stageUpdate("0.3.0", nil)
	v := e.versions()
	v.BadVersions = []string{"0.3.0"}
	e.setVersions(*v)
	e.c.run(nil)
	if _, err := os.Stat(s.installer); err == nil {
		t.Fatal("a version in badVersions must not be installed")
	}
	// With retryBad it goes ahead.
	e2 := newEnv(t)
	e2.setupWantsUpdate()
	s2 := e2.stageUpdate("0.3.0", nil)
	v2 := e2.versions()
	v2.BadVersions = []string{"0.3.0"}
	e2.setVersions(*v2)
	st, _ := json.Marshal(map[string]any{"state": "applying", "to": "0.3.0", "retryBad": "0.3.0"})
	os.WriteFile(filepath.Join(e2.c.updatesDir(), "state.json"), st, 0o644)
	e2.c.run(nil)
	time.Sleep(500 * time.Millisecond)
	if _, err := os.Stat(filepath.Join(s2.dir, "calls.log")); err != nil {
		t.Fatal("retryBad must let the installer run")
	}
}

func TestCode20WithoutStateRunsPlain(t *testing.T) {
	e := newEnv(t)
	e.setupWantsUpdate()
	e.c.run(nil)
	lines := e.callLines("0.2.0")
	if len(lines) != 2 || lines[1] != "" {
		t.Fatalf("calls %v", lines)
	}
}

func TestShortcutWaitsForApplyLockThenGoesOn(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.setVersions(versions{Active: "0.2.0"})
	lock, err := openExclusive(e.c.lockPath())
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	start := time.Now()
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if time.Since(start) < e.c.lockWait {
		t.Fatal("it must wait lockWait while apply.lock is held")
	}
	if len(e.callLines("0.2.0")) != 1 {
		t.Fatal("after the wait it goes on as normal")
	}
	// --stop is never held up: the installer itself calls it while it owns the mutex.
	release := holdMutex(e.c.mutexName)
	defer release()
	start = time.Now()
	e.c.run([]string{"--stop"})
	if time.Since(start) > e.c.lockWait {
		t.Fatal("--stop must not wait")
	}
}

// ---- trial and rollback

func (e *testEnv) trialSetup(newBehavior behavior) {
	e.app("0.2.0", behavior{})
	e.app("0.3.0", newBehavior)
	e.setVersions(versions{Active: "0.3.0", Previous: ptr("0.2.0"), Trial: true})
}

func TestTrialSuccessConfirmsAndPrunes(t *testing.T) {
	e := newEnv(t)
	e.app("0.1.0", behavior{})
	e.trialSetup(behavior{})
	os.MkdirAll(filepath.Join(e.c.updatesDir(), "0.3.0"), 0o755)
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	v := e.versions()
	if v.Trial || v.Trials != 0 || v.Active != "0.3.0" {
		t.Fatalf("%+v", v)
	}
	if _, err := os.Stat(e.c.appDir("0.1.0")); err == nil {
		t.Fatal("older folders are pruned: only active and previous stay")
	}
	if _, err := os.Stat(e.c.appDir("0.2.0")); err != nil {
		t.Fatal("previous must stay")
	}
	if _, err := os.Stat(filepath.Join(e.c.updatesDir(), "0.3.0")); err == nil {
		t.Fatal("the installer folder is deleted")
	}
	if got := e.callLines("0.3.0"); len(got) != 1 || got[0] != "--trial --from-launcher" {
		t.Fatalf("calls %v", got)
	}
}

func TestTrialFailingTwiceRollsBack(t *testing.T) {
	e := newEnv(t)
	e.trialSetup(behavior{Codes: map[string]int{"--trial": 1}})
	if code := e.c.run(nil); code != 0 {
		t.Fatalf("after the rollback the old version starts: %d", code)
	}
	v := e.versions()
	if v.Active != "0.2.0" || !v.isBad("0.3.0") || v.Trial || v.RollingBack != nil || v.Previous != nil {
		t.Fatalf("%+v", v)
	}
	if _, err := os.Stat(e.c.appDir("0.3.0")); err == nil {
		t.Fatal("app-0.3.0 must be deleted")
	}
	old := e.callLines("0.2.0")
	if len(old) != 2 || old[0] != "--rollback-update --rollback-code=1 --rollback-from=0.2.0 --rollback-to=0.3.0" || old[1] != "--from-launcher" {
		t.Fatalf("old version calls %v", old)
	}
}

func TestTrialExplicitFatalRollsBackAtOnce(t *testing.T) {
	e := newEnv(t)
	e.trialSetup(behavior{Codes: map[string]int{"--trial": 14}})
	e.c.run(nil)
	if n := len(e.callLines("0.3.0")); n != 0 { // the folder is gone; check through the old version's rollback code
		t.Fatalf("unexpected %d", n)
	}
	if got := e.callLines("0.2.0"); len(got) == 0 || got[0] != "--rollback-update --rollback-code=14 --rollback-from=0.2.0 --rollback-to=0.3.0" {
		t.Fatalf("calls %v", got)
	}
}

func TestTrialTimeoutCountsAsFailure(t *testing.T) {
	e := newEnv(t)
	e.c.trialTimeout = 200 * time.Millisecond
	e.trialSetup(behavior{SleepMs: 5000, SleepOn: "--trial"})
	start := time.Now()
	e.c.run(nil)
	if time.Since(start) > 4*time.Second {
		t.Fatal("the hanging trial must be killed")
	}
	if v := e.versions(); v.Active != "0.2.0" || !v.isBad("0.3.0") {
		t.Fatalf("%+v", v)
	}
}

func TestTrialsAlreadyAtTwoRollsBackWithoutRunning(t *testing.T) {
	e := newEnv(t)
	e.trialSetup(behavior{})
	v := e.versions()
	v.Trials = 2
	e.setVersions(*v)
	e.c.run(nil)
	if v := e.versions(); v.Active != "0.2.0" || !v.isBad("0.3.0") {
		t.Fatalf("%+v", v)
	}
}

func TestTrialWithoutPreviousIsAPlainStart(t *testing.T) {
	e := newEnv(t)
	e.app("0.3.0", behavior{Codes: map[string]int{"--trial": 1}})
	e.setVersions(versions{Active: "0.3.0", Trial: true})
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if e.versions().Trial {
		t.Fatal("nothing to go back to: no trial")
	}
}

func TestRollbackStopFailureTouchesNothingElse(t *testing.T) {
	e := newEnv(t)
	e.trialSetup(behavior{Codes: map[string]int{"--trial": 12, "--stop": 1}})
	if code := e.c.run(nil); code == 0 {
		t.Fatal("must fail")
	}
	if len(e.fatals) != 1 || e.fatals[0] != "rollbackFailed" {
		t.Fatalf("fatals %v", e.fatals)
	}
	v := e.versions()
	if v.RollingBack == nil || v.Active != "0.3.0" {
		t.Fatalf("%+v", v)
	}
	if len(e.callLines("0.2.0")) != 0 {
		t.Fatal("no restoration when the new version's --stop fails")
	}
	if _, err := os.Stat(e.c.appDir("0.3.0")); err != nil {
		t.Fatal("app-0.3.0 stays")
	}
}

func TestRollbackIsResumableAtEveryStep(t *testing.T) {
	// Cut after writing rollingBack (the new folder still there), and after the active pointer moved but before the delete.
	e := newEnv(t)
	e.trialSetup(behavior{})
	v := e.versions()
	v.RollingBack = &rollingBack{From: "0.2.0", To: "0.3.0"}
	e.setVersions(*v)
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if got := e.versions(); got.Active != "0.2.0" || !got.isBad("0.3.0") || got.RollingBack != nil {
		t.Fatalf("%+v", got)
	}
	// Cut after the pointer was written: no rollingBack, active is the old one, the bad folder is left behind.
	e2 := newEnv(t)
	e2.app("0.2.0", behavior{})
	e2.app("0.3.0", behavior{})
	e2.setVersions(versions{Active: "0.2.0", BadVersions: []string{"0.3.0"}})
	if code := e2.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if len(e2.callLines("0.3.0")) != 0 {
		t.Fatal("a bad folder is never run")
	}
	// Cut after the new folder was deleted: step 2 is skipped.
	e3 := newEnv(t)
	e3.app("0.2.0", behavior{})
	e3.setVersions(versions{Active: "0.3.0", Previous: ptr("0.2.0"), RollingBack: &rollingBack{From: "0.2.0", To: "0.3.0"}})
	if code := e3.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if got := e3.versions(); got.Active != "0.2.0" {
		t.Fatalf("%+v", got)
	}
}

func TestRollbackFailureShowsTheFatalDialog(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{Codes: map[string]int{"--rollback-update": 1}})
	e.app("0.3.0", behavior{Codes: map[string]int{"--trial": 12}})
	e.setVersions(versions{Active: "0.3.0", Previous: ptr("0.2.0"), Trial: true})
	e.c.run(nil)
	if len(e.fatals) != 1 {
		t.Fatalf("fatals %v", e.fatals)
	}
	if v := e.versions(); v.Active != "0.3.0" || v.RollingBack == nil {
		t.Fatalf("%+v", v)
	}
}

// ---- commit (what the installer runs last)

func TestCommitMakesTheNewFolderActiveAndRunsTheTrial(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.app("0.3.0", behavior{})
	e.setVersions(versions{Active: "0.2.0", Applying: &applying{To: "0.3.0", Attempts: 1}})
	release := holdMutex(e.c.mutexName) // the installer is still finishing
	go func() { time.Sleep(150 * time.Millisecond); release() }()
	start := time.Now()
	if code := e.c.run([]string{"--commit-update", "0.3.0"}); code != 0 {
		t.Fatal(code)
	}
	if time.Since(start) < 100*time.Millisecond {
		t.Fatal("it must wait for the installer to leave")
	}
	v := e.versions()
	if v.Active != "0.3.0" || v.Previous == nil || *v.Previous != "0.2.0" || v.Trial || v.Applying != nil {
		t.Fatalf("%+v", v) // trial already finished and confirmed
	}
	if got := e.callLines("0.3.0"); len(got) != 1 || got[0] != "--trial --from-launcher" {
		t.Fatalf("calls %v", got)
	}
}

func TestCommitWithoutCompleteMarkerChangesNothing(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.copySelf(e.c.appExe("0.3.0"), behavior{}) // no .complete
	e.setVersions(versions{Active: "0.2.0"})
	if code := e.c.run([]string{"--commit-update", "0.3.0"}); code == 0 {
		t.Fatal("must refuse")
	}
	if e.versions().Active != "0.2.0" {
		t.Fatal("the active folder must not change")
	}
}

func TestCommitRejectsInvalidVersionsAndArguments(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.setVersions(versions{Active: "0.2.0"})
	for _, args := range [][]string{{"--commit-update", "0.3.0/../x"}, {"--commit-update", "0.3.0", "--server"}} {
		if e.c.run(args) == 0 {
			t.Fatalf("%v accepted", args)
		}
	}
}

func TestFirstInstallHasNoTrial(t *testing.T) {
	e := newEnv(t)
	e.app("0.3.0", behavior{})
	if code := e.c.run([]string{"--commit-update", "0.3.0", "--no-open"}); code != 0 {
		t.Fatal(code)
	}
	v := e.versions()
	if v.Active != "0.3.0" || v.Previous != nil || v.Trial {
		t.Fatalf("%+v", v)
	}
	if got := e.callLines("0.3.0"); len(got) != 1 || got[0] != "--no-open --from-launcher" {
		t.Fatalf("calls %v", got)
	}
}

func TestTwoLaunchersAtOnceOnlyOneApplies(t *testing.T) {
	e := newEnv(t)
	e.setupWantsUpdate()
	e.stageUpdate("0.3.0", nil)
	first := make(chan int)
	go func() { first <- e.c.run(nil) }()
	time.Sleep(20 * time.Millisecond)
	<-first
	// The installer (still holding its mutex) is in charge now: a second click waits, then starts the old version normally.
	start := time.Now()
	e.c.run(nil)
	if time.Since(start) < 50*time.Millisecond && mutexExists(e.c.mutexName) {
		t.Fatal("the second launcher must wait while the installer owns its mutex")
	}
}

func TestApplyLockHeldUntilTheInstallerOwnsItsMutex(t *testing.T) {
	e := newEnv(t)
	e.c.lockWait = 3 * time.Second
	e.inst = &behavior{Mutex: e.c.mutexName, MutexMs: 700, SleepMs: 300}
	e.setupWantsUpdate()
	e.stageUpdate("0.3.0", nil)
	start := time.Now()
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	if time.Since(start) < 600*time.Millisecond {
		t.Fatalf("returned after %v, before the installer took its mutex", time.Since(start))
	}
	if !mutexExists(e.c.mutexName) {
		t.Fatal("the mutex must exist when the launcher lets go")
	}
}

func TestApplyLockGoesWhenTheInstallerEndsWithoutAMutex(t *testing.T) {
	e := newEnv(t)
	e.c.lockWait = 5 * time.Second
	e.inst = &behavior{}
	e.setupWantsUpdate()
	e.stageUpdate("0.3.0", nil)
	start := time.Now()
	e.c.run(nil)
	if time.Since(start) > 3*time.Second {
		t.Fatal("it must not wait for a mutex of a process that already ended")
	}
}

func TestInterruptedInstallWithCompleteFolderIsConfirmed(t *testing.T) {
	e := newEnv(t)
	e.app("0.2.0", behavior{})
	e.app("0.3.0", behavior{})
	e.setVersions(versions{Active: "0.2.0", Applying: &applying{To: "0.3.0", Attempts: 1}})
	if code := e.c.run(nil); code != 0 {
		t.Fatal(code)
	}
	v := e.versions()
	if v.Active != "0.3.0" || v.Previous == nil || *v.Previous != "0.2.0" || v.Applying != nil {
		t.Fatalf("%+v", v)
	}
}

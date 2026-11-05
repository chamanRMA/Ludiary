package main

// Stable launcher (ADR 90 points 7, 8 and 18). It runs the active app-<version>\Ludiary.exe, applies a verified update when
// the inner launcher asks for it (exit code 20), supervises the trial period and rolls back. No network, no SQLite.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"time"
)

const exitApplyUpdate = 20 // EXIT.applyUpdate in packages/runtime/src/deps.ts

type config struct {
	root, dataDir string
	keys          map[string]string
	target        string
	mutexName     string
	// Timeouts and polling are fields so tests do not wait for real time.
	// shortcutWait is how long a shortcut waits for a confirmation to end: Setup (lockWait) + two trials + their stop + a rollback.
	lockWait, shortcutWait, trialTimeout, stopTimeout, rollbackTimeout, poll time.Duration
	fatal                                                                    func(key string)
	// held is apply.lock while this process owns it (a shortcut start, a commit, an apply); the inner steps use it instead of reopening.
	held *os.File
}

func (c *config) updatesDir() string { return filepath.Join(c.dataDir, "updates") }
func (c *config) lockPath() string   { return filepath.Join(c.updatesDir(), "apply.lock") }

// shortcutFlags are the arguments of the role the shortcut starts; anything else is passed through untouched.
var shortcutFlags = []string{"--after-restart", "--no-open"}

func isShortcut(args []string) bool {
	for _, a := range args {
		if !slices.Contains(shortcutFlags, a) {
			return false
		}
	}
	return true
}

// runExe runs a program and waits. timeout 0: no limit. Returns -1 when it could not start or was killed by the timeout.
func runExe(exe string, args []string, timeout time.Duration) int {
	cmd := exec.Command(exe, args...)
	if err := cmd.Start(); err != nil {
		return -1
	}
	var timer *time.Timer
	timedOut := make(chan struct{})
	if timeout > 0 {
		timer = time.AfterFunc(timeout, func() { close(timedOut); cmd.Process.Kill() })
	}
	err := cmd.Wait()
	if timer != nil && !timer.Stop() {
		<-timedOut
		return -1
	}
	if err == nil {
		return 0
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	return -1
}

// waitAndHold is what every shortcut start does first (A3): wait until no installer of ours is running and apply.lock is free,
// and HOLD the lock while the start goes on. Holding it is what keeps a commit-update, an apply or another start from
// interleaving with this one (ADR 90 point 19, the race of the manual installation). After lockWait it goes on without the
// lock, as before. Returns nil in that case.
func (c *config) waitAndHold() *os.File {
	for deadline := time.Now().Add(c.shortcutWait); ; time.Sleep(c.poll) {
		if f, err := openExclusive(c.lockPath()); err == nil {
			if !mutexExists(c.mutexName) {
				return f
			}
			f.Close()
		}
		if time.Now().After(deadline) {
			return nil
		}
	}
}

func (c *config) run(args []string) int {
	if len(args) >= 2 && args[0] == "--commit-update" {
		return c.commitUpdate(args[1], args[2:])
	}
	if i := slices.Index(args, "--after-stop"); i >= 0 {
		rest := slices.Delete(slices.Clone(args), i, i+1)
		if v := c.current(); v != nil {
			runExe(c.appExe(v.Active), []string{"--stop"}, c.stopTimeout)
		}
		args = rest
	}
	if isShortcut(args) {
		if f := c.waitAndHold(); f != nil {
			c.held = f
			defer func() {
				f.Close()
				c.held = nil
			}()
		}
	}
	return c.start(args)
}

// current is versions.json or, when it is missing or invalid, the newest complete app-<v> (point 7.9).
func (c *config) current() *versions {
	v := c.readVersions()
	if v != nil {
		if _, err := os.Stat(c.appExe(v.Active)); err == nil || v.RollingBack != nil {
			return v
		}
	}
	all := c.installedVersions(v)
	if len(all) == 0 {
		return nil
	}
	if v == nil {
		v = &versions{BadVersions: []string{}}
	}
	return &versions{Active: all[0], BadVersions: v.BadVersions}
}

func (c *config) start(args []string) int {
	v := c.current()
	if v == nil {
		c.fatal("damaged")
		return 1
	}
	if v.RollingBack != nil {
		if !c.finishRollback(v, 1) {
			return 1
		}
		if v = c.current(); v == nil {
			c.fatal("damaged")
			return 1
		}
	}
	if !isShortcut(args) {
		return runExe(c.appExe(v.Active), args, 0)
	}
	// M2: Inno was cut after it wrote .complete but before --commit-update ran: confirm now, as that would have.
	// Everything that changes versions.json or applies an update needs apply.lock (waitAndHold gave up after shortcutWait
	// otherwise): without it the active version just starts, with no --from-launcher so it can neither ask to apply nor run a trial.
	if c.held == nil {
		return runExe(c.appExe(v.Active), args, 0)
	}
	if v.Applying != nil && v.Applying.To != v.Active && !v.isBad(v.Applying.To) && c.isComplete(v.Applying.To) && c.readVersions() != nil {
		return c.commitLocked(v.Applying.To, args)
	}
	if v.Trial {
		return c.trial(v, args)
	}
	return c.normal(v, args)
}

func (c *config) normal(v *versions, args []string) int {
	code := runExe(c.appExe(v.Active), append(slices.Clone(args), "--from-launcher"), 0)
	if code == exitApplyUpdate {
		return c.applyUpdate(v, args)
	}
	return code
}

// trial: first start of a new version (point 7.5 and M4). Two failed starts or one explicit fatal (codes 10 to 14) roll back.
func (c *config) trial(v *versions, args []string) int {
	if v.Previous == nil { // nothing to go back to: a plain start, with its own error dialogs
		v.Trial, v.Trials = false, 0
		c.writeVersions(v)
		return c.normal(v, args)
	}
	for {
		if v.Trials >= 2 {
			return c.rollback(v, 1, args)
		}
		v.Trials++
		if c.writeVersions(v) != nil {
			return c.normal(v, args)
		}
		code := runExe(c.appExe(v.Active), append(slices.Clone(args), "--trial", "--from-launcher"), c.trialTimeout)
		switch {
		case code == 0:
			v.Trial, v.Trials, v.Applying = false, 0, nil
			v.removeBad(v.Active) // a bad version retried with "Buscar ahora" that now works (M4)
			c.writeVersions(v)
			c.prune(v)
			os.RemoveAll(filepath.Join(c.updatesDir(), v.Active))
			return 0
		case code >= 10 && code <= 14:
			return c.rollback(v, code, args)
		}
	}
}

func (c *config) rollback(v *versions, code int, args []string) int {
	if v.Previous == nil {
		c.fatal("rollbackFailed")
		return 1
	}
	v.RollingBack = &rollingBack{From: *v.Previous, To: v.Active}
	if c.writeVersions(v) != nil {
		c.fatal("rollbackFailed")
		return 1
	}
	if !c.finishRollback(v, code) {
		return 1
	}
	return c.start(args)
}

// finishRollback is resumable and every step is idempotent (A1): it is entered again from the start after any cut.
func (c *config) finishRollback(v *versions, code int) bool {
	rb := v.RollingBack
	if code < 1 || code > 255 {
		code = 1
	}
	if _, err := os.Stat(c.appExe(rb.To)); err == nil {
		if runExe(c.appExe(rb.To), []string{"--stop"}, c.stopTimeout) != 0 {
			c.fatal("rollbackFailed") // nothing else is touched: the server of the new version may still be running
			return false
		}
	}
	if runExe(c.appExe(rb.From), []string{"--rollback-update", "--rollback-code=" + strconv.Itoa(code), "--rollback-from=" + rb.From, "--rollback-to=" + rb.To}, c.rollbackTimeout) != 0 {
		c.fatal("rollbackFailed")
		return false
	}
	v.addBad(rb.To)
	v.Active, v.Trial, v.Trials, v.RollingBack, v.Applying = rb.From, false, 0, nil, nil
	v.Previous = c.olderThan(rb.From, rb.To, v)
	if c.writeVersions(v) != nil {
		c.fatal("rollbackFailed")
		return false
	}
	os.RemoveAll(c.appDir(rb.To))
	return true
}

type updateState struct {
	State    string `json:"state"`
	To       string `json:"to"`
	RetryBad string `json:"retryBad"`
}

// applyUpdate handles exit code 20: verify again, right before running (B1), then hand over to the installer.
func (c *config) applyUpdate(v *versions, args []string) int {
	plain := func() int { return runExe(c.appExe(v.Active), args, 0) } // no --from-launcher: starts normally and clears `applying`
	var st updateState
	data, err := os.ReadFile(filepath.Join(c.updatesDir(), "state.json"))
	if err != nil || json.Unmarshal(data, &st) != nil || st.State != "applying" || !isVersion(st.To) {
		return plain()
	}
	to := st.To
	attempts := 1
	if v.Applying != nil && v.Applying.To == to {
		attempts = v.Applying.Attempts + 1
	}
	if attempts > 2 { // the installation was started twice and never confirmed: bad version
		v.addBad(to)
		v.Applying = nil
		c.writeVersions(v)
		return plain()
	}
	bad := slices.Clone(v.BadVersions)
	if st.RetryBad == to {
		bad = slices.DeleteFunc(bad, func(b string) bool { return b == to })
	}
	dir := filepath.Join(c.updatesDir(), to)
	installer, err := c.verifiedInstaller(dir, to, v.Active, bad)
	if err != nil {
		os.RemoveAll(dir)
		return plain()
	}
	defer installer.file.Close()
	if c.held == nil { // a shortcut start already holds it
		lock, err := openExclusive(c.lockPath())
		if err != nil {
			return plain()
		}
		defer lock.Close()
	}
	v.Applying = &applying{To: to, Attempts: attempts}
	if c.writeVersions(v) != nil {
		return plain()
	}
	// Fixed arguments and our own folder; nothing that comes from the network (point 13).
	cmd := exec.Command(installer.path, "/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/UPDATE=1", "/LOG="+filepath.Join(dir, "install.log"))
	if cmd.Start() != nil {
		return plain()
	}
	installer.file.Close() // the process is created: the lock on the file is no longer needed
	// apply.lock goes only when the installer owns its mutex or has ended (A3), with a cap so a stuck start cannot hold it forever.
	ended := make(chan struct{})
	go func() { cmd.Wait(); close(ended) }()
	for deadline := time.Now().Add(c.lockWait); !mutexExists(c.mutexName) && time.Now().Before(deadline); {
		select {
		case <-ended:
			return 0
		case <-time.After(c.poll):
		}
	}
	return 0
}

type installerFile struct {
	file *os.File
	path string
}

// verifiedInstaller checks signature, rules, size and SHA-256 over the same open handle, which it returns still open.
func (c *config) verifiedInstaller(dir, to, current string, bad []string) (*installerFile, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "ludiary-update.json"))
	if err != nil {
		return nil, err
	}
	sig, err := os.ReadFile(filepath.Join(dir, "ludiary-update.json.sig"))
	if err != nil {
		return nil, err
	}
	_, file, reason := verifyManifest(raw, string(sig), c.keys, to, current, bad, c.target)
	if reason != "" {
		return nil, errors.New(reason)
	}
	path := filepath.Join(dir, file.Name)
	f, err := openSharedRead(path)
	if err != nil {
		return nil, err
	}
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil || n != file.Size || hex.EncodeToString(h.Sum(nil)) != file.Sha256 {
		f.Close()
		return nil, errors.New("hash")
	}
	return &installerFile{file: f, path: path}, nil
}

// commitUpdate is what the installer runs last (M2, M8): wait for it to leave, then make the new folder the active one
// and start the trial. It also covers a manual installation of a different version.
func (c *config) commitUpdate(to string, args []string) int {
	if !isVersion(to) || !isShortcut(args) {
		return 1
	}
	// Take apply.lock FIRST and keep it while the installer finishes: a shortcut that someone clicks (or the "Open Ludiary"
	// box of the installer) then waits for the whole commit and trial instead of starting the old version in between.
	var lock *os.File
	for deadline := time.Now().Add(c.shortcutWait); lock == nil; time.Sleep(c.poll) {
		lock, _ = openExclusive(c.lockPath())
		if lock == nil && time.Now().After(deadline) {
			return 1
		}
	}
	defer lock.Close()
	c.held = lock
	defer func() { c.held = nil }()
	for deadline := time.Now().Add(c.lockWait); mutexExists(c.mutexName); time.Sleep(c.poll) {
		if time.Now().After(deadline) {
			return 1
		}
	}
	return c.commitLocked(to, args)
}

// commitLocked needs apply.lock held and the installer gone. It makes the new folder the active one and starts the trial.
func (c *config) commitLocked(to string, args []string) int {
	if !c.isComplete(to) {
		return 1 // the installation did not finish: whatever was active stays active
	}
	v := c.readVersions()
	switch {
	case v == nil:
		v = &versions{Active: to, BadVersions: []string{}}
	case v.Active != to:
		v.removeBad(to) // the user chose to install it by hand
		old := v.Active
		v.Previous, v.Active, v.Trial, v.Trials, v.Applying = &old, to, true, 0, nil
	}
	if v.RollingBack != nil {
		return 1 // a rollback is still pending; it finishes first
	}
	if c.writeVersions(v) != nil {
		return 1
	}
	return c.start(args)
}

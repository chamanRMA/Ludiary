package main

// versions.json: which app-<version> folder runs (ADR 90 points 12 and 18). Only this program writes it (M2, M3).

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var versionRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// isVersion is B2/B3: every version that comes from a file is validated before it builds a path or an argument.
func isVersion(v string) bool { return len(v) <= 32 && versionRe.MatchString(v) }

// compareVersions needs two valid versions.
func compareVersions(a, b string) int {
	x, y := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		m, _ := strconv.Atoi(x[i])
		n, _ := strconv.Atoi(y[i])
		if m != n {
			return m - n
		}
	}
	return 0
}

type rollingBack struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// applying counts how many times an installation of `To` was started without being confirmed (two strikes: bad version).
type applying struct {
	To       string `json:"to"`
	Attempts int    `json:"attempts"`
}

type versions struct {
	Active      string       `json:"active"`
	Previous    *string      `json:"previous"`
	Trial       bool         `json:"trial"`
	Trials      int          `json:"trials"`
	RollingBack *rollingBack `json:"rollingBack,omitempty"`
	BadVersions []string     `json:"badVersions"`
	Applying    *applying    `json:"applying,omitempty"`
}

func (v *versions) isBad(version string) bool {
	for _, b := range v.BadVersions {
		if b == version {
			return true
		}
	}
	return false
}

func (v *versions) addBad(version string) {
	if !v.isBad(version) {
		v.BadVersions = append(v.BadVersions, version)
	}
}

func (v *versions) removeBad(version string) {
	kept := v.BadVersions[:0:0]
	for _, b := range v.BadVersions {
		if b != version {
			kept = append(kept, b)
		}
	}
	v.BadVersions = kept
}

func (v *versions) valid() bool {
	if !isVersion(v.Active) || v.Trials < 0 || v.Trials > 2 {
		return false
	}
	if v.Previous != nil && !isVersion(*v.Previous) {
		return false
	}
	if v.RollingBack != nil && (!isVersion(v.RollingBack.From) || !isVersion(v.RollingBack.To)) {
		return false
	}
	if v.Applying != nil && (!isVersion(v.Applying.To) || v.Applying.Attempts < 0 || v.Applying.Attempts > 9) {
		return false
	}
	for _, b := range v.BadVersions {
		if !isVersion(b) {
			return false
		}
	}
	return true
}

func (c *config) versionsPath() string   { return filepath.Join(c.root, "versions.json") }
func (c *config) appDir(v string) string { return filepath.Join(c.root, "app-"+v) }
func (c *config) appExe(v string) string { return filepath.Join(c.appDir(v), "Ludiary.exe") }

// readVersions returns nil for a missing or invalid file; the caller then falls back to the reserve (point 7.9).
func (c *config) readVersions() *versions {
	data, err := os.ReadFile(c.versionsPath())
	if err != nil {
		return nil
	}
	var v versions
	if json.Unmarshal(data, &v) != nil || !v.valid() {
		return nil
	}
	if v.BadVersions == nil {
		v.BadVersions = []string{}
	}
	return &v
}

// writeVersions: temporary file, flush, replace with write-through (M2).
func (c *config) writeVersions(v *versions) error {
	if v.BadVersions == nil {
		v.BadVersions = []string{}
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp := c.versionsPath() + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp)
		return err
	}
	return replaceFileDurable(tmp, c.versionsPath())
}

// complete folders: Inno writes .complete as the last file of app-<v> (M2).
func (c *config) isComplete(v string) bool {
	_, err := os.Stat(filepath.Join(c.appDir(v), ".complete"))
	return err == nil
}

// installedVersions lists the complete app-<v> folders, newest first.
func (c *config) installedVersions(bad *versions) []string {
	entries, _ := os.ReadDir(c.root)
	var out []string
	for _, e := range entries {
		v, ok := strings.CutPrefix(e.Name(), "app-")
		if !ok || !e.IsDir() || !isVersion(v) || !c.isComplete(v) || (bad != nil && bad.isBad(v)) {
			continue
		}
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return compareVersions(out[i], out[j]) > 0 })
	return out
}

// olderThan returns the newest complete, not-bad version below `than` that is not `skip`; "" if none.
func (c *config) olderThan(than, skip string, bad *versions) *string {
	for _, v := range c.installedVersions(bad) {
		if v != skip && compareVersions(v, than) < 0 {
			return &v
		}
	}
	return nil
}

// prune keeps `active` and `previous` and removes every other app-<v> folder (point 7.5).
func (c *config) prune(v *versions) {
	entries, _ := os.ReadDir(c.root)
	for _, e := range entries {
		ver, ok := strings.CutPrefix(e.Name(), "app-")
		if !ok || !e.IsDir() || !isVersion(ver) || ver == v.Active || (v.Previous != nil && ver == *v.Previous) {
			continue
		}
		os.RemoveAll(filepath.Join(c.root, e.Name()))
	}
}

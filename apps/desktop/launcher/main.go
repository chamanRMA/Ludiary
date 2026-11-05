package main

// Ludiary.exe in the installation folder: the stable launcher (ADR 90). Standard library only.

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

//go:embed messages.json
var messagesJSON []byte

// Set by the build with -ldflags "-X main.keysB64=...": base64 of {"<keyId>":"<raw public key in base64>"}.
// Empty (a development build): no update is ever applied (fails closed).
var keysB64 string

func message(key string) (title, text string) {
	var all map[string]map[string]string
	_ = json.Unmarshal(messagesJSON, &all)
	lang := "en"
	if uiIsSpanish() {
		lang = "es"
	}
	return all[lang]["title"], all[lang][key]
}

func newConfig() (*config, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	dataDir, err := defaultDataDir()
	if err != nil {
		return nil, err
	}
	keys := map[string]string{}
	if raw, err := base64.StdEncoding.DecodeString(keysB64); err == nil {
		_ = json.Unmarshal(raw, &keys)
	}
	return &config{
		root:            filepath.Dir(exe),
		dataDir:         dataDir,
		keys:            keys,
		target:          "windows-x64",
		mutexName:       "Ludiary-Setup",
		lockWait:        120 * time.Second,
		shortcutWait:    10 * time.Minute,  // > 120 s Setup + 2 x 120 s trials + 20 s stop + 120 s rollback
		trialTimeout:    120 * time.Second, // START_TIMEOUT_MS (60 s) of launcher.ts plus 60 s of margin (M4); a test keeps them in step
		stopTimeout:     20 * time.Second,
		rollbackTimeout: 120 * time.Second,
		poll:            250 * time.Millisecond,
		fatal: func(key string) {
			title, text := message(key)
			showMessage(title, text)
		},
	}, nil
}

// defaultDataDir is %LOCALAPPDATA%\Ludiary, like platform-windows/src/info.ts (B5).
func defaultDataDir() (string, error) {
	if d := testDataDir(); d != "" {
		return d, nil
	}
	base := os.Getenv("LOCALAPPDATA")
	if base == "" || !filepath.IsAbs(base) {
		return "", os.ErrNotExist
	}
	return filepath.Join(base, "Ludiary"), nil
}

func main() {
	c, err := newConfig()
	if err != nil {
		os.Exit(1)
	}
	os.Exit(c.run(os.Args[1:]))
}

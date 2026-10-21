// ludiary-tray: tiny tray-icon helper for Ludiary (ADR 45).
//
// Protocol: one JSON object per line.
//
//	stdin  (server -> helper): {"type":"state","tooltip":"...","items":[{"id":"open","label":"...","enabled":true},{"separator":true}]}
//	                           {"type":"quit"}
//	stdout (helper -> server): {"type":"ready"} | {"type":"click","id":"open"} | {"type":"error","message":"..."}
//
// The helper owns no user-visible text: every label arrives already translated.
// It exits when stdin closes, so it can never outlive the server.
package main

import (
	"bufio"
	_ "embed"
	"encoding/json"
	"os"
	"sync"

	"github.com/gogpu/systray"
)

//go:embed icon.png
var iconPNG []byte

const defaultClickID = "@default"

type item struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Enabled   *bool  `json:"enabled,omitempty"`
	Separator bool   `json:"separator,omitempty"`
}

type inbound struct {
	Type    string `json:"type"`
	Tooltip string `json:"tooltip"`
	Items   []item `json:"items"`
}

var (
	outMu sync.Mutex
	out   = json.NewEncoder(os.Stdout)
)

func send(v map[string]any) {
	outMu.Lock()
	defer outMu.Unlock()
	_ = out.Encode(v)
}

func buildMenu(items []item) *systray.Menu {
	menu := systray.NewMenu()
	for _, it := range items {
		if it.Separator {
			menu.AddSeparator()
			continue
		}
		id := it.ID
		mi := menu.Add(it.Label, func() { send(map[string]any{"type": "click", "id": id}) })
		if it.Enabled != nil && !*it.Enabled {
			mi.SetDisabled(true)
		}
	}
	return menu
}

func main() {
	// ADR 64: `ludiary-tray.exe --dialog` shows one message box for the launcher, which has no window of its own.
	if len(os.Args) > 1 && os.Args[1] == "--dialog" {
		os.Exit(runDialog())
	}

	tray := systray.New()
	tray.SetIcon(iconPNG).SetTooltip("Ludiary")
	tray.OnClick(func() { send(map[string]any{"type": "click", "id": defaultClickID}) })

	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		first := true
		for scanner.Scan() {
			var msg inbound
			if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
				send(map[string]any{"type": "error", "message": "bad json: " + err.Error()})
				continue
			}
			switch msg.Type {
			case "state":
				tray.SetTooltip(msg.Tooltip)
				tray.SetMenu(buildMenu(msg.Items))
				if first {
					first = false
					tray.Show()
					send(map[string]any{"type": "ready"})
				}
			case "quit":
				tray.Remove()
				os.Exit(0)
			}
		}
		// stdin closed: the server is gone.
		tray.Remove()
		os.Exit(0)
	}()

	if err := tray.Run(); err != nil {
		send(map[string]any{"type": "error", "message": err.Error()})
		os.Exit(1)
	}
}

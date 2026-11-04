package main

// Signed manifest (ADR 90 point 4 and point 18, M1/B4). Same rules as packages/runtime/src/updates/manifest.ts; both run
// the vectors in packages/runtime/test/fixtures/update-vectors/.

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"
)

const signatureContext = "ludiary-update-v1\n"
const (
	minInstallerBytes = 1 << 20
	maxInstallerBytes = 256 << 20
)

type updateFile struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	Sha256 string `json:"sha256"`
}

type manifest struct {
	Schema      int                   `json:"schema"`
	Product     string                `json:"product"`
	Channel     string                `json:"channel"`
	Version     string                `json:"version"`
	PublishedAt string                `json:"publishedAt"`
	Files       map[string]updateFile `json:"files"`
}

var (
	sigLineRe = regexp.MustCompile(`^ludiary-sig-v1 ([A-Za-z0-9._-]{1,32}) ([A-Za-z0-9+/]{86}==)\r?\n?$`)
	hex64Re   = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// verifyManifest returns the manifest, its file for `target` and "" or the same reason words as the TypeScript side.
// tagVersion "" skips the comparison with the tag. keys: keyId -> raw 32-byte public key in base64.
func verifyManifest(raw []byte, signature string, keys map[string]string, tagVersion, current string, bad []string, target string) (*manifest, *updateFile, string) {
	line := sigLineRe.FindStringSubmatch(signature)
	if line == nil {
		return nil, nil, "signature"
	}
	pubB64, known := keys[line[1]]
	if !known {
		return nil, nil, "key"
	}
	pub, err := base64.StdEncoding.DecodeString(pubB64)
	sig, err2 := base64.StdEncoding.DecodeString(line[2])
	if err != nil || err2 != nil || len(pub) != ed25519.PublicKeySize || len(sig) != ed25519.SignatureSize {
		return nil, nil, "signature"
	}
	if !ed25519.Verify(pub, append([]byte(signatureContext), raw...), sig) {
		return nil, nil, "signature"
	}

	var probe struct {
		Schema int `json:"schema"`
	}
	var m manifest
	if json.Unmarshal(raw, &probe) != nil {
		return nil, nil, "format"
	}
	if probe.Schema != 1 {
		return nil, nil, "schema"
	}
	if json.Unmarshal(raw, &m) != nil || !exactKeys(raw) || m.Product != "ludiary" || m.Channel != "stable" || !isVersion(m.Version) || m.Files == nil {
		return nil, nil, "format"
	}
	if tagVersion != "" && m.Version != tagVersion {
		return nil, nil, "version"
	}
	if !isVersion(current) || compareVersions(m.Version, current) <= 0 {
		return nil, nil, "not-newer"
	}
	for _, b := range bad {
		if b == m.Version {
			return nil, nil, "bad-version"
		}
	}
	file, ok := m.Files[target]
	if !ok {
		return nil, nil, "target"
	}
	if file.Name != "Ludiary-Setup-"+m.Version+".exe" || !hex64Re.MatchString(file.Sha256) || file.Size < minInstallerBytes || file.Size > maxInstallerBytes {
		return nil, nil, "file"
	}
	return &m, &file, ""
}

// exactKeys rejects a key that matches a known name only apart from its case (encoding/json is case-insensitive, JavaScript is
// not, so the two sides would read different values). Unknown keys are still ignored (point 4, rule 2).
func exactKeys(raw []byte) bool {
	var top map[string]json.RawMessage
	if json.Unmarshal(raw, &top) != nil || caseVariant(top, "schema", "product", "channel", "version", "publishedAt", "files") {
		return false
	}
	var files map[string]map[string]json.RawMessage
	if json.Unmarshal(top["files"], &files) != nil {
		return false
	}
	for _, f := range files {
		if caseVariant(f, "name", "size", "sha256") {
			return false
		}
	}
	return true
}

func caseVariant(m map[string]json.RawMessage, known ...string) bool {
	for k := range m {
		for _, n := range known {
			if k != n && strings.EqualFold(k, n) {
				return true
			}
		}
	}
	return false
}

package main

// `ludiary-tray.exe --registry` (ADR 72): read-only registry lookups for the platform package.
//
// Protocol: one JSON object on stdin, one JSON object on stdout (UTF-8), exit code 0.
//
//	stdin : {"queries":[{"hive":"HKCU","key":"Software\\Valve\\Steam","value":"SteamPath","view":"32","kind":"value"}]}
//	stdout: {"results":[{"ok":true,"values":["c:/program files (x86)/steam"]},{"ok":false,"error":"not-found"}]}
//
// hive   : "HKCU" or "HKLM" (anything else is rejected).
// view   : "32", "64" or omitted (the view of the helper process).
// kind   : "value" (default) reads `value` of `key`; "subkeys" reads `value` of every direct subkey of `key`
//
//	(subkeys without that value are skipped).
//
// Only REG_SZ and REG_EXPAND_SZ are read; REG_EXPAND_SZ is expanded with the environment of the helper.
// Per-query error codes: invalid-hive, invalid-key, invalid-value, invalid-view, invalid-kind, not-found,
// unsupported-type, access-denied, failed. A request that cannot be parsed at all answers
// {"error":"bad-request"} (or "too-large" / "too-many-queries") and exits with code 2.

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	maxRegistryRequestBytes = 64 * 1024
	maxRegistryQueries      = 32
	maxRegistryKeyLen       = 255
	maxRegistryValueLen     = 16383
	maxRegistrySubkeys      = 256
)

// registryAccess is the only access mask the helper ever asks for: read a value, list subkeys.
// No KEY_READ (which adds READ_CONTROL and KEY_NOTIFY) and certainly nothing that can write.
func registryAccess(view string) (uint32, bool) {
	mask := uint32(registry.QUERY_VALUE | registry.ENUMERATE_SUB_KEYS)
	switch view {
	case "", "default":
	case "32":
		mask |= registry.WOW64_32KEY
	case "64":
		mask |= registry.WOW64_64KEY
	default:
		return 0, false
	}
	return mask, true
}

type registryQuery struct {
	Hive  string `json:"hive"`
	Key   string `json:"key"`
	Value string `json:"value"`
	View  string `json:"view,omitempty"`
	Kind  string `json:"kind,omitempty"`
}

type registryRequest struct {
	Queries []registryQuery `json:"queries"`
}

type registryResult struct {
	OK     bool     `json:"ok"`
	Values []string `json:"values,omitempty"`
	Error  string   `json:"error,omitempty"`
}

type registryResponse struct {
	Results []registryResult `json:"results,omitempty"`
	Error   string           `json:"error,omitempty"`
}

// parseRegistryRequest parses the stdin payload; the returned string is a request-level error code ("" if fine).
func parseRegistryRequest(data []byte) (registryRequest, string) {
	var req registryRequest
	if len(data) > maxRegistryRequestBytes {
		return req, "too-large"
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return registryRequest{}, "bad-request"
	}
	if dec.More() || req.Queries == nil {
		return registryRequest{}, "bad-request"
	}
	if len(req.Queries) > maxRegistryQueries {
		return registryRequest{}, "too-many-queries"
	}
	return req, ""
}

func validRegistryText(s string, max int, allowEmpty bool) bool {
	if (!allowEmpty && s == "") || len(s) > max || !utf8.ValidString(s) || strings.ContainsRune(s, 0) {
		return false
	}
	return true
}

// validateRegistryQuery returns the root key, the access mask and "" or the error code of the query.
func validateRegistryQuery(q registryQuery) (registry.Key, uint32, string) {
	var root registry.Key
	switch q.Hive {
	case "HKCU":
		root = registry.CURRENT_USER
	case "HKLM":
		root = registry.LOCAL_MACHINE
	default:
		return 0, 0, "invalid-hive"
	}
	if !validRegistryText(q.Key, maxRegistryKeyLen, false) || strings.HasPrefix(q.Key, `\`) || strings.HasSuffix(q.Key, `\`) {
		return 0, 0, "invalid-key"
	}
	if !validRegistryText(q.Value, maxRegistryValueLen, true) {
		return 0, 0, "invalid-value"
	}
	if q.Kind != "" && q.Kind != "value" && q.Kind != "subkeys" {
		return 0, 0, "invalid-kind"
	}
	mask, ok := registryAccess(q.View)
	if !ok {
		return 0, 0, "invalid-view"
	}
	return root, mask, ""
}

func registryErrorCode(err error) string {
	switch {
	case errors.Is(err, registry.ErrNotExist), errors.Is(err, windows.ERROR_FILE_NOT_FOUND), errors.Is(err, windows.ERROR_PATH_NOT_FOUND):
		return "not-found"
	case errors.Is(err, registry.ErrUnexpectedType):
		return "unsupported-type"
	case errors.Is(err, windows.ERROR_ACCESS_DENIED):
		return "access-denied"
	default:
		return "failed"
	}
}

// readStringValue reads a REG_SZ or REG_EXPAND_SZ value; the latter is expanded.
func readStringValue(k registry.Key, name string) (string, error) {
	value, typ, err := k.GetStringValue(name)
	if err != nil {
		return "", err
	}
	if typ == registry.EXPAND_SZ {
		return registry.ExpandString(value)
	}
	return value, nil
}

func runRegistryQuery(q registryQuery) registryResult {
	root, mask, code := validateRegistryQuery(q)
	if code != "" {
		return registryResult{Error: code}
	}
	key, err := registry.OpenKey(root, q.Key, mask)
	if err != nil {
		return registryResult{Error: registryErrorCode(err)}
	}
	defer key.Close()

	if q.Kind != "subkeys" {
		value, err := readStringValue(key, q.Value)
		if err != nil {
			return registryResult{Error: registryErrorCode(err)}
		}
		return registryResult{OK: true, Values: []string{value}}
	}

	names, err := key.ReadSubKeyNames(maxRegistrySubkeys + 1)
	// Like os.File.Readdirnames, a positive n yields io.EOF when fewer names exist: not a failure.
	if err != nil && !errors.Is(err, io.EOF) {
		return registryResult{Error: registryErrorCode(err)}
	}
	if len(names) > maxRegistrySubkeys {
		names = names[:maxRegistrySubkeys]
	}
	values := []string{}
	for _, name := range names {
		sub, err := registry.OpenKey(key, name, mask)
		if err != nil {
			continue
		}
		value, err := readStringValue(sub, q.Value)
		sub.Close()
		if err == nil {
			values = append(values, value)
		}
	}
	return registryResult{OK: true, Values: values}
}

func handleRegistry(in io.Reader, out io.Writer) int {
	respond := func(r registryResponse, code int) int {
		_ = json.NewEncoder(out).Encode(r)
		return code
	}
	data, err := io.ReadAll(io.LimitReader(in, maxRegistryRequestBytes+1))
	if err != nil {
		return respond(registryResponse{Error: "bad-request"}, 2)
	}
	req, code := parseRegistryRequest(data)
	if code != "" {
		return respond(registryResponse{Error: code}, 2)
	}
	results := make([]registryResult, 0, len(req.Queries))
	for _, q := range req.Queries {
		results = append(results, runRegistryQuery(q))
	}
	return respond(registryResponse{Results: results}, 0)
}

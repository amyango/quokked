// Package settings loads the gitignored config/settings.json file that
// pins which Todoist project(s) the homepage shows by default.
package settings

import (
	"encoding/json"
	"os"
)

// path is relative to the backend module's working directory (backend/, per
// the Makefile), mirroring how internal/config loads backend/.env via a
// cwd-relative path.
const path = "../config/settings.json"

type Settings struct {
	DefaultProjects []string `json:"defaultProjects"`
	// DisabledSections maps a project id to the section ids within it whose
	// tasks should be hidden from the grouped board view.
	DisabledSections map[string][]string `json:"disabledSections,omitempty"`
}

// Load reads config/settings.json. A missing file just means no default
// projects are configured yet, not an error.
func Load() Settings {
	data, err := os.ReadFile(path)
	if err != nil {
		return Settings{}
	}
	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return Settings{}
	}
	return s
}

// Save writes s to config/settings.json, overwriting whatever is there.
// The file is gitignored, so there's no conflict/formatting concern beyond
// producing valid, readable JSON.
func Save(s Settings) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

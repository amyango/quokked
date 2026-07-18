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

// Package config loads backend configuration from environment variables,
// optionally pre-populated from a local .env file for development.
package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	Port         string
	TodoistToken string
}

// loadDotenv reads a .env file (if present) and sets any variables it
// defines that aren't already set in the environment. Missing .env is not
// an error — real environment variables are the source of truth in
// deployed settings.
func loadDotenv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, alreadySet := os.LookupEnv(key); !alreadySet {
			os.Setenv(key, value)
		}
	}
}

func Load() Config {
	loadDotenv(".env")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return Config{
		Port:         port,
		TodoistToken: os.Getenv("TODOIST_API_TOKEN"),
	}
}

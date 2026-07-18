package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"quokked/backend/internal/config"
	"quokked/backend/internal/settings"
	"quokked/backend/internal/todoist"
)

// pinnedCompletedLookback bounds how far back completed pinned tasks are
// fetched from. The Todoist completed-tasks endpoint rejects windows over
// 3 months, so this stays comfortably under that.
const pinnedCompletedLookback = 89 * 24 * time.Hour

func main() {
	cfg := config.Load()
	if cfg.TodoistToken == "" {
		log.Fatal("TODOIST_API_TOKEN is not set (add it to backend/.env)")
	}

	client := todoist.NewClient(cfg.TodoistToken)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/tasks", handleTasks(client))
	mux.HandleFunc("/api/tasks/", handleTaskUpdate(client))
	mux.HandleFunc("/api/pinned/completed", handlePinnedCompleted(client))
	mux.HandleFunc("/api/projects", handleProjects(client))
	mux.HandleFunc("/api/settings", handleSettings)

	addr := ":" + cfg.Port
	log.Printf("quokked backend listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

// withCORS reflects the request's Origin header back rather than pinning to
// a single hardcoded origin, so the frontend works whether it's loaded via
// localhost, a LAN hostname, or an IP. This is fine for a single-user,
// no-auth dev tool but would need tightening before this is ever exposed
// beyond a trusted network.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleTasks(client *todoist.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		tasks, err := client.FetchTasks(r.URL.Query().Get("project_id"))
		if err != nil {
			log.Printf("fetch tasks: %v", err)
			http.Error(w, "failed to fetch tasks from Todoist", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, tasks)
	}
}

// handleTaskUpdate handles PATCH /api/tasks/{id}, currently only used to
// replace a task's label set (e.g. adding/removing "pin" when a card is
// dragged between the pinned and unpinned sections).
func handleTaskUpdate(client *todoist.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		taskID := strings.TrimPrefix(r.URL.Path, "/api/tasks/")
		if taskID == "" || strings.Contains(taskID, "/") {
			http.Error(w, "invalid task id", http.StatusBadRequest)
			return
		}

		var body struct {
			Labels []string `json:"labels"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		task, err := client.UpdateTaskLabels(taskID, body.Labels)
		if err != nil {
			log.Printf("update task labels: %v", err)
			http.Error(w, "failed to update task in Todoist", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, task)
	}
}

// handlePinnedCompleted returns tasks completed within the lookback window
// that carry the "pin" label, plus a uid -> collaborator map so the
// frontend can show who completed each one.
func handlePinnedCompleted(client *todoist.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		const todoistTimeFormat = "2006-01-02T15:04:05"
		now := time.Now().UTC()
		since := now.Add(-pinnedCompletedLookback).Format(todoistTimeFormat)
		until := now.Format(todoistTimeFormat)

		tasks, err := client.FetchCompletedTasks("@pin", since, until)
		if err != nil {
			log.Printf("fetch pinned completed tasks: %v", err)
			http.Error(w, "failed to fetch completed tasks from Todoist", http.StatusBadGateway)
			return
		}

		collaborators := map[string]todoist.Collaborator{}
		seenProjects := map[string]bool{}
		for _, task := range tasks {
			if task.ProjectID == "" || seenProjects[task.ProjectID] {
				continue
			}
			seenProjects[task.ProjectID] = true
			projectCollaborators, err := client.FetchCollaborators(task.ProjectID)
			if err != nil {
				log.Printf("fetch collaborators for project %s: %v", task.ProjectID, err)
				continue
			}
			for _, c := range projectCollaborators {
				collaborators[c.ID] = c
			}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tasks":         tasks,
			"collaborators": collaborators,
		})
	}
}

func handleProjects(client *todoist.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		projects, err := client.FetchProjects()
		if err != nil {
			log.Printf("fetch projects: %v", err)
			http.Error(w, "failed to fetch projects from Todoist", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, projects)
	}
}

func handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, settings.Load())
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

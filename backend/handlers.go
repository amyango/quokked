package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"quokked/backend/internal/events"
	"quokked/backend/internal/settings"
	"quokked/backend/internal/todoist"
)

// pinnedCompletedLookback bounds how far back completed pinned tasks are
// fetched from. The Todoist completed-tasks endpoint rejects windows over
// 3 months, so this stays comfortably under that.
const pinnedCompletedLookback = 89 * 24 * time.Hour

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
func handleTaskUpdate(client *todoist.Client, poke chan<- struct{}) http.HandlerFunc {
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
		select {
		case poke <- struct{}{}:
		default:
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

func handleSections(client *todoist.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sections, err := client.FetchSections(r.URL.Query().Get("project_id"))
		if err != nil {
			log.Printf("fetch sections: %v", err)
			http.Error(w, "failed to fetch sections from Todoist", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, sections)
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

// handleEvents serves GET /api/events, a Server-Sent-Events stream that
// pushes a "changed" message whenever the sync poller detects Todoist
// data changed. Clients are expected to treat any message as a signal to
// refetch, not to parse its content.
func handleEvents(broker *events.Broker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		ch := broker.Subscribe()
		defer broker.Unsubscribe(ch)

		heartbeat := time.NewTicker(25 * time.Second)
		defer heartbeat.Stop()

		w.Write([]byte(": connected\n\n"))
		flusher.Flush()

		for {
			select {
			case <-r.Context().Done():
				return
			case msg := <-ch:
				w.Write([]byte("data: " + msg + "\n\n"))
				flusher.Flush()
			case <-heartbeat.C:
				w.Write([]byte(": ping\n\n"))
				flusher.Flush()
			}
		}
	}
}

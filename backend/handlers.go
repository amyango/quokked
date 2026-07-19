package main

import (
	"encoding/json"
	"fmt"
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

// handleTaskUpdate handles PATCH /api/tasks/{id}: replacing a task's label
// set (e.g. adding/removing "pin" when a card is dragged between the pinned
// and unpinned sections), marking it complete when {"complete": true} is
// sent (e.g. the complete button on a task card), or moving its due date
// when {"dueAction": ...} is sent (e.g. dragging a pinned card between the
// Today/Coming up subsections — see applyDueAction).
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
			Labels    []string     `json:"labels,omitempty"`
			Complete  bool         `json:"complete,omitempty"`
			DueAction string       `json:"dueAction,omitempty"`
			Due       *todoist.Due `json:"due,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		if body.Complete {
			if err := client.CompleteTask(taskID); err != nil {
				log.Printf("complete task: %v", err)
				http.Error(w, "failed to complete task in Todoist", http.StatusBadGateway)
				return
			}
			select {
			case poke <- struct{}{}:
			default:
			}
			writeJSON(w, http.StatusOK, map[string]bool{"completed": true})
			return
		}

		if body.DueAction != "" {
			task, err := applyDueAction(client, taskID, body.DueAction, body.Due)
			if err != nil {
				log.Printf("update task due date: %v", err)
				http.Error(w, "failed to update task due date in Todoist", http.StatusBadGateway)
				return
			}
			select {
			case poke <- struct{}{}:
			default:
			}
			writeJSON(w, http.StatusOK, task)
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

// applyDueAction moves a task's due date for the pinned Today/Coming up
// drag-and-drop (issue #7). due is the task's *current* due state, as the
// frontend already has it cached — this exists to avoid an extra
// fetch-before-write round trip, not to let the caller dictate the result.
//
// "pull_to_today" sets the due date to today; if the task is recurring,
// PullRecurringTaskToToday preserves its recurrence pattern instead of the
// plain due_string update (which would silently clobber it). "release_from_today"
// undoes that: clears the due date, or for a recurring task, re-submits its
// own due string so Todoist recomputes the next occurrence rather than
// leaving it dateless.
func applyDueAction(client *todoist.Client, taskID, action string, due *todoist.Due) (*todoist.Task, error) {
	recurring := due != nil && due.IsRecurring
	switch action {
	case "pull_to_today":
		if recurring {
			return client.PullRecurringTaskToToday(taskID, *due)
		}
		return client.UpdateTaskDue(taskID, "today")
	case "release_from_today":
		if recurring {
			return client.UpdateTaskDue(taskID, due.String)
		}
		return client.UpdateTaskDue(taskID, "no date")
	default:
		return nil, fmt.Errorf("unknown due action %q", action)
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

// handleSettings serves GET /api/settings (current settings) and PUT
// /api/settings (replace them wholesale, e.g. from the settings pane).
func handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, settings.Load())
	case http.MethodPut:
		var s settings.Settings
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if err := settings.Save(s); err != nil {
			log.Printf("save settings: %v", err)
			http.Error(w, "failed to save settings", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, s)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
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

package main

import (
	"encoding/json"
	"log"
	"net/http"

	"quokked/backend/internal/config"
	"quokked/backend/internal/todoist"
)

func main() {
	cfg := config.Load()
	if cfg.TodoistToken == "" {
		log.Fatal("TODOIST_API_TOKEN is not set (add it to backend/.env)")
	}

	client := todoist.NewClient(cfg.TodoistToken)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/tasks", handleTasks(client))
	mux.HandleFunc("/api/projects", handleProjects(client))

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
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
		tasks, err := client.FetchTasks()
		if err != nil {
			log.Printf("fetch tasks: %v", err)
			http.Error(w, "failed to fetch tasks from Todoist", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, tasks)
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

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

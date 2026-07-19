package main

import (
	"log"
	"net/http"

	"quokked/backend/internal/config"
	"quokked/backend/internal/events"
	"quokked/backend/internal/todoist"
)

func main() {
	cfg := config.Load()
	if cfg.TodoistToken == "" {
		log.Fatal("TODOIST_API_TOKEN is not set (add it to backend/.env)")
	}

	client := todoist.NewClient(cfg.TodoistToken)
	broker := events.NewBroker()
	poke := make(chan struct{}, 1)
	go runSyncPoller(client, broker, poke)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/tasks", handleTasks(client))
	mux.HandleFunc("/api/tasks/", handleTaskUpdate(client, poke))
	mux.HandleFunc("/api/pinned/completed", handlePinnedCompleted(client))
	mux.HandleFunc("/api/projects", handleProjects(client))
	mux.HandleFunc("/api/sections", handleSections(client))
	mux.HandleFunc("/api/settings", handleSettings)
	mux.HandleFunc("/api/events", handleEvents(broker))

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, PATCH, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

package main

import (
	"errors"
	"log"
	"time"

	"quokked/backend/internal/events"
	"quokked/backend/internal/todoist"
)

// syncPollInterval is how often the backend polls Todoist's incremental
// Sync API for changes. Well under Todoist's sync rate limit even when
// idle, since incremental responses are tiny.
const syncPollInterval = 5 * time.Second

// syncPollMaxBackoff caps how long the poller waits after repeated errors.
const syncPollMaxBackoff = 60 * time.Second

// runSyncPoller polls Todoist's incremental Sync API and publishes a
// "changed" event to broker whenever items or projects changed since the
// last poll. It never returns; run it in its own goroutine. poke lets
// callers (e.g. a successful task update) shortcut the wait for an
// immediate re-poll, so other connected browsers see the change quickly.
func runSyncPoller(client *todoist.Client, broker *events.Broker, poke <-chan struct{}) {
	syncToken := "*"
	first := true
	delay := syncPollInterval

	for {
		resp, err := client.Sync(syncToken, []string{"items", "projects"})
		if err != nil {
			log.Printf("sync poll: %v", err)
			if errors.Is(err, todoist.ErrBadSyncToken) {
				syncToken = "*"
			}
			delay *= 2
			if delay > syncPollMaxBackoff {
				delay = syncPollMaxBackoff
			}
		} else {
			changed := len(resp.Items) > 0 || len(resp.Projects) > 0 || (resp.FullSync && !first)
			syncToken = resp.SyncToken
			if changed && !first {
				broker.Publish("changed")
			}
			first = false
			delay = syncPollInterval
		}

		select {
		case <-time.After(delay):
		case <-poke:
		}
	}
}

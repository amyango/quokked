package todoist

import (
	"encoding/json"
	"fmt"
	"net/url"
)

// SyncItem is a task as represented in Sync API responses. Field set is
// intentionally smaller than Task — the poller only needs to know that
// something changed, not the full task shape.
type SyncItem struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Checked   bool   `json:"checked"`
}

// SyncResponse mirrors the relevant parts of the /sync endpoint response.
// Projects are left as raw JSON since the poller only needs their count.
type SyncResponse struct {
	SyncToken string            `json:"sync_token"`
	FullSync  bool              `json:"full_sync"`
	Items     []SyncItem        `json:"items"`
	Projects  []json.RawMessage `json:"projects"`
}

// Sync calls the incremental Sync API. Pass syncToken="*" to start a full
// sync; subsequent calls should pass the SyncToken from the previous
// response to receive only what changed since then.
func (c *Client) Sync(syncToken string, resourceTypes []string) (*SyncResponse, error) {
	resourceTypesJSON, err := json.Marshal(resourceTypes)
	if err != nil {
		return nil, err
	}

	form := url.Values{
		"sync_token":     {syncToken},
		"resource_types": {string(resourceTypesJSON)},
	}

	var resp SyncResponse
	if err := c.postForm("/sync", form, &resp); err != nil {
		if err == ErrBadSyncToken {
			return nil, ErrBadSyncToken
		}
		return nil, fmt.Errorf("sync: %w", err)
	}
	return &resp, nil
}

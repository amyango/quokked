// Package todoist is a thin client for the parts of the Todoist API v1
// that the backend needs: listing tasks and listing projects.
package todoist

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrBadSyncToken indicates the Todoist API rejected a sync_token (HTTP
// 400), typically because it's stale or malformed. Callers should retry
// with sync_token="*" to start a fresh full sync.
var ErrBadSyncToken = errors.New("todoist: sync token rejected")

const baseURL = "https://api.todoist.com/api/v1"

type Client struct {
	token      string
	httpClient *http.Client
}

func NewClient(token string) *Client {
	return &Client{
		token:      token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

type Due struct {
	String      string `json:"string"`
	Date        string `json:"date"`
	IsRecurring bool   `json:"is_recurring"`
	Datetime    string `json:"datetime,omitempty"`
	Timezone    string `json:"timezone,omitempty"`
}

type Task struct {
	ID             string   `json:"id"`
	ProjectID      string   `json:"project_id"`
	SectionID      string   `json:"section_id,omitempty"`
	ParentID       string   `json:"parent_id,omitempty"`
	Content        string   `json:"content"`
	Description    string   `json:"description"`
	Checked        bool     `json:"checked"`
	Labels         []string `json:"labels"`
	Priority       int      `json:"priority"`
	Due            *Due     `json:"due"`
	AddedAt        string   `json:"added_at"`
	NoteCount      int      `json:"note_count"`
	CompletedAt    string   `json:"completed_at,omitempty"`
	CompletedByUID string   `json:"completed_by_uid,omitempty"`
}

// Collaborator is a user with access to a shared project. The API exposes
// no avatar/photo field, so callers render an identicon from the name.
type Collaborator struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	ParentID    string `json:"parent_id,omitempty"`
	ChildOrder  int    `json:"child_order"`
	IsInboxProj bool   `json:"inbox_project"`
	IsFavorite  bool   `json:"is_favorite"`
	ViewStyle   string `json:"view_style,omitempty"`
}

type Section struct {
	ID           string `json:"id"`
	ProjectID    string `json:"project_id"`
	Name         string `json:"name"`
	SectionOrder int    `json:"section_order"`
}

// page mirrors the {"results": [...], "next_cursor": ...} envelope that
// every paginated Todoist API v1 list endpoint returns.
type page[T any] struct {
	Results    []T     `json:"results"`
	NextCursor *string `json:"next_cursor"`
}

// FetchTasks fetches tasks, optionally scoped to a single project. An empty
// projectID fetches tasks across all projects.
func (c *Client) FetchTasks(projectID string) ([]Task, error) {
	params := url.Values{}
	if projectID != "" {
		params.Set("project_id", projectID)
	}
	tasks, err := fetchAllPages[Task](c, "/tasks", params)
	if err != nil {
		return nil, fmt.Errorf("fetch tasks: %w", err)
	}
	return tasks, nil
}

func (c *Client) FetchProjects() ([]Project, error) {
	projects, err := fetchAllPages[Project](c, "/projects", url.Values{})
	if err != nil {
		return nil, fmt.Errorf("fetch projects: %w", err)
	}
	return projects, nil
}

// FetchSections fetches sections, optionally scoped to a single project. An
// empty projectID fetches sections across all projects.
func (c *Client) FetchSections(projectID string) ([]Section, error) {
	params := url.Values{}
	if projectID != "" {
		params.Set("project_id", projectID)
	}
	sections, err := fetchAllPages[Section](c, "/sections", params)
	if err != nil {
		return nil, fmt.Errorf("fetch sections: %w", err)
	}
	return sections, nil
}

// completedPage mirrors the {"items": [...], "next_cursor": ...} envelope
// the completed-tasks endpoint returns — same shape as page[T] but with a
// differently-named results field, so it can't reuse that generic type.
type completedPage struct {
	Items      []Task  `json:"items"`
	NextCursor *string `json:"next_cursor"`
}

// maxCompletedPages caps pagination on FetchCompletedTasks as a safety net;
// a personal pin label completed within one lookback window shouldn't ever
// come close to this many pages.
const maxCompletedPages = 10

// FetchCompletedTasks fetches tasks completed between since and until
// (RFC3339-ish, no timezone offset, e.g. "2026-04-18T00:00:00") that match
// filterQuery, a Todoist filter expression like "@pin". The API rejects
// windows longer than 3 months.
func (c *Client) FetchCompletedTasks(filterQuery, since, until string) ([]Task, error) {
	params := url.Values{
		"filter_query": {filterQuery},
		"since":        {since},
		"until":        {until},
		"limit":        {"50"},
	}
	var all []Task
	cursor := ""
	for page := 0; page < maxCompletedPages; page++ {
		query := url.Values{}
		for k, v := range params {
			query[k] = v
		}
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		var p completedPage
		if err := c.get("/tasks/completed/by_completion_date", query, "", &p); err != nil {
			return nil, fmt.Errorf("fetch completed tasks: %w", err)
		}
		all = append(all, p.Items...)
		if p.NextCursor == nil || *p.NextCursor == "" {
			return all, nil
		}
		cursor = *p.NextCursor
	}
	return all, nil
}

// FetchCollaborators lists the users with access to a shared project.
func (c *Client) FetchCollaborators(projectID string) ([]Collaborator, error) {
	collaborators, err := fetchAllPages[Collaborator](c, "/projects/"+projectID+"/collaborators", url.Values{})
	if err != nil {
		return nil, fmt.Errorf("fetch collaborators: %w", err)
	}
	return collaborators, nil
}

// UpdateTaskLabels replaces a task's full label set. Callers are
// responsible for merging with the task's existing labels first (e.g. to
// add or remove "pin" without clobbering others).
func (c *Client) UpdateTaskLabels(taskID string, labels []string) (*Task, error) {
	var task Task
	body := map[string]interface{}{"labels": labels}
	if err := c.post("/tasks/"+taskID, body, &task); err != nil {
		return nil, fmt.Errorf("update task labels: %w", err)
	}
	return &task, nil
}

// CompleteTask marks a task complete (Todoist calls this "closing" a task).
// The endpoint returns 204 No Content on success, so there's nothing to
// decode into.
func (c *Client) CompleteTask(taskID string) error {
	if err := c.post("/tasks/"+taskID+"/close", map[string]interface{}{}, nil); err != nil {
		return fmt.Errorf("complete task: %w", err)
	}
	return nil
}

// FetchTask fetches a single task by id.
func (c *Client) FetchTask(taskID string) (*Task, error) {
	var task Task
	if err := c.get("/tasks/"+taskID, url.Values{}, "", &task); err != nil {
		return nil, fmt.Errorf("fetch task: %w", err)
	}
	return &task, nil
}

// UpdateTaskDue sets a task's due date via natural-language due_string —
// "today" to pin it to today, "no date" to clear it entirely (both verified
// against the live API; Todoist's REST update has no dedicated
// remove-due-date field, but its due_string date parser recognizes "no
// date"), or a task's own recurring phrase (e.g. "every monday") re-sent
// as-is to make Todoist recompute its next occurrence from today, deferring
// to its recurrence engine rather than reimplementing it here.
//
// This can't be used to move a *recurring* task's date to today, though:
// due_string is a wholesale replacement of the stored due string, so
// sending "today" on a recurring task silently drops is_recurring and
// overwrites the stored recurring phrase — see PullRecurringTaskToToday for
// that case.
func (c *Client) UpdateTaskDue(taskID, dueString string) (*Task, error) {
	var task Task
	body := map[string]interface{}{"due_string": dueString}
	if err := c.post("/tasks/"+taskID, body, &task); err != nil {
		return nil, fmt.Errorf("update task due date: %w", err)
	}
	return &task, nil
}

// PullRecurringTaskToToday moves a recurring task's concrete due date to
// today while preserving its recurrence pattern (due.string/is_recurring),
// preserving the time-of-day if the task's due date carries one. The
// plain REST due_string update can't do this (see UpdateTaskDue), so this
// goes through the Sync API's item_update command instead, which accepts a
// raw due object and lets date and recurrence pattern be set independently
// of one another.
func (c *Client) PullRecurringTaskToToday(taskID string, due Due) (*Task, error) {
	date := time.Now().Format("2006-01-02")
	if idx := strings.Index(due.Date, "T"); idx != -1 {
		date += due.Date[idx:]
	}
	dueArgs := map[string]interface{}{
		"date":         date,
		"string":       due.String,
		"is_recurring": true,
		"lang":         "en",
	}
	if due.Timezone != "" {
		dueArgs["timezone"] = due.Timezone
	}
	cmd := map[string]interface{}{
		"type": "item_update",
		"uuid": newUUID(),
		"args": map[string]interface{}{
			"id":  taskID,
			"due": dueArgs,
		},
	}
	cmdsJSON, err := json.Marshal([]interface{}{cmd})
	if err != nil {
		return nil, fmt.Errorf("pull recurring task to today: %w", err)
	}
	form := url.Values{"commands": {string(cmdsJSON)}}
	var resp struct {
		SyncStatus map[string]json.RawMessage `json:"sync_status"`
	}
	if err := c.postForm("/sync", form, &resp); err != nil {
		return nil, fmt.Errorf("pull recurring task to today: %w", err)
	}
	for _, status := range resp.SyncStatus {
		var ok string
		if json.Unmarshal(status, &ok) == nil && ok == "ok" {
			continue
		}
		return nil, fmt.Errorf("pull recurring task to today: sync command rejected: %s", status)
	}
	// The Sync API doesn't echo back the updated task, so fetch it fresh.
	return c.FetchTask(taskID)
}

// newUUID generates a random v4 UUID for the Sync API's per-command
// idempotency key. Not imported from a package since the backend has a
// stdlib-only, no-deps policy.
func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("quokked-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// all starts as an empty (non-nil) slice, not "var all []T", so that a
// zero-result page still marshals to JSON "[]" rather than "null" — a null
// response crashes frontend code that iterates the result unconditionally.
func fetchAllPages[T any](c *Client, path string, params url.Values) ([]T, error) {
	all := []T{}
	cursor := ""
	for {
		var p page[T]
		if err := c.get(path, params, cursor, &p); err != nil {
			return nil, err
		}
		all = append(all, p.Results...)
		if p.NextCursor == nil || *p.NextCursor == "" {
			return all, nil
		}
		cursor = *p.NextCursor
	}
}

func (c *Client) get(path string, params url.Values, cursor string, out interface{}) error {
	query := url.Values{}
	for k, v := range params {
		query[k] = v
	}
	if cursor != "" {
		query.Set("cursor", cursor)
	}

	reqURL := baseURL + path
	if len(query) > 0 {
		reqURL += "?" + query.Encode()
	}

	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("todoist API returned status %d", resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

// post issues a JSON-bodied POST. Most Todoist write endpoints return 200
// with a JSON body describing the updated resource, but some (e.g.
// /tasks/{id}/close) return 204 No Content with an empty body — decoding is
// skipped when out is nil or the response is 204.
func (c *Client) post(path string, body interface{}, out interface{}) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("todoist API returned status %d", resp.StatusCode)
	}

	if out == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

// postForm submits a form-encoded POST, needed for the sync endpoint (the
// rest of the API is JSON-bodied, hence the separate helper from post).
func (c *Client) postForm(path string, form url.Values, out interface{}) error {
	req, err := http.NewRequest(http.MethodPost, baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusBadRequest {
		return ErrBadSyncToken
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("todoist API returned status %d", resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

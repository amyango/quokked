// Package todoist is a thin client for the parts of the Todoist API v1
// that the backend needs: listing tasks and listing projects.
package todoist

import (
	"bytes"
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

func fetchAllPages[T any](c *Client, path string, params url.Values) ([]T, error) {
	var all []T
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

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("todoist API returned status %d", resp.StatusCode)
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

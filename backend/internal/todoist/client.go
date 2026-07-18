// Package todoist is a thin client for the parts of the Todoist API v1
// that the backend needs: listing tasks and listing projects.
package todoist

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

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
	ID          string   `json:"id"`
	ProjectID   string   `json:"project_id"`
	SectionID   string   `json:"section_id,omitempty"`
	ParentID    string   `json:"parent_id,omitempty"`
	Content     string   `json:"content"`
	Description string   `json:"description"`
	Checked     bool     `json:"checked"`
	Labels      []string `json:"labels"`
	Priority    int      `json:"priority"`
	Due         *Due     `json:"due"`
	AddedAt     string   `json:"added_at"`
	NoteCount   int      `json:"note_count"`
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

// page mirrors the {"results": [...], "next_cursor": ...} envelope that
// every paginated Todoist API v1 list endpoint returns.
type page[T any] struct {
	Results    []T     `json:"results"`
	NextCursor *string `json:"next_cursor"`
}

func (c *Client) FetchTasks() ([]Task, error) {
	tasks, err := fetchAllPages[Task](c, "/tasks")
	if err != nil {
		return nil, fmt.Errorf("fetch tasks: %w", err)
	}
	return tasks, nil
}

func (c *Client) FetchProjects() ([]Project, error) {
	projects, err := fetchAllPages[Project](c, "/projects")
	if err != nil {
		return nil, fmt.Errorf("fetch projects: %w", err)
	}
	return projects, nil
}

func fetchAllPages[T any](c *Client, path string) ([]T, error) {
	var all []T
	cursor := ""
	for {
		var p page[T]
		if err := c.get(path, cursor, &p); err != nil {
			return nil, err
		}
		all = append(all, p.Results...)
		if p.NextCursor == nil || *p.NextCursor == "" {
			return all, nil
		}
		cursor = *p.NextCursor
	}
}

func (c *Client) get(path, cursor string, out interface{}) error {
	reqURL := baseURL + path
	if cursor != "" {
		reqURL += "?" + url.Values{"cursor": {cursor}}.Encode()
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

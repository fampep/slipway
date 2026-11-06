package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/fampep/slipway/internal/catalog"
	"github.com/fampep/slipway/internal/docker"
	"github.com/go-chi/chi/v5"
)

func (s *Server) resolveContainerName(ctx context.Context, id string) (string, error) {
	inst, err := s.deps.Store.GetInstalled(id)
	if err != nil {
		return "", err
	}
	if inst != nil && inst.ContainerName != "" {
		return inst.ContainerName, nil
	}
	live := s.liveByAppID(ctx)
	if c, ok := live[id]; ok && c.Name != "" {
		return c.Name, nil
	}
	return "", errNotFound
}

type notFoundError struct{}

func (notFoundError) Error() string { return "app not installed" }

var errNotFound = notFoundError{}

func (s *Server) handleGetApp(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	apps, err := s.syncInstalled(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, a := range apps {
		if a.ID == id {
			writeJSON(w, http.StatusOK, a)
			return
		}
	}
	// Not installed — still return catalog draft if present
	if app, ok := s.deps.Catalog.Get(id); ok {
		v := s.catalogToView(app)
		writeJSON(w, http.StatusOK, v)
		return
	}
	writeError(w, http.StatusNotFound, "app not found")
}

func (s *Server) handleAppLogs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	name, err := s.resolveContainerName(r.Context(), id)
	if err != nil || name == "" {
		writeError(w, http.StatusNotFound, "app not installed")
		return
	}
	tail := 200
	if t := r.URL.Query().Get("tail"); t != "" {
		if n, err := strconv.Atoi(t); err == nil {
			tail = n
		}
	}
	logs, err := s.deps.Docker.Logs(r.Context(), name, tail)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": logs, "container": name})
}

func (s *Server) handleAppInspect(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	name, err := s.resolveContainerName(r.Context(), id)
	if err != nil || name == "" {
		writeError(w, http.StatusNotFound, "app not installed")
		return
	}
	info, err := s.deps.Docker.Inspect(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleAppStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	name, err := s.resolveContainerName(r.Context(), id)
	if err != nil || name == "" {
		writeError(w, http.StatusNotFound, "app not installed")
		return
	}
	stats, err := s.deps.Docker.Stats(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleImportPreview(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	prev, err := catalog.PreviewImport(body.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, prev)
}

func (s *Server) handleImportSave(w http.ResponseWriter, r *http.Request) {
	var app catalog.App
	if err := json.NewDecoder(r.Body).Decode(&app); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	app.ID = strings.TrimSpace(strings.ToLower(app.ID))
	if !validAppID(app.ID) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	if strings.TrimSpace(app.Image) == "" {
		writeError(w, http.StatusBadRequest, "image is required")
		return
	}
	if strings.TrimSpace(app.Name) == "" {
		app.Name = app.ID
	}
	app.Custom = true
	if err := s.deps.Catalog.SaveCustom(app); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, s.catalogToView(app))
}

func (s *Server) handleProxySnippet(w http.ResponseWriter, r *http.Request) {
	publicURL, _ := s.deps.Store.GetSetting("public_url")
	host := "YOUR_DOMAIN"
	if publicURL != "" {
		host = strings.TrimPrefix(strings.TrimPrefix(publicURL, "https://"), "http://")
		if i := strings.Index(host, "/"); i >= 0 {
			host = host[:i]
		}
		if i := strings.Index(host, ":"); i >= 0 {
			host = host[:i]
		}
	}
	nginx := `# nginx reverse proxy example for Slipway panel
server {
    listen 80;
    server_name ` + host + `;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`
	caddy := host + ` {
    reverse_proxy 127.0.0.1:8080
}
`
	writeJSON(w, http.StatusOK, map[string]string{
		"nginx": nginx,
		"caddy": caddy,
		"host":  host,
	})
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	publicURL, _ := s.deps.Store.GetSetting("public_url")
	custom := []catalog.App{}
	for _, a := range s.deps.Catalog.List() {
		if a.Custom {
			custom = append(custom, a)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"public_url":  publicURL,
		"custom_apps": custom,
		"version":     1,
	})
}

func (s *Server) handleAppUpdateCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	name, err := s.resolveContainerName(r.Context(), id)
	if err != nil || name == "" {
		writeError(w, http.StatusNotFound, "app not installed")
		return
	}
	image := ""
	if app, ok := s.deps.Catalog.Get(id); ok {
		image = app.Image
	}
	pull := r.URL.Query().Get("pull") != "0"
	check, err := s.deps.Docker.CheckUpdate(r.Context(), name, image, pull)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, check)
}

func (s *Server) handleAppUpdate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	app, ok := s.deps.Catalog.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "app not in catalog")
		return
	}
	inst, err := s.deps.Store.GetInstalled(id)
	if err != nil || inst == nil {
		writeError(w, http.StatusNotFound, "app not installed")
		return
	}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	if isExternalName(inst.ContainerName) {
		writeError(w, http.StatusBadRequest, "external apps: check for updates to pull; recreate the stack outside Slipway")
		return
	}

	flusher, okFlush := w.(http.Flusher)
	if !okFlush {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	encode := func(v any) {
		_ = json.NewEncoder(w).Encode(v)
		flusher.Flush()
	}

	containerID, err := s.deps.Docker.Install(r.Context(), app, s.deps.DataDir, func(ev docker.ProgressEvent) {
		encode(ev)
	})
	if err != nil {
		encode(map[string]string{"status": "error", "stage": "error", "message": err.Error()})
		return
	}
	inst.ContainerID = containerID
	inst.ContainerName = docker.NameFor(id)
	inst.Status = "running"
	_ = s.deps.Store.UpsertInstalled(*inst)
	encode(map[string]any{"status": "ready", "stage": "done", "message": "Updated", "percent": 100})
}

func (s *Server) handleBulkApps(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action string   `json:"action"`
		IDs    []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	action := strings.ToLower(strings.TrimSpace(body.Action))
	if action != "start" && action != "stop" && action != "restart" {
		writeError(w, http.StatusBadRequest, "action must be start, stop, or restart")
		return
	}
	if len(body.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "ids required")
		return
	}
	type result struct {
		ID      string `json:"id"`
		OK      bool   `json:"ok"`
		Error   string `json:"error,omitempty"`
		Status  string `json:"status,omitempty"`
		Running bool   `json:"running,omitempty"`
	}
	out := make([]result, 0, len(body.IDs))
	for _, id := range body.IDs {
		id = strings.TrimSpace(strings.ToLower(id))
		if !validAppID(id) {
			out = append(out, result{ID: id, OK: false, Error: "invalid id"})
			continue
		}
		status, running, err := s.controlOne(r.Context(), id, action)
		if err != nil {
			out = append(out, result{ID: id, OK: false, Error: err.Error()})
			continue
		}
		out = append(out, result{ID: id, OK: true, Status: status, Running: running})
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": out})
}

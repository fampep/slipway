package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fampep/slipway/internal/auth"
	"github.com/fampep/slipway/internal/catalog"
	"github.com/fampep/slipway/internal/docker"
	"github.com/fampep/slipway/internal/store"
	"github.com/go-chi/chi/v5"
)

type appView struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Description   string         `json:"description"`
	Category      string         `json:"category"`
	Icon          string         `json:"icon"`
	Image         string         `json:"image"`
	Installed     bool           `json:"installed"`
	Status        string         `json:"status"`
	Running       bool           `json:"running"`
	ContainerID   string         `json:"container_id,omitempty"`
	ContainerName string         `json:"container_name,omitempty"`
	URL           string         `json:"url,omitempty"`
	WebPort       string         `json:"web_port,omitempty"`
	Ports         []catalog.Port `json:"ports,omitempty"`
	InstalledAt   *time.Time     `json:"installed_at,omitempty"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	needs, _ := s.deps.Auth.NeedsSetup()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"docker":       s.deps.Docker != nil && s.deps.Docker.Available(),
		"setup_needed": needs,
	})
}

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	needs, err := s.deps.Auth.NeedsSetup()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := map[string]any{
		"setup_needed": needs,
		"needsSetup":   needs,
		"docker":       s.deps.Docker != nil && s.deps.Docker.Available(),
	}
	// Only expose suggested host / catalog size during first-run setup.
	if needs {
		out["catalog_count"] = len(s.deps.Catalog.List())
		out["suggested_url"] = "https://198.50.123.153"
	}
	writeJSON(w, http.StatusOK, out)
}

type credsBody struct {
	Username        string `json:"username"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirm_password"`
	PublicURL       string `json:"public_url"`
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	var body credsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.ConfirmPassword != "" && body.ConfirmPassword != body.Password {
		writeError(w, http.StatusBadRequest, "passwords do not match")
		return
	}
	if needs, _ := s.deps.Auth.NeedsSetup(); !needs {
		writeError(w, http.StatusConflict, auth.ErrSetupDone.Error())
		return
	}
	user, token, err := s.deps.Auth.Setup(body.Username, body.Password)
	if err != nil {
		if err == auth.ErrSetupDone {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.PublicURL != "" {
		cleaned, err := sanitizePublicURL(body.PublicURL)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		_ = s.deps.Store.SetSetting("public_url", cleaned)
	}
	s.deps.Auth.SetSessionCookie(w, r, token)
	writeJSON(w, http.StatusCreated, map[string]any{
		"user": map[string]any{"id": user.ID, "username": user.Username},
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body credsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	user, token, err := s.deps.Auth.Login(body.Username, body.Password)
	if err != nil {
		if err == auth.ErrNeedsSetup {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	s.deps.Auth.SetSessionCookie(w, r, token)
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{"id": user.ID, "username": user.Username},
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	_ = s.deps.Auth.Logout(s.deps.Auth.TokenFromRequest(r))
	s.deps.Auth.ClearSessionCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	publicURL, _ := s.deps.Store.GetSetting("public_url")
	writeJSON(w, http.StatusOK, map[string]any{"public_url": publicURL})
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PublicURL string `json:"public_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	cleaned, err := sanitizePublicURL(body.PublicURL)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.deps.Store.SetSetting("public_url", cleaned); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"public_url": cleaned})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, err := s.deps.Auth.UserFromRequest(r)
	if err != nil || user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": user.ID, "username": user.Username})
}

func (s *Server) handleCatalog(w http.ResponseWriter, r *http.Request) {
	installed, _ := s.deps.Store.ListInstalled()
	byID := map[string]store.InstalledApp{}
	for _, a := range installed {
		byID[a.CatalogID] = a
	}
	managed := map[string]docker.ContainerInfo{}
	if s.deps.Docker != nil && s.deps.Docker.Available() {
		if list, err := s.deps.Docker.ListManaged(r.Context()); err == nil {
			for _, c := range list {
				managed[c.AppID] = c
			}
		}
	}
	views := make([]appView, 0)
	for _, app := range s.deps.Catalog.List() {
		v := s.catalogToView(app)
		if inst, ok := byID[app.ID]; ok {
			v.Installed = true
			v.Status = inst.Status
			v.ContainerID = inst.ContainerID
			v.ContainerName = inst.ContainerName
			t := inst.InstalledAt
			v.InstalledAt = &t
			if c, ok := managed[app.ID]; ok {
				v.Status = c.State
				v.Running = c.Running
			}
		}
		views = append(views, v)
	}
	writeJSON(w, http.StatusOK, views)
}

func (s *Server) handleApps(w http.ResponseWriter, r *http.Request) {
	apps, err := s.syncInstalled(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, apps)
}

func (s *Server) handleInstall(w http.ResponseWriter, r *http.Request) {
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
	if existing, _ := s.deps.Store.GetInstalled(id); existing != nil {
		writeError(w, http.StatusConflict, "already installed")
		return
	}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
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

	inst := store.InstalledApp{
		ID:            id,
		CatalogID:     id,
		ContainerID:   containerID,
		ContainerName: docker.NameFor(id),
		Status:        "running",
		InstalledAt:   time.Now().UTC(),
	}
	if err := s.deps.Store.UpsertInstalled(inst); err != nil {
		encode(map[string]string{"status": "error", "message": err.Error()})
		return
	}
	encode(map[string]any{
		"status":  "ready",
		"stage":   "done",
		"message": "Installed",
		"percent": 100,
		"url":     s.webURL(app),
	})
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	s.control(w, r, "start")
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	s.control(w, r, "stop")
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	s.control(w, r, "restart")
}

func (s *Server) control(w http.ResponseWriter, r *http.Request, action string) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
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
	ctx := r.Context()
	target := inst.ContainerName
	switch action {
	case "start":
		err = s.deps.Docker.Start(ctx, target)
		inst.Status = "running"
	case "stop":
		err = s.deps.Docker.Stop(ctx, target)
		inst.Status = "exited"
	case "restart":
		err = s.deps.Docker.Restart(ctx, target)
		inst.Status = "running"
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	_ = s.deps.Store.UpdateInstalledStatus(id, inst.Status)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": inst.Status, "running": inst.Status == "running"})
}

func (s *Server) handleRemove(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	inst, err := s.deps.Store.GetInstalled(id)
	if err != nil || inst == nil {
		writeError(w, http.StatusNotFound, "app not installed")
		return
	}
	if s.deps.Docker != nil && s.deps.Docker.Available() {
		_ = s.deps.Docker.Remove(r.Context(), inst.ContainerName)
	}
	if err := s.deps.Store.DeleteInstalled(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.deps.Metrics.Snapshot(r.Context()))
}

func (s *Server) syncInstalled(ctx context.Context) ([]appView, error) {
	installed, err := s.deps.Store.ListInstalled()
	if err != nil {
		return nil, err
	}
	managed := map[string]docker.ContainerInfo{}
	if s.deps.Docker != nil && s.deps.Docker.Available() {
		if list, err := s.deps.Docker.ListManaged(ctx); err == nil {
			for _, c := range list {
				managed[c.AppID] = c
			}
		}
	}
	out := make([]appView, 0, len(installed))
	for _, inst := range installed {
		app, ok := s.deps.Catalog.Get(inst.CatalogID)
		if !ok {
			app = catalog.App{ID: inst.CatalogID, Name: inst.CatalogID}
		}
		v := s.catalogToViewInstalled(app, inst)
		if c, ok := managed[inst.CatalogID]; ok {
			v.Status = c.State
			v.Running = c.Running
			_ = s.deps.Store.UpdateInstalledStatus(inst.ID, c.State)
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Server) catalogToView(app catalog.App) appView {
	return appView{
		ID:          app.ID,
		Name:        app.Name,
		Description: app.Description,
		Category:    app.Category,
		Icon:        app.Icon,
		Image:       app.Image,
		Ports:       app.Ports,
		WebPort:     app.WebUIPort,
		URL:         s.webURL(app),
	}
}

func (s *Server) catalogToViewInstalled(app catalog.App, inst store.InstalledApp) appView {
	v := s.catalogToView(app)
	v.Installed = true
	v.Status = inst.Status
	v.Running = inst.Status == "running"
	v.ContainerID = inst.ContainerID
	v.ContainerName = inst.ContainerName
	t := inst.InstalledAt
	v.InstalledAt = &t
	return v
}

func (s *Server) webURL(app catalog.App) string {
	port := app.WebUIPort
	if port == "" {
		for _, p := range app.Ports {
			port = p.Host
			break
		}
	}
	if port == "" {
		return ""
	}
	base, _ := s.deps.Store.GetSetting("public_url")
	if base == "" {
		return "http://localhost:" + port
	}
	base = strings.TrimRight(base, "/")
	u, err := url.Parse(base)
	if err != nil || u.Host == "" {
		host := strings.TrimPrefix(strings.TrimPrefix(base, "https://"), "http://")
		return "http://" + host + ":" + port
	}
	host := u.Hostname()
	scheme := u.Scheme
	if scheme == "" {
		scheme = "http"
	}
	return scheme + "://" + host + ":" + port
}

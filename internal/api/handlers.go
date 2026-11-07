package api

import (
	"context"
	"encoding/json"
	"fmt"
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
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	Category       string         `json:"category"`
	Icon           string         `json:"icon"`
	Image          string         `json:"image"`
	Website        string         `json:"website,omitempty"`
	Docs           string         `json:"docs,omitempty"`
	Custom         bool           `json:"custom,omitempty"`
	Source         string         `json:"source,omitempty"`
	Installed      bool           `json:"installed"`
	Status         string         `json:"status"`
	Running        bool           `json:"running"`
	External       bool           `json:"external"`
	Health          string         `json:"health,omitempty"`
	UpdateAvailable bool           `json:"update_available,omitempty"`
	ComposeProject  string         `json:"compose_project,omitempty"`
	ComposeService  string         `json:"compose_service,omitempty"`
	Stack           []stackMember  `json:"stack,omitempty"`
	ContainerID     string         `json:"container_id,omitempty"`
	ContainerName   string         `json:"container_name,omitempty"`
	URL             string         `json:"url,omitempty"`
	WebPort         string         `json:"web_port,omitempty"`
	DefaultPath     string         `json:"default_path,omitempty"`
	Tags            []string       `json:"tags,omitempty"`
	Favorite        bool           `json:"favorite,omitempty"`
	Ports           []catalog.Port `json:"ports,omitempty"`
	Env             map[string]string `json:"env,omitempty"`
	InstalledAt     *time.Time     `json:"installed_at,omitempty"`
}

type stackMember struct {
	Name    string `json:"name"`
	Service string `json:"service,omitempty"`
	State   string `json:"state"`
	Running bool   `json:"running"`
	Health  string `json:"health,omitempty"`
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
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		host := r.Host
		if host == "" {
			host = "localhost:8080"
		}
		out["suggested_url"] = scheme + "://" + host
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
	webhook, _ := s.deps.Store.GetSetting("webhook_url")
	media, _ := s.deps.Store.GetSetting("media_path")
	downloads, _ := s.deps.Store.GetSetting("downloads_path")
	diskWarn, _ := s.deps.Store.GetSetting("disk_warn_percent")
	accent, _ := s.deps.Store.GetSetting("accent")
	autoUpdate, _ := s.deps.Store.GetSetting("auto_update")
	if diskWarn == "" {
		diskWarn = "85"
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	suggested := scheme + "://" + r.Host
	writeJSON(w, http.StatusOK, map[string]any{
		"public_url":        publicURL,
		"webhook_url":       webhook,
		"media_path":        media,
		"downloads_path":    downloads,
		"disk_warn_percent": diskWarn,
		"accent":            accent,
		"auto_update":       autoUpdate == "1",
		"suggested_url":     suggested,
		"version":           Version,
	})
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PublicURL       string `json:"public_url"`
		WebhookURL      string `json:"webhook_url"`
		MediaPath       string `json:"media_path"`
		DownloadsPath   string `json:"downloads_path"`
		DiskWarnPercent string `json:"disk_warn_percent"`
		Accent          string `json:"accent"`
		AutoUpdate      *bool  `json:"auto_update"`
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
	webhook := strings.TrimSpace(body.WebhookURL)
	if webhook != "" {
		if wh, err := sanitizePublicURL(webhook); err == nil {
			webhook = wh
		} else {
			writeError(w, http.StatusBadRequest, "webhook_url invalid")
			return
		}
	}
	_ = s.deps.Store.SetSetting("webhook_url", webhook)
	_ = s.deps.Store.SetSetting("media_path", strings.TrimSpace(body.MediaPath))
	_ = s.deps.Store.SetSetting("downloads_path", strings.TrimSpace(body.DownloadsPath))
	if body.DiskWarnPercent != "" {
		_ = s.deps.Store.SetSetting("disk_warn_percent", body.DiskWarnPercent)
	}
	if body.Accent != "" {
		_ = s.deps.Store.SetSetting("accent", body.Accent)
	}
	if body.AutoUpdate != nil {
		if *body.AutoUpdate {
			_ = s.deps.Store.SetSetting("auto_update", "1")
		} else {
			_ = s.deps.Store.SetSetting("auto_update", "0")
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"public_url":     cleaned,
		"webhook_url":    webhook,
		"media_path":     strings.TrimSpace(body.MediaPath),
		"downloads_path": strings.TrimSpace(body.DownloadsPath),
		"version":        Version,
	})
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
	_ = s.adoptExisting(r.Context())
	installed, _ := s.deps.Store.ListInstalled()
	byID := map[string]store.InstalledApp{}
	for _, a := range installed {
		byID[a.CatalogID] = a
	}
	live := s.liveByAppID(r.Context())
	views := make([]appView, 0)
	for _, app := range s.deps.Catalog.List() {
		v := s.catalogToView(app)
		if inst, ok := byID[app.ID]; ok {
			v.Installed = true
			v.Status = inst.Status
			v.ContainerID = inst.ContainerID
			v.ContainerName = inst.ContainerName
			v.External = isExternalName(inst.ContainerName)
			t := inst.InstalledAt
			v.InstalledAt = &t
			if c, ok := live[app.ID]; ok {
				v.Status = c.State
				v.Running = c.Running
				v.External = !docker.IsSlipwayManaged(c)
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

	// Optional env overrides from JSON body (ignore empty / non-json).
	if r.Body != nil && r.ContentLength != 0 {
		var body struct {
			Env map[string]string `json:"env"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil && len(body.Env) > 0 {
			if app.Env == nil {
				app.Env = map[string]string{}
			}
			for k, v := range body.Env {
				app.Env[k] = v
			}
		}
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

	app = s.applyPathPresets(app)
	containerID, err := s.deps.Docker.Install(r.Context(), app, s.deps.DataDir, func(ev docker.ProgressEvent) {
		encode(ev)
	})
	if err != nil {
		encode(map[string]string{"status": "error", "stage": "error", "message": err.Error()})
		s.notifyWebhook(r.Context(), "install_failed", app.Name+": "+err.Error())
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
	status, running, err := s.controlOne(r.Context(), id, action)
	if err != nil {
		if err == errNotFound {
			writeError(w, http.StatusNotFound, "app not installed")
			return
		}
		if strings.Contains(err.Error(), "docker is not available") {
			writeError(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status, "running": running})
}

func (s *Server) controlOne(ctx context.Context, id, action string) (status string, running bool, err error) {
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		return "", false, fmt.Errorf("docker is not available")
	}
	target, err := s.resolveContainerName(ctx, id)
	if err != nil || target == "" {
		return "", false, errNotFound
	}
	switch action {
	case "start":
		err = s.deps.Docker.Start(ctx, target)
		status = "running"
	case "stop":
		err = s.deps.Docker.Stop(ctx, target)
		status = "exited"
	case "restart":
		err = s.deps.Docker.Restart(ctx, target)
		status = "running"
	default:
		return "", false, fmt.Errorf("unknown action")
	}
	if err != nil {
		return "", false, err
	}
	_ = s.deps.Store.UpdateInstalledStatus(id, status)
	return status, status == "running", nil
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
	// Only destroy containers Slipway itself created. External stacks are unlinked only.
	if s.deps.Docker != nil && s.deps.Docker.Available() && !isExternalName(inst.ContainerName) {
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
	_ = s.adoptExisting(ctx)
	installed, err := s.deps.Store.ListInstalled()
	if err != nil {
		return nil, err
	}
	live := s.liveByAppID(ctx)
	favs := s.favoriteSet(ctx)
	out := make([]appView, 0, len(installed))
	for _, inst := range installed {
		app, ok := s.deps.Catalog.Get(inst.CatalogID)
		if !ok {
			app = catalog.App{ID: inst.CatalogID, Name: inst.CatalogID}
		}
		v := s.catalogToViewInstalled(app, inst)
		v.Favorite = favs[inst.CatalogID]
		if c, ok := live[inst.CatalogID]; ok {
			v.Status = c.State
			v.Running = c.Running
			v.External = !docker.IsSlipwayManaged(c)
			v.ContainerID = c.ID
			v.ContainerName = c.Name
			v.Health = c.Health
			v.ComposeProject = c.ComposeProject
			v.ComposeService = c.ComposeService
			_ = s.deps.Store.UpdateInstalledStatus(inst.ID, c.State)
			if c.ComposeProject != "" && s.deps.Docker != nil {
				if siblings, err := s.deps.Docker.ListStack(ctx, c.ComposeProject); err == nil && len(siblings) > 1 {
					for _, sib := range siblings {
						v.Stack = append(v.Stack, stackMember{
							Name: sib.Name, Service: sib.ComposeService,
							State: sib.State, Running: sib.Running, Health: sib.Health,
						})
					}
				}
			}
		}
		if v.Health == "" && app.HealthURL != "" && v.Running {
			v.Health = s.probeHealthURL(ctx, app.HealthURL)
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Server) liveByAppID(ctx context.Context) map[string]docker.ContainerInfo {
	out := map[string]docker.ContainerInfo{}
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		return out
	}
	list, err := s.deps.Docker.ListAll(ctx)
	if err != nil {
		if managed, err2 := s.deps.Docker.ListManaged(ctx); err2 == nil {
			for _, c := range managed {
				if c.AppID != "" {
					out[c.AppID] = c
				}
			}
		}
		return out
	}
	claimed := map[string]bool{}
	for _, app := range s.deps.Catalog.List() {
		for _, c := range list {
			if claimed[c.ID] {
				continue
			}
			if docker.MatchCatalogApp(app, c) {
				info := c
				if info.AppID == "" {
					info.AppID = app.ID
				}
				out[app.ID] = info
				claimed[c.ID] = true
				break
			}
		}
	}
	return out
}

func (s *Server) adoptExisting(ctx context.Context) error {
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		return nil
	}
	live := s.liveByAppID(ctx)
	for appID, c := range live {
		existing, err := s.deps.Store.GetInstalled(appID)
		if err != nil {
			return err
		}
		if existing != nil {
			// Keep DB pointer fresh when the container name/id changes.
			if existing.ContainerName != c.Name || existing.ContainerID != c.ID {
				existing.ContainerName = c.Name
				existing.ContainerID = c.ID
				existing.Status = c.State
				_ = s.deps.Store.UpsertInstalled(*existing)
			}
			continue
		}
		inst := store.InstalledApp{
			ID:            appID,
			CatalogID:     appID,
			ContainerID:   c.ID,
			ContainerName: c.Name,
			Status:        c.State,
			InstalledAt:   time.Now().UTC(),
		}
		if err := s.deps.Store.UpsertInstalled(inst); err != nil {
			return err
		}
	}
	return nil
}

func isExternalName(name string) bool {
	return name != "" && !strings.HasPrefix(name, "slipway-")
}

func (s *Server) catalogToView(app catalog.App) appView {
	return appView{
		ID:          app.ID,
		Name:        app.Name,
		Description: app.Description,
		Category:    app.Category,
		Icon:        app.Icon,
		Image:       app.Image,
		Website:     app.Website,
		Docs:        app.Docs,
		Custom:      app.Custom,
		Source:      app.Source,
		Ports:       app.Ports,
		WebPort:     app.WebUIPort,
		DefaultPath: app.DefaultPath,
		Tags:        app.Tags,
		Env:         app.Env,
		URL:         s.webURL(app),
	}
}

func (s *Server) catalogToViewInstalled(app catalog.App, inst store.InstalledApp) appView {
	v := s.catalogToView(app)
	v.Installed = true
	v.Status = inst.Status
	v.Running = inst.Status == "running"
	v.External = isExternalName(inst.ContainerName)
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
	path := app.DefaultPath
	if path != "" && !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	base, _ := s.deps.Store.GetSetting("public_url")
	if base == "" {
		return "http://localhost:" + port + path
	}
	base = strings.TrimRight(base, "/")
	u, err := url.Parse(base)
	if err != nil || u.Host == "" {
		host := strings.TrimPrefix(strings.TrimPrefix(base, "https://"), "http://")
		if i := strings.Index(host, "/"); i >= 0 {
			host = host[:i]
		}
		return "http://" + host + ":" + port + path
	}
	host := u.Hostname()
	scheme := u.Scheme
	if scheme == "" {
		scheme = "http"
	}
	return scheme + "://" + host + ":" + port + path
}

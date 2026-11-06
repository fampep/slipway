package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

var Version = "dev"

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"version": Version,
		"name":    "slipway",
	})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Current string `json:"current_password"`
		Next    string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := s.deps.Auth.ChangePassword(user.ID, body.Current, body.Next); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteCustom(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	app, ok := s.deps.Catalog.Get(id)
	if !ok || !app.Custom {
		writeError(w, http.StatusNotFound, "custom app not found")
		return
	}
	if err := s.deps.Catalog.DeleteCustom(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleCheckAllUpdates(w http.ResponseWriter, r *http.Request) {
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	pull := r.URL.Query().Get("pull") != "0"
	apps, err := s.syncInstalled(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	type row struct {
		ID              string `json:"id"`
		Name            string `json:"name"`
		UpdateAvailable bool   `json:"update_available"`
		Error           string `json:"error,omitempty"`
		Image           string `json:"image,omitempty"`
	}
	out := make([]row, 0, len(apps))
	for _, a := range apps {
		if a.ContainerName == "" {
			continue
		}
		image := a.Image
		check, err := s.deps.Docker.CheckUpdate(r.Context(), a.ContainerName, image, pull)
		if err != nil {
			out = append(out, row{ID: a.ID, Name: a.Name, Error: err.Error(), Image: image})
			continue
		}
		out = append(out, row{
			ID: a.ID, Name: a.Name, UpdateAvailable: check.UpdateAvailable, Image: check.Image,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": out})
}

func (s *Server) handlePortCheck(w http.ResponseWriter, r *http.Request) {
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
	used := map[string]string{}
	if s.deps.Docker != nil && s.deps.Docker.Available() {
		list, err := s.deps.Docker.ListAll(r.Context())
		if err == nil {
			for _, c := range list {
				info, err := s.deps.Docker.Inspect(r.Context(), c.Name)
				if err != nil {
					continue
				}
				for _, p := range info.Ports {
					if p.HostPort != "" {
						used[p.HostPort] = c.Name
					}
				}
			}
		}
	}
	conflicts := []map[string]string{}
	for _, p := range app.Ports {
		if other, ok := used[p.Host]; ok && !strings.Contains(other, "slipway-"+app.ID) {
			conflicts = append(conflicts, map[string]string{
				"port": p.Host, "used_by": other,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         len(conflicts) == 0,
		"conflicts":  conflicts,
		"app_ports":  app.Ports,
	})
}

func (s *Server) handleAppProxySnippet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !validAppID(id) {
		writeError(w, http.StatusBadRequest, "invalid app id")
		return
	}
	app, ok := s.deps.Catalog.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "app not found")
		return
	}
	port := app.WebUIPort
	if port == "" && len(app.Ports) > 0 {
		port = app.Ports[0].Host
	}
	if port == "" {
		writeError(w, http.StatusBadRequest, "no web port")
		return
	}
	publicURL, _ := s.deps.Store.GetSetting("public_url")
	host := app.ID + ".local"
	if publicURL != "" {
		uHost := strings.TrimPrefix(strings.TrimPrefix(publicURL, "https://"), "http://")
		if i := strings.Index(uHost, "/"); i >= 0 {
			uHost = uHost[:i]
		}
		if i := strings.Index(uHost, ":"); i >= 0 {
			uHost = uHost[:i]
		}
		if uHost != "" {
			host = app.ID + "." + uHost
		}
	}
	path := app.DefaultPath
	if path == "" {
		path = "/"
	}
	nginx := `# nginx for ` + app.Name + `
server {
    listen 80;
    server_name ` + host + `;
    location / {
        proxy_pass http://127.0.0.1:` + port + path + `;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`
	caddy := host + ` {
    reverse_proxy 127.0.0.1:` + port + `
}
`
	writeJSON(w, http.StatusOK, map[string]string{
		"nginx": nginx,
		"caddy": caddy,
		"host":  host,
		"port":  port,
	})
}

func (s *Server) handleFavorites(w http.ResponseWriter, r *http.Request) {
	raw, _ := s.deps.Store.GetSetting("favorites")
	ids := []string{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &ids)
	}
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"ids": ids})
		return
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	clean := make([]string, 0, len(body.IDs))
	seen := map[string]bool{}
	for _, id := range body.IDs {
		id = strings.TrimSpace(strings.ToLower(id))
		if !validAppID(id) || seen[id] {
			continue
		}
		seen[id] = true
		clean = append(clean, id)
	}
	b, _ := json.Marshal(clean)
	_ = s.deps.Store.SetSetting("favorites", string(b))
	writeJSON(w, http.StatusOK, map[string]any{"ids": clean})
}

func (s *Server) handleOnboarding(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		done, _ := s.deps.Store.GetSetting("onboarding_done")
		writeJSON(w, http.StatusOK, map[string]bool{"done": done == "1"})
		return
	}
	_ = s.deps.Store.SetSetting("onboarding_done", "1")
	writeJSON(w, http.StatusOK, map[string]bool{"done": true})
}

func (s *Server) favoriteSet(ctx context.Context) map[string]bool {
	_ = ctx
	raw, _ := s.deps.Store.GetSetting("favorites")
	ids := []string{}
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &ids)
	}
	out := map[string]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func (s *Server) probeHealthURL(ctx context.Context, healthURL string) string {
	if healthURL == "" {
		return ""
	}
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
	if err != nil {
		return "unknown"
	}
	res, err := client.Do(req)
	if err != nil {
		return "unhealthy"
	}
	defer res.Body.Close()
	if res.StatusCode >= 200 && res.StatusCode < 400 {
		return "healthy"
	}
	return "unhealthy"
}

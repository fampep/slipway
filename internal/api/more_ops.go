package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fampep/slipway/internal/catalog"
	"github.com/fampep/slipway/internal/docker"
	"github.com/go-chi/chi/v5"
)

func (s *Server) handleImportSaveMany(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Apps []catalog.App `json:"apps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	saved := make([]appView, 0, len(body.Apps))
	for _, app := range body.Apps {
		app.ID = strings.TrimSpace(strings.ToLower(app.ID))
		if !validAppID(app.ID) || strings.TrimSpace(app.Image) == "" {
			continue
		}
		if app.Name == "" {
			app.Name = app.ID
		}
		app.Custom = true
		if err := s.deps.Catalog.SaveCustom(app); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		saved = append(saved, s.catalogToView(app))
	}
	writeJSON(w, http.StatusCreated, map[string]any{"apps": saved, "count": len(saved)})
}

func (s *Server) handleAppLogsStream(w http.ResponseWriter, r *http.Request) {
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
	tail := 100
	if t := r.URL.Query().Get("tail"); t != "" {
		if n, e := strconv.Atoi(t); e == nil {
			tail = n
		}
	}
	body, err := s.deps.Docker.LogsFollow(r.Context(), name, tail)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	defer body.Close()

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 2048)
	for {
		select {
		case <-r.Context().Done():
			return
		default:
		}
		n, err := body.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			// decode multiplexed chunks opportunistically
			text := decodeFollowChunk(&buf)
			if text != "" {
				for _, line := range strings.Split(text, "\n") {
					if line == "" {
						continue
					}
					fmt.Fprintf(w, "data: %s\n\n", strings.ReplaceAll(line, "\n", " "))
					flusher.Flush()
				}
			}
		}
		if err != nil {
			if err != io.EOF {
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
				flusher.Flush()
			}
			return
		}
	}
}

func decodeFollowChunk(buf *[]byte) string {
	data := *buf
	if len(data) == 0 {
		return ""
	}
	// If multiplexed, peel complete frames
	var b strings.Builder
	i := 0
	for i+8 <= len(data) {
		stream := data[i]
		if stream > 2 {
			out := string(data)
			*buf = (*buf)[:0]
			return out
		}
		size := int(data[i+4])<<24 | int(data[i+5])<<16 | int(data[i+6])<<8 | int(data[i+7])
		if size < 0 || i+8+size > len(data) {
			break
		}
		i += 8
		b.Write(data[i : i+size])
		i += size
	}
	*buf = append((*buf)[:0], data[i:]...)
	return b.String()
}

func (s *Server) handleUpdateAll(w http.ResponseWriter, r *http.Request) {
	if s.deps.Docker == nil || !s.deps.Docker.Available() {
		writeError(w, http.StatusServiceUnavailable, "docker is not available")
		return
	}
	apps, err := s.syncInstalled(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.WriteHeader(http.StatusOK)
	encode := func(v any) {
		_ = json.NewEncoder(w).Encode(v)
		flusher.Flush()
	}

	for _, a := range apps {
		if a.External || a.ContainerName == "" {
			continue
		}
		app, ok := s.deps.Catalog.Get(a.ID)
		if !ok {
			continue
		}
		check, err := s.deps.Docker.CheckUpdate(r.Context(), a.ContainerName, app.Image, true)
		if err != nil || check == nil || !check.UpdateAvailable {
			encode(map[string]any{"id": a.ID, "status": "skip", "message": "up to date"})
			continue
		}
		encode(map[string]any{"id": a.ID, "status": "updating", "message": "Updating " + a.Name})
		app = s.applyPathPresets(app)
		cid, err := s.deps.Docker.Install(r.Context(), app, s.deps.DataDir, nil)
		if err != nil {
			encode(map[string]any{"id": a.ID, "status": "error", "message": err.Error()})
			s.notifyWebhook(r.Context(), "update_failed", a.Name+": "+err.Error())
			continue
		}
		inst, _ := s.deps.Store.GetInstalled(a.ID)
		if inst != nil {
			inst.ContainerID = cid
			inst.ContainerName = docker.NameFor(a.ID)
			inst.Status = "running"
			_ = s.deps.Store.UpsertInstalled(*inst)
		}
		encode(map[string]any{"id": a.ID, "status": "ready", "message": "Updated " + a.Name})
	}
	encode(map[string]any{"status": "done", "message": "Update queue finished"})
}

func (s *Server) applyPathPresets(app catalog.App) catalog.App {
	media, _ := s.deps.Store.GetSetting("media_path")
	downloads, _ := s.deps.Store.GetSetting("downloads_path")
	if media == "" && downloads == "" {
		return app
	}
	vols := make([]catalog.Volume, len(app.Volumes))
	copy(vols, app.Volumes)
	for i, v := range vols {
		h := v.Host
		if media != "" && (strings.Contains(h, "media") || strings.HasSuffix(h, "/media") || h == "../../media") {
			vols[i].Host = media
		}
		if downloads != "" && (strings.Contains(h, "download") || h == "../../downloads") {
			vols[i].Host = downloads
		}
	}
	app.Volumes = vols
	return app
}

func (s *Server) notifyWebhook(ctx context.Context, kind, message string) {
	urlStr, _ := s.deps.Store.GetSetting("webhook_url")
	if strings.TrimSpace(urlStr) == "" {
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"content": fmt.Sprintf("**Slipway** `%s`: %s", kind, message),
		"text":    fmt.Sprintf("Slipway %s: %s", kind, message),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlStr, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return
	}
	io.Copy(io.Discard, res.Body)
	res.Body.Close()
}

func (s *Server) watchContainers() {
	prev := map[string]string{}
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for range t.C {
		if s.deps.Docker == nil || !s.deps.Docker.Available() {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		list, err := s.deps.Docker.ListAll(ctx)
		cancel()
		if err != nil {
			continue
		}
		for _, c := range list {
			was := prev[c.ID]
			now := c.State
			prev[c.ID] = now
			if was == "running" && now != "running" && now != "" {
				s.notifyWebhook(context.Background(), "container_died", c.Name+" is "+now)
			}
		}
	}
}

func (s *Server) handleChangelog(w http.ResponseWriter, r *http.Request) {
	entries := []map[string]string{
		{"version": Version, "date": "2026-11-07", "summary": "Roadmap batch: stack wizard, live logs, update-all, webhooks, compose paste, path presets"},
		{"version": "alpha", "date": "2026-11-06", "summary": "App detail, import, ops, landing polish, GHCR install"},
	}
	seen, _ := s.deps.Store.GetSetting("changelog_seen")
	writeJSON(w, http.StatusOK, map[string]any{
		"entries": entries,
		"seen":    seen,
		"current": Version,
	})
}

func (s *Server) handleChangelogSeen(w http.ResponseWriter, r *http.Request) {
	_ = s.deps.Store.SetSetting("changelog_seen", Version)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleStackRecommend(w http.ResponseWriter, r *http.Request) {
	order := []string{"prowlarr", "radarr", "sonarr", "bazarr", "jellyseerr", "jellyfin"}
	type item struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Installed   bool   `json:"installed"`
		Running     bool   `json:"running"`
		InCatalog   bool   `json:"in_catalog"`
	}
	live, _ := s.syncInstalled(r.Context())
	byID := map[string]appView{}
	for _, a := range live {
		byID[a.ID] = a
	}
	out := make([]item, 0, len(order))
	for _, id := range order {
		it := item{ID: id, InCatalog: false}
		if app, ok := s.deps.Catalog.Get(id); ok {
			it.Name = app.Name
			it.Description = app.Description
			it.InCatalog = true
		} else {
			it.Name = id
		}
		if a, ok := byID[id]; ok {
			it.Installed = true
			it.Running = a.Running
		}
		out = append(out, it)
	}
	media, _ := s.deps.Store.GetSetting("media_path")
	downloads, _ := s.deps.Store.GetSetting("downloads_path")
	writeJSON(w, http.StatusOK, map[string]any{
		"apps":           out,
		"media_path":     media,
		"downloads_path": downloads,
	})
}

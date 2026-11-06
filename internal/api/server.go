package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fampep/slipway/internal/auth"
	"github.com/fampep/slipway/internal/catalog"
	"github.com/fampep/slipway/internal/docker"
	"github.com/fampep/slipway/internal/metrics"
	"github.com/fampep/slipway/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Deps struct {
	Store   *store.Store
	Catalog *catalog.Catalog
	Docker  *docker.Client
	Auth    *auth.Service
	Metrics *metrics.Service
	DataDir string
	WebDir  string
}

type Server struct {
	deps Deps
	hub  *Hub
}

func New(deps Deps) *Server {
	s := &Server{
		deps: deps,
		hub:  NewHub(),
	}
	go s.hub.Run()
	go s.broadcastLoop()
	return s
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(securityHeaders)
	r.Use(maxBody(1 << 20)) // 1 MiB
	r.Use(middleware.Timeout(180 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:8080",
			"http://127.0.0.1:8080",
		},
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "" {
				return true
			}
			host := r.Host
			return host != "" && (strings.EqualFold(origin, "http://"+host) || strings.EqualFold(origin, "https://"+host))
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", s.handleHealth)

		r.Get("/setup", s.handleSetupStatus)
		r.Get("/setup/status", s.handleSetupStatus)
		r.Post("/setup", s.handleSetup)
		r.Post("/login", s.handleLogin)
		r.Post("/logout", s.handleLogout)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Get("/me", s.handleMe)
			r.Get("/settings", s.handleGetSettings)
			r.Put("/settings", s.handlePutSettings)
			r.Get("/catalog", s.handleCatalog)
			r.Get("/apps", s.handleApps)
			r.Post("/apps/{id}/install", s.handleInstall)
			r.Post("/apps/{id}/start", s.handleStart)
			r.Post("/apps/{id}/stop", s.handleStop)
			r.Post("/apps/{id}/restart", s.handleRestart)
			r.Delete("/apps/{id}", s.handleRemove)
			r.Get("/metrics", s.handleMetrics)
			r.Get("/ws", s.handleWS)
		})
	})

	s.mountWeb(r)
	return r
}

func (s *Server) mountWeb(r chi.Router) {
	webDir := s.deps.WebDir
	if webDir == "" {
		webDir = "./web/dist"
	}
	index := filepath.Join(webDir, "index.html")
	fileServer := http.FileServer(http.Dir(webDir))

	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api") {
			http.NotFound(w, req)
			return
		}
		rel := strings.TrimPrefix(req.URL.Path, "/")
		if rel != "" {
			if full, ok := safeJoin(webDir, rel); ok {
				if info, err := os.Stat(full); err == nil && !info.IsDir() {
					fileServer.ServeHTTP(w, req)
					return
				}
			}
		}
		if _, err := os.Stat(index); err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(fallbackHTML))
			return
		}
		http.ServeFile(w, req, index)
	})
}

const fallbackHTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Slipway</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e8eef7;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:40rem;padding:2rem}a{color:#2fe0c5}</style></head>
<body><main><h1>Slipway</h1><p>API is running. Build the UI with <code>npm run build</code> in <code>web/</code>.</p>
<p><a href="/api/health">/api/health</a></p></main></body></html>`

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := s.deps.Auth.UserFromRequest(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "session error")
			return
		}
		if user == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey{}, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type userCtxKey struct{}

func (s *Server) broadcastLoop() {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for range t.C {
		if n, err := s.deps.Store.UserCount(); err != nil || n == 0 {
			continue
		}
		s.hub.Broadcast(s.livePayload())
	}
}

func (s *Server) livePayload() map[string]any {
	ctx := context.Background()
	snap := s.deps.Metrics.Snapshot(ctx)
	apps, _ := s.syncInstalled(ctx)
	return map[string]any{
		"type":    "live",
		"metrics": snap,
		"apps":    apps,
		"docker":  s.deps.Docker != nil && s.deps.Docker.Available(),
	}
}

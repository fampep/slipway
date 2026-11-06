package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/fampep/slipway/internal/api"
	"github.com/fampep/slipway/internal/auth"
	"github.com/fampep/slipway/internal/catalog"
	"github.com/fampep/slipway/internal/docker"
	"github.com/fampep/slipway/internal/metrics"
	"github.com/fampep/slipway/internal/store"
)

func main() {
	addr := flag.String("addr", envFirst("APPBOX_ADDR", "SLIPWAY_ADDR", ":8080"), "HTTP listen address")
	dataDir := flag.String("data", envFirst("APPBOX_DATA", "SLIPWAY_DATA", "./data"), "data directory for SQLite and volumes")
	catalogDir := flag.String("catalog", envFirst("APPBOX_CATALOG", "SLIPWAY_CATALOG", "./catalog"), "path to app catalog YAML files")
	webDir := flag.String("web", envFirst("APPBOX_WEB", "SLIPWAY_WEB", "./web/dist"), "path to built web UI")
	flag.Parse()

	if err := os.MkdirAll(*dataDir, 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}
	_ = os.MkdirAll(filepath.Join(*dataDir, "media"), 0o755)
	_ = os.MkdirAll(filepath.Join(*dataDir, "downloads"), 0o755)

	dbPath := filepath.Join(*dataDir, "appbox.db")
	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	cat, err := catalog.Load(*catalogDir)
	if err != nil {
		log.Fatalf("load catalog: %v", err)
	}
	log.Printf("catalog: %d apps", len(cat.List()))

	cli, err := docker.New()
	if err != nil {
		log.Printf("warning: docker unavailable: %v", err)
	} else if cli.Available() {
		log.Printf("docker connected")
	}
	defer func() {
		if cli != nil {
			_ = cli.Close()
		}
	}()

	authSvc := auth.New(st)
	metricsSvc := metrics.New(cli)
	srv := api.New(api.Deps{
		Store:   st,
		Catalog: cat,
		Docker:  cli,
		Auth:    authSvc,
		Metrics: metricsSvc,
		DataDir: *dataDir,
		WebDir:  *webDir,
	})

	log.Printf("Appbox listening on %s", *addr)
	if err := http.ListenAndServe(*addr, srv.Router()); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envFirst(primary, secondary, fallback string) string {
	if v := os.Getenv(primary); v != "" {
		return v
	}
	return envOr(secondary, fallback)
}
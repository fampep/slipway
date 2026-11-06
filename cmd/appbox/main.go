package main

import (
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/fampep/slipway/internal/api"
	"github.com/fampep/slipway/internal/auth"
	"github.com/fampep/slipway/internal/catalog"
	"github.com/fampep/slipway/internal/docker"
	"github.com/fampep/slipway/internal/metrics"
	"github.com/fampep/slipway/internal/store"
)

// Set via -ldflags "-X main.version=..."
var version = "dev"

func main() {
	api.Version = version
	if v := os.Getenv("SLIPWAY_VERSION"); v != "" {
		api.Version = v
		version = v
	}

	addr := flag.String("addr", envFirst("APPBOX_ADDR", "SLIPWAY_ADDR", ":8080"), "HTTP listen address")
	dataDir := flag.String("data", envFirst("APPBOX_DATA", "SLIPWAY_DATA", "./data"), "data directory for SQLite and volumes")
	catalogDir := flag.String("catalog", envFirst("APPBOX_CATALOG", "SLIPWAY_CATALOG", "./catalog"), "path to app catalog YAML files")
	webDir := flag.String("web", envFirst("APPBOX_WEB", "SLIPWAY_WEB", "./web/dist"), "path to built web UI")
	flag.Parse()

	*addr = applyBind(*addr, os.Getenv("SLIPWAY_BIND"))

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

	customCatalog := filepath.Join(*dataDir, "catalog", "custom")
	_ = os.MkdirAll(customCatalog, 0o755)
	cat, err := catalog.LoadWithCustom(*catalogDir, customCatalog)
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

	log.Printf("Slipway %s listening on %s", version, *addr)
	if err := http.ListenAndServe(*addr, srv.Router()); err != nil {
		log.Fatal(err)
	}
}

// applyBind forces 127.0.0.1 or 0.0.0.0 while keeping the port from addr.
func applyBind(addr, bind string) string {
	bind = strings.TrimSpace(bind)
	if bind == "" {
		return addr
	}
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		// addr may be ":8080"
		if strings.HasPrefix(addr, ":") {
			port = strings.TrimPrefix(addr, ":")
		} else {
			return addr
		}
	}
	switch bind {
	case "127.0.0.1", "localhost", "loopback":
		return net.JoinHostPort("127.0.0.1", port)
	case "0.0.0.0", "all", "*":
		return net.JoinHostPort("0.0.0.0", port)
	default:
		if strings.Contains(bind, ":") {
			return bind
		}
		return net.JoinHostPort(bind, port)
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

package catalog

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

type Port struct {
	Host      string `yaml:"host" json:"host"`
	Container string `yaml:"container" json:"container"`
	Protocol  string `yaml:"protocol" json:"protocol"`
}

type Volume struct {
	Host      string `yaml:"host" json:"host"`
	Container string `yaml:"container" json:"container"`
	ReadOnly  bool   `yaml:"read_only" json:"read_only"`
}

type App struct {
	ID          string            `yaml:"id" json:"id"`
	Name        string            `yaml:"name" json:"name"`
	Description string            `yaml:"description" json:"description"`
	Category    string            `yaml:"category" json:"category"`
	Image       string            `yaml:"image" json:"image"`
	Icon        string            `yaml:"icon" json:"icon"`
	Website     string            `yaml:"website" json:"website,omitempty"`
	Docs        string            `yaml:"docs" json:"docs,omitempty"`
	DefaultPath string            `yaml:"default_path" json:"default_path,omitempty"`
	HealthURL   string            `yaml:"health_url" json:"health_url,omitempty"`
	Tags        []string          `yaml:"tags" json:"tags,omitempty"`
	Ports       []Port            `yaml:"ports" json:"ports"`
	Volumes     []Volume          `yaml:"volumes" json:"volumes"`
	Env         map[string]string `yaml:"env" json:"env"`
	Restart     string            `yaml:"restart" json:"restart"`
	WebUIPort   string            `yaml:"webui_port" json:"webui_port"`
	Privileged  bool              `yaml:"privileged" json:"privileged"`
	NetworkMode string            `yaml:"network_mode" json:"network_mode"`
	CapAdd      []string          `yaml:"cap_add" json:"cap_add"`
	StopTimeout int               `yaml:"stop_timeout" json:"stop_timeout"`
	Custom      bool              `yaml:"-" json:"custom,omitempty"`
	Source      string            `yaml:"source" json:"source,omitempty"`
}

type Catalog struct {
	mu        sync.RWMutex
	apps      map[string]App
	builtin   string
	customDir string
}

func Load(dir string) (*Catalog, error) {
	return LoadWithCustom(dir, "")
}

func LoadWithCustom(builtinDir, customDir string) (*Catalog, error) {
	c := &Catalog{
		apps:      map[string]App{},
		builtin:   builtinDir,
		customDir: customDir,
	}
	if err := c.reload(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Catalog) reload() error {
	apps := map[string]App{}
	if err := loadDir(c.builtin, apps, false); err != nil {
		return err
	}
	if c.customDir != "" {
		_ = os.MkdirAll(c.customDir, 0o755)
		if err := loadDir(c.customDir, apps, true); err != nil {
			return err
		}
	}
	c.mu.Lock()
	c.apps = apps
	c.mu.Unlock()
	return nil
}

func loadDir(dir string, into map[string]App, custom bool) error {
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read catalog dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
			continue
		}
		path := filepath.Join(dir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var app App
		if err := yaml.Unmarshal(data, &app); err != nil {
			return fmt.Errorf("%s: %w", e.Name(), err)
		}
		if app.ID == "" {
			return fmt.Errorf("%s: missing id", e.Name())
		}
		if app.Restart == "" {
			app.Restart = "unless-stopped"
		}
		if app.Icon == "" {
			app.Icon = app.ID
		}
		if app.Category == "" {
			app.Category = "custom"
		}
		app.Custom = custom
		into[app.ID] = app
	}
	return nil
}

func (c *Catalog) Get(id string) (App, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	app, ok := c.apps[id]
	return app, ok
}

func (c *Catalog) List() []App {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]App, 0, len(c.apps))
	for _, a := range c.apps {
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Category == out[j].Category {
			return out[i].Name < out[j].Name
		}
		return out[i].Category < out[j].Category
	})
	return out
}

func (c *Catalog) CustomDir() string { return c.customDir }

func (c *Catalog) SaveCustom(app App) error {
	if c.customDir == "" {
		return fmt.Errorf("custom catalog not configured")
	}
	if app.ID == "" {
		return fmt.Errorf("missing id")
	}
	if app.Restart == "" {
		app.Restart = "unless-stopped"
	}
	app.Custom = true
	if err := os.MkdirAll(c.customDir, 0o755); err != nil {
		return err
	}
	data, err := yaml.Marshal(&app)
	if err != nil {
		return err
	}
	path := filepath.Join(c.customDir, app.ID+".yaml")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	return c.reload()
}

func (c *Catalog) DeleteCustom(id string) error {
	if c.customDir == "" {
		return fmt.Errorf("custom catalog not configured")
	}
	path := filepath.Join(c.customDir, id+".yaml")
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return c.reload()
}

func (c *Catalog) Reload() error { return c.reload() }

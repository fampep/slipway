package catalog

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

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
	Ports       []Port            `yaml:"ports" json:"ports"`
	Volumes     []Volume          `yaml:"volumes" json:"volumes"`
	Env         map[string]string `yaml:"env" json:"env"`
	Restart     string            `yaml:"restart" json:"restart"`
	WebUIPort   string            `yaml:"webui_port" json:"webui_port"`
	Privileged  bool              `yaml:"privileged" json:"privileged"`
	NetworkMode string            `yaml:"network_mode" json:"network_mode"`
	CapAdd      []string          `yaml:"cap_add" json:"cap_add"`
	StopTimeout int               `yaml:"stop_timeout" json:"stop_timeout"`
}

type Catalog struct {
	apps map[string]App
}

func Load(dir string) (*Catalog, error) {
	c := &Catalog{apps: map[string]App{}}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read catalog dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() || (!strings.HasSuffix(e.Name(), ".yaml") && !strings.HasSuffix(e.Name(), ".yml")) {
			continue
		}
		path := filepath.Join(dir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var app App
		if err := yaml.Unmarshal(data, &app); err != nil {
			return nil, fmt.Errorf("%s: %w", e.Name(), err)
		}
		if app.ID == "" {
			return nil, fmt.Errorf("%s: missing id", e.Name())
		}
		if app.Restart == "" {
			app.Restart = "unless-stopped"
		}
		if app.Icon == "" {
			app.Icon = app.ID
		}
		c.apps[app.ID] = app
	}
	return c, nil
}

func (c *Catalog) Get(id string) (App, bool) {
	app, ok := c.apps[id]
	return app, ok
}

func (c *Catalog) List() []App {
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

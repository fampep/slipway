package catalog

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"

	"gopkg.in/yaml.v3"
)

var httpClient = &http.Client{Timeout: 20 * time.Second}

type ImportPreview struct {
	App      App      `json:"app"`
	Warnings []string `json:"warnings,omitempty"`
	Source   string   `json:"source"`
}

// PreviewImport builds a draft catalog app from a GitHub repo, compose URL, or image ref.
func PreviewImport(raw string) (*ImportPreview, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("paste a GitHub link, compose URL, or image name")
	}

	switch {
	case strings.Contains(raw, "github.com"):
		return previewFromGitHub(raw)
	case strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://"):
		return previewFromComposeURL(raw)
	case looksLikeImage(raw):
		return previewFromImage(raw)
	default:
		return nil, fmt.Errorf("unsupported source — use a GitHub URL, compose URL, or image reference")
	}
}

func looksLikeImage(s string) bool {
	if strings.Contains(s, "github.com") {
		return false
	}
	if strings.HasPrefix(s, "ghcr.io/") || strings.HasPrefix(s, "docker.io/") || strings.HasPrefix(s, "lscr.io/") || strings.HasPrefix(s, "quay.io/") {
		return true
	}
	if strings.Contains(s, "://") {
		return false
	}
	return strings.Contains(s, "/") && !strings.Contains(s, " ")
}

func previewFromImage(image string) (*ImportPreview, error) {
	image = strings.TrimSpace(image)
	id := slugFromImage(image)
	app := App{
		ID:          id,
		Name:        humanize(id),
		Description: "Imported container image",
		Category:    "custom",
		Image:       image,
		WebUIPort:   "8080",
		Ports:       []Port{{Host: "8080", Container: "8080"}},
		Restart:     "unless-stopped",
		Source:      image,
		Custom:      true,
	}
	return &ImportPreview{
		App:      app,
		Source:   image,
		Warnings: []string{"Confirm ports before installing — defaults to 8080."},
	}, nil
}

func previewFromComposeURL(rawURL string) (*ImportPreview, error) {
	body, err := fetchText(rawURL)
	if err != nil {
		return nil, err
	}
	app, warns, err := parseCompose(body, rawURL)
	if err != nil {
		return nil, err
	}
	return &ImportPreview{App: app, Source: rawURL, Warnings: warns}, nil
}

func previewFromGitHub(raw string) (*ImportPreview, error) {
	owner, repo, path, branch, err := parseGitHubURL(raw)
	if err != nil {
		return nil, err
	}
	var candidates []string
	if path != "" && (strings.HasSuffix(path, ".yml") || strings.HasSuffix(path, ".yaml")) {
		candidates = append(candidates, githubRawURL(owner, repo, branch, path))
	} else {
		for _, b := range uniqueStrings(branch, "main", "master") {
			for _, f := range []string{"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"} {
				candidates = append(candidates, githubRawURL(owner, repo, b, f))
			}
		}
	}

	var lastErr error
	for _, u := range candidates {
		body, err := fetchText(u)
		if err != nil {
			lastErr = err
			continue
		}
		app, warns, err := parseCompose(body, u)
		if err != nil {
			lastErr = err
			continue
		}
		if app.Icon == "" {
			app.Icon = fmt.Sprintf("https://avatars.githubusercontent.com/%s", owner)
		}
		if app.Website == "" {
			app.Website = fmt.Sprintf("https://github.com/%s/%s", owner, repo)
		}
		app.Source = fmt.Sprintf("https://github.com/%s/%s", owner, repo)
		warns = append(warns, "Parsed from GitHub compose — review ports and volumes.")
		return &ImportPreview{App: app, Source: u, Warnings: warns}, nil
	}

	img := fmt.Sprintf("ghcr.io/%s/%s:latest", strings.ToLower(owner), strings.ToLower(repo))
	prev, err := previewFromImage(img)
	if err != nil {
		if lastErr != nil {
			return nil, fmt.Errorf("could not find compose on GitHub (%v)", lastErr)
		}
		return nil, err
	}
	prev.App.Icon = fmt.Sprintf("https://avatars.githubusercontent.com/%s", owner)
	prev.App.Website = fmt.Sprintf("https://github.com/%s/%s", owner, repo)
	prev.App.Source = prev.App.Website
	prev.Warnings = append(prev.Warnings, "No compose file found — drafted from image guess. Edit before install.")
	return prev, nil
}

func parseGitHubURL(raw string) (owner, repo, path, branch string, err error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", "", "", "", fmt.Errorf("invalid GitHub URL")
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 2 {
		return "", "", "", "", fmt.Errorf("GitHub URL must be github.com/owner/repo")
	}
	owner, repo = parts[0], strings.TrimSuffix(parts[1], ".git")
	branch = "main"
	if len(parts) >= 4 && (parts[2] == "blob" || parts[2] == "tree") {
		branch = parts[3]
		if len(parts) > 4 {
			path = strings.Join(parts[4:], "/")
		}
	}
	return owner, repo, path, branch, nil
}

func githubRawURL(owner, repo, branch, path string) string {
	return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", owner, repo, branch, path)
}

func fetchText(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("invalid URL")
	}
	req, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "slipway-import/1.0")
	res, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("fetch failed: %s", res.Status)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func parseCompose(body, source string) (App, []string, error) {
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(body), &doc); err != nil {
		return App{}, nil, fmt.Errorf("invalid compose YAML: %w", err)
	}
	services, _ := doc["services"].(map[string]any)
	if len(services) == 0 {
		return App{}, nil, fmt.Errorf("compose has no services")
	}

	var (
		svcName string
		svc     map[string]any
	)
	for name, raw := range services {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if _, hasImg := m["image"]; !hasImg {
			continue
		}
		svcName, svc = name, m
		if ports, ok := m["ports"]; ok {
			if arr, ok := ports.([]any); ok && len(arr) > 0 {
				break
			}
		}
	}
	if svc == nil {
		return App{}, nil, fmt.Errorf("no service with an image found")
	}

	image, _ := svc["image"].(string)
	if image == "" {
		return App{}, nil, fmt.Errorf("service has no image")
	}

	id := slug(svcName)
	if id == "" {
		id = slugFromImage(image)
	}
	app := App{
		ID:          id,
		Name:        humanize(id),
		Description: "Imported from compose",
		Category:    "custom",
		Image:       image,
		Restart:     "unless-stopped",
		Source:      source,
		Custom:      true,
		Env:         map[string]string{},
	}
	var warns []string

	if ports, ok := svc["ports"].([]any); ok {
		for _, p := range ports {
			host, cont := splitPort(fmt.Sprint(p))
			if cont == "" {
				continue
			}
			if host == "" {
				host = cont
			}
			app.Ports = append(app.Ports, Port{Host: host, Container: cont})
			if app.WebUIPort == "" {
				app.WebUIPort = host
			}
		}
	}
	if len(app.Ports) == 0 {
		app.Ports = []Port{{Host: "8080", Container: "8080"}}
		app.WebUIPort = "8080"
		warns = append(warns, "No ports in compose — defaulted to 8080.")
	}

	if envs, ok := svc["environment"]; ok {
		switch e := envs.(type) {
		case map[string]any:
			for k, v := range e {
				app.Env[k] = fmt.Sprint(v)
			}
		case []any:
			for _, item := range e {
				s := fmt.Sprint(item)
				if i := strings.IndexByte(s, '='); i > 0 {
					app.Env[s[:i]] = s[i+1:]
				}
			}
		}
	}

	if vols, ok := svc["volumes"].([]any); ok {
		for i, v := range vols {
			s := fmt.Sprint(v)
			parts := strings.Split(s, ":")
			if len(parts) < 2 {
				continue
			}
			hostPath := parts[0]
			contPath := parts[1]
			if strings.HasPrefix(hostPath, "/") || strings.Contains(hostPath, `:\`) {
				hostPath = fmt.Sprintf("./vol%d", i)
				warns = append(warns, "Host path remapped into Slipway data for safety.")
			}
			ro := len(parts) > 2 && parts[2] == "ro"
			app.Volumes = append(app.Volumes, Volume{Host: hostPath, Container: contPath, ReadOnly: ro})
		}
	}

	_ = svcName
	return app, warns, nil
}

func splitPort(spec string) (host, container string) {
	spec = strings.Trim(spec, `"'`)
	// strip protocol /ip
	if i := strings.LastIndex(spec, "/"); i >= 0 && !strings.Contains(spec[i+1:], ":") {
		spec = spec[:i]
	}
	parts := strings.Split(spec, ":")
	switch len(parts) {
	case 1:
		return "", parts[0]
	case 2:
		return parts[0], parts[1]
	default:
		// ip:host:container
		return parts[len(parts)-2], parts[len(parts)-1]
	}
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlug.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 48 {
		s = s[:48]
	}
	return s
}

func slugFromImage(image string) string {
	image = strings.TrimSpace(image)
	if i := strings.Index(image, "@"); i >= 0 {
		image = image[:i]
	}
	if i := strings.LastIndex(image, ":"); i >= 0 && !strings.Contains(image[i+1:], "/") {
		image = image[:i]
	}
	if i := strings.LastIndex(image, "/"); i >= 0 {
		image = image[i+1:]
	}
	s := slug(image)
	if s == "" {
		return "custom-app"
	}
	return s
}

func humanize(id string) string {
	parts := strings.Split(id, "-")
	for i, p := range parts {
		if p == "" {
			continue
		}
		r := []rune(p)
		r[0] = unicode.ToUpper(r[0])
		parts[i] = string(r)
	}
	return strings.Join(parts, " ")
}

func uniqueStrings(vals ...string) []string {
	seen := map[string]bool{}
	var out []string
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

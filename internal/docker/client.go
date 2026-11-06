package docker

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fampep/slipway/internal/catalog"
)

const labelManaged = "slipway.managed"
const labelAppID = "slipway.app_id"

type Client struct {
	http *http.Client
	base string
}

type ProgressEvent struct {
	Status  string `json:"status"`
	Stage   string `json:"stage"`
	Message string `json:"message"`
	Percent int    `json:"percent,omitempty"`
}

type ContainerInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	Status  string `json:"status"`
	State   string `json:"state"`
	AppID   string `json:"app_id"`
	Running bool   `json:"running"`
	Managed bool   `json:"managed"`
}

func New() (*Client, error) {
	httpClient, base, err := newHTTPClient(os.Getenv("DOCKER_HOST"))
	if err != nil {
		return nil, err
	}
	c := &Client{http: httpClient, base: base}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := c.Ping(ctx); err != nil {
		return &Client{http: c.http, base: c.base}, err
	}
	return c, nil
}

func (c *Client) Available() bool {
	if c == nil || c.http == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return c.Ping(ctx) == nil
}

func (c *Client) Close() error { return nil }

func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/_ping", nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("docker ping: %s", res.Status)
	}
	return nil
}

func containerName(appID string) string { return "slipway-" + appID }
func NameFor(appID string) string       { return containerName(appID) }

func (c *Client) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = strings.NewReader(string(b))
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rdr)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return fmt.Errorf("docker %s %s: %s — %s", method, path, res.Status, strings.TrimSpace(string(data)))
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

func (c *Client) Install(ctx context.Context, app catalog.App, dataDir string, progress func(ProgressEvent)) (string, error) {
	if !c.Available() {
		return "", fmt.Errorf("docker not available")
	}
	emit := func(stage, msg string, pct int) {
		if progress != nil {
			progress(ProgressEvent{Status: stage, Stage: stage, Message: msg, Percent: pct})
		}
	}

	emit("pulling", "Pulling image "+app.Image, 5)
	if err := c.pullImage(ctx, app.Image, progress); err != nil {
		return "", err
	}

	binds, err := prepareVolumes(app, dataDir)
	if err != nil {
		return "", err
	}

	env := make([]string, 0, len(app.Env))
	for k, v := range app.Env {
		if v == "$GENERATE" || v == "generate" {
			secret, err := generateSecret()
			if err != nil {
				return "", err
			}
			v = secret
			secretPath := filepath.Join(dataDir, "apps", app.ID, strings.ToLower(k)+".txt")
			_ = os.MkdirAll(filepath.Dir(secretPath), 0o755)
			_ = os.WriteFile(secretPath, []byte(v+"\n"), 0o600)
		}
		env = append(env, k+"="+v)
	}

	exposed := map[string]struct{}{}
	portBindings := map[string][]map[string]string{}
	for _, p := range app.Ports {
		proto := p.Protocol
		if proto == "" {
			proto = "tcp"
		}
		key := p.Container + "/" + proto
		exposed[key] = struct{}{}
		portBindings[key] = append(portBindings[key], map[string]string{
			"HostIp":   "0.0.0.0",
			"HostPort": p.Host,
		})
	}

	name := containerName(app.ID)
	_ = c.RemoveByName(ctx, name)

	hostConfig := map[string]any{
		"Binds":        binds,
		"PortBindings": portBindings,
		"RestartPolicy": map[string]any{
			"Name": app.Restart,
		},
		"Privileged": app.Privileged,
		"CapAdd":     app.CapAdd,
	}
	if app.NetworkMode != "" {
		hostConfig["NetworkMode"] = app.NetworkMode
	}

	cfg := map[string]any{
		"Image":        app.Image,
		"Env":          env,
		"ExposedPorts": exposed,
		"Labels": map[string]string{
			labelManaged: "true",
			labelAppID:   app.ID,
		},
		"HostConfig": hostConfig,
	}

	emit("creating", "Creating container", 80)
	var created struct {
		ID string `json:"Id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/containers/create?name="+url.QueryEscape(name), cfg, &created); err != nil {
		return "", fmt.Errorf("create container: %w", err)
	}

	emit("starting", "Starting container", 90)
	if err := c.doJSON(ctx, http.MethodPost, "/containers/"+created.ID+"/start", nil, nil); err != nil {
		return "", fmt.Errorf("start container: %w", err)
	}
	emit("ready", "Installed", 100)
	return created.ID, nil
}

func generateSecret() (string, error) {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

func (c *Client) pullImage(ctx context.Context, ref string, progress func(ProgressEvent)) error {
	image, tag := ref, "latest"
	if i := strings.LastIndex(ref, ":"); i > 0 && !strings.Contains(ref[i:], "/") {
		image, tag = ref[:i], ref[i+1:]
	}
	q := url.Values{"fromImage": {image}, "tag": {tag}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/images/create?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("pull image: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(res.Body)
		return fmt.Errorf("pull image: %s %s", res.Status, string(b))
	}
	dec := json.NewDecoder(res.Body)
	for {
		var msg map[string]any
		if err := dec.Decode(&msg); err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
		if progress != nil {
			status, _ := msg["status"].(string)
			if status != "" {
				progress(ProgressEvent{Status: "pulling", Stage: "pull", Message: status, Percent: 40})
			}
		}
	}
	return nil
}

func prepareVolumes(app catalog.App, dataDir string) ([]string, error) {
	binds := make([]string, 0, len(app.Volumes))
	for _, v := range app.Volumes {
		host := v.Host
		if strings.HasPrefix(host, "./") || strings.HasPrefix(host, "../") || (!filepath.IsAbs(host) && !strings.HasPrefix(host, "/")) {
			host = filepath.Clean(filepath.Join(dataDir, "apps", app.ID, host))
		}
		if err := os.MkdirAll(host, 0o755); err != nil {
			return nil, err
		}
		spec := host + ":" + v.Container
		if v.ReadOnly {
			spec += ":ro"
		}
		binds = append(binds, spec)
	}
	return binds, nil
}

func (c *Client) RemoveByName(ctx context.Context, name string) error {
	return c.doJSON(ctx, http.MethodDelete, "/containers/"+name+"?force=true", nil, nil)
}

func (c *Client) Start(ctx context.Context, idOrName string) error {
	return c.doJSON(ctx, http.MethodPost, "/containers/"+idOrName+"/start", nil, nil)
}

func (c *Client) Stop(ctx context.Context, idOrName string) error {
	return c.doJSON(ctx, http.MethodPost, "/containers/"+idOrName+"/stop?t=20", nil, nil)
}

func (c *Client) Restart(ctx context.Context, idOrName string) error {
	return c.doJSON(ctx, http.MethodPost, "/containers/"+idOrName+"/restart?t=20", nil, nil)
}

func (c *Client) Remove(ctx context.Context, idOrName string) error {
	_ = c.Stop(ctx, idOrName)
	return c.doJSON(ctx, http.MethodDelete, "/containers/"+idOrName+"?force=true", nil, nil)
}

func (c *Client) ListManaged(ctx context.Context) ([]ContainerInfo, error) {
	filters, _ := json.Marshal(map[string][]string{"label": {labelManaged + "=true"}})
	path := "/containers/json?all=1&filters=" + url.QueryEscape(string(filters))
	return c.listContainers(ctx, path)
}

func (c *Client) ListAll(ctx context.Context) ([]ContainerInfo, error) {
	return c.listContainers(ctx, "/containers/json?all=1")
}

func (c *Client) listContainers(ctx context.Context, path string) ([]ContainerInfo, error) {
	var list []struct {
		ID     string            `json:"Id"`
		Names  []string          `json:"Names"`
		Image  string            `json:"Image"`
		State  string            `json:"State"`
		Status string            `json:"Status"`
		Labels map[string]string `json:"Labels"`
	}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &list); err != nil {
		return nil, err
	}
	out := make([]ContainerInfo, 0, len(list))
	for _, item := range list {
		name := ""
		if len(item.Names) > 0 {
			name = strings.TrimPrefix(item.Names[0], "/")
		}
		appID := ""
		if item.Labels != nil {
			appID = item.Labels[labelAppID]
		}
		managed := item.Labels != nil && item.Labels[labelManaged] == "true"
		out = append(out, ContainerInfo{
			ID:      item.ID,
			Name:    name,
			Image:   item.Image,
			Status:  item.Status,
			State:   item.State,
			AppID:   appID,
			Running: item.State == "running",
			Managed: managed,
		})
	}
	return out, nil
}

// MatchCatalogApp reports whether a running/existing container belongs to a catalog app.
func MatchCatalogApp(app catalog.App, c ContainerInfo) bool {
	if c.AppID != "" && c.AppID == app.ID {
		return true
	}
	if imageMatches(app.Image, c.Image) {
		return true
	}
	return nameMatches(app.ID, c.Name)
}

func imageMatches(want, have string) bool {
	w := normalizeImage(want)
	h := normalizeImage(have)
	if w == "" || h == "" {
		return false
	}
	if w == h {
		return true
	}
	// Allow digest/tag drift on the same repository path.
	if strings.HasPrefix(h, w+":") || strings.HasPrefix(h, w+"@") {
		return true
	}
	if strings.HasPrefix(w, h+":") || strings.HasPrefix(w, h+"@") {
		return true
	}
	return false
}

func normalizeImage(img string) string {
	img = strings.TrimSpace(strings.ToLower(img))
	if img == "" {
		return ""
	}
	// Drop digest.
	if i := strings.Index(img, "@"); i >= 0 {
		img = img[:i]
	}
	// Drop tag (but keep registry ports like host:5000/repo).
	if i := strings.LastIndex(img, ":"); i >= 0 {
		maybeTag := img[i+1:]
		if !strings.Contains(maybeTag, "/") {
			img = img[:i]
		}
	}
	return img
}

func nameMatches(appID, containerName string) bool {
	id := strings.ToLower(strings.TrimSpace(appID))
	name := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(containerName), "/"))
	if id == "" || name == "" {
		return false
	}
	switch name {
	case id, "slipway-"+id, id+"-"+id+"-1", id+"-1":
		return true
	}
	// Compose-style: <project>-<service>-N where service == app id
	parts := strings.Split(name, "-")
	if len(parts) >= 2 {
		svc := parts[len(parts)-2]
		if svc == id {
			return true
		}
	}
	return false
}

func IsSlipwayManaged(c ContainerInfo) bool {
	return c.Managed || strings.HasPrefix(c.Name, "slipway-")
}

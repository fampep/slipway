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
	ID             string `json:"id"`
	Name           string `json:"name"`
	Image          string `json:"image"`
	Status         string `json:"status"`
	State          string `json:"state"`
	Health         string `json:"health,omitempty"` // healthy | unhealthy | starting | none
	AppID          string `json:"app_id"`
	Running        bool   `json:"running"`
	Managed        bool   `json:"managed"`
	ComposeProject string `json:"compose_project,omitempty"`
	ComposeService string `json:"compose_service,omitempty"`
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
		project, service := "", ""
		if item.Labels != nil {
			appID = item.Labels[labelAppID]
			project = item.Labels["com.docker.compose.project"]
			service = item.Labels["com.docker.compose.service"]
		}
		managed := item.Labels != nil && item.Labels[labelManaged] == "true"
		out = append(out, ContainerInfo{
			ID:             item.ID,
			Name:           name,
			Image:          item.Image,
			Status:         item.Status,
			State:          item.State,
			Health:         parseHealthFromStatus(item.Status),
			AppID:          appID,
			Running:        item.State == "running",
			Managed:        managed,
			ComposeProject: project,
			ComposeService: service,
		})
	}
	return out, nil
}

func parseHealthFromStatus(status string) string {
	s := strings.ToLower(status)
	switch {
	case strings.Contains(s, "(healthy)"):
		return "healthy"
	case strings.Contains(s, "(unhealthy)"):
		return "unhealthy"
	case strings.Contains(s, "(health: starting)"), strings.Contains(s, "(starting)"):
		return "starting"
	default:
		return ""
	}
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

type InspectInfo struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Image          string            `json:"image"`
	ImageID        string            `json:"image_id,omitempty"`
	Status         string            `json:"status"`
	Health         string            `json:"health,omitempty"`
	Running        bool              `json:"running"`
	Started        string            `json:"started,omitempty"`
	Ports          []InspectPort     `json:"ports"`
	Mounts         []InspectMount    `json:"mounts"`
	Env            map[string]string `json:"env"`
	Labels         map[string]string `json:"labels,omitempty"`
	ComposeProject string            `json:"compose_project,omitempty"`
	ComposeService string            `json:"compose_service,omitempty"`
}

type UpdateCheck struct {
	UpdateAvailable bool   `json:"update_available"`
	CurrentImageID  string `json:"current_image_id,omitempty"`
	LatestImageID   string `json:"latest_image_id,omitempty"`
	Image           string `json:"image"`
	Pulled          bool   `json:"pulled"`
}

type InspectPort struct {
	HostIP        string `json:"host_ip,omitempty"`
	HostPort      string `json:"host_port"`
	ContainerPort string `json:"container_port"`
	Protocol      string `json:"protocol"`
}

type InspectMount struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Mode        string `json:"mode,omitempty"`
	RW          bool   `json:"rw"`
}

type StatsInfo struct {
	CPUPercent float64 `json:"cpu_percent"`
	MemUsed    uint64  `json:"mem_used"`
	MemLimit   uint64  `json:"mem_limit"`
	MemPercent float64 `json:"mem_percent"`
}

func (c *Client) Inspect(ctx context.Context, idOrName string) (*InspectInfo, error) {
	var raw struct {
		ID    string `json:"Id"`
		Name  string `json:"Name"`
		Image string `json:"Image"`
		State struct {
			Status    string `json:"Status"`
			Running   bool   `json:"Running"`
			StartedAt string `json:"StartedAt"`
			Health    *struct {
				Status string `json:"Status"`
			} `json:"Health"`
		} `json:"State"`
		Config struct {
			Image  string            `json:"Image"`
			Env    []string          `json:"Env"`
			Labels map[string]string `json:"Labels"`
		} `json:"Config"`
		NetworkSettings struct {
			Ports map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string `json:"HostPort"`
			} `json:"Ports"`
		} `json:"NetworkSettings"`
		Mounts []struct {
			Source      string `json:"Source"`
			Destination string `json:"Destination"`
			Mode        string `json:"Mode"`
			RW          bool   `json:"RW"`
		} `json:"Mounts"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/containers/"+url.PathEscape(idOrName)+"/json", nil, &raw); err != nil {
		return nil, err
	}
	health := ""
	if raw.State.Health != nil {
		health = strings.ToLower(raw.State.Health.Status)
	}
	project, service := "", ""
	if raw.Config.Labels != nil {
		project = raw.Config.Labels["com.docker.compose.project"]
		service = raw.Config.Labels["com.docker.compose.service"]
	}
	info := &InspectInfo{
		ID:             raw.ID,
		Name:           strings.TrimPrefix(raw.Name, "/"),
		Image:          raw.Config.Image,
		ImageID:        raw.Image,
		Status:         raw.State.Status,
		Health:         health,
		Running:        raw.State.Running,
		Started:        raw.State.StartedAt,
		Env:            map[string]string{},
		Labels:         raw.Config.Labels,
		ComposeProject: project,
		ComposeService: service,
	}
	for _, e := range raw.Config.Env {
		if i := strings.IndexByte(e, '='); i > 0 {
			k := e[:i]
			v := e[i+1:]
			lk := strings.ToLower(k)
			if strings.Contains(lk, "pass") || strings.Contains(lk, "secret") || strings.Contains(lk, "token") || strings.Contains(lk, "key") {
				info.Env[k] = "••••••••"
			} else {
				info.Env[k] = v
			}
		}
	}
	for key, binds := range raw.NetworkSettings.Ports {
		proto := "tcp"
		cport := key
		if i := strings.IndexByte(key, '/'); i >= 0 {
			cport = key[:i]
			proto = key[i+1:]
		}
		if len(binds) == 0 {
			info.Ports = append(info.Ports, InspectPort{ContainerPort: cport, Protocol: proto})
			continue
		}
		for _, b := range binds {
			info.Ports = append(info.Ports, InspectPort{
				HostIP:        b.HostIP,
				HostPort:      b.HostPort,
				ContainerPort: cport,
				Protocol:      proto,
			})
		}
	}
	for _, m := range raw.Mounts {
		info.Mounts = append(info.Mounts, InspectMount{
			Source: m.Source, Destination: m.Destination, Mode: m.Mode, RW: m.RW,
		})
	}
	return info, nil
}

func (c *Client) Logs(ctx context.Context, idOrName string, tail int) (string, error) {
	if tail <= 0 {
		tail = 200
	}
	if tail > 2000 {
		tail = 2000
	}
	path := fmt.Sprintf("/containers/%s/logs?stdout=1&stderr=1&timestamps=1&tail=%d", url.PathEscape(idOrName), tail)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return "", err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("docker logs: %s — %s", res.Status, strings.TrimSpace(string(data)))
	}
	return decodeDockerLogs(data), nil
}

func (c *Client) Stats(ctx context.Context, idOrName string) (*StatsInfo, error) {
	path := "/containers/" + url.PathEscape(idOrName) + "/stats?stream=0"
	var raw struct {
		CPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
			OnlineCPUs  uint32 `json:"online_cpus"`
		} `json:"cpu_stats"`
		PreCPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
		} `json:"precpu_stats"`
		MemoryStats struct {
			Usage uint64 `json:"usage"`
			Limit uint64 `json:"limit"`
		} `json:"memory_stats"`
	}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &raw); err != nil {
		return nil, err
	}
	info := &StatsInfo{
		MemUsed:  raw.MemoryStats.Usage,
		MemLimit: raw.MemoryStats.Limit,
	}
	if raw.MemoryStats.Limit > 0 {
		info.MemPercent = float64(raw.MemoryStats.Usage) / float64(raw.MemoryStats.Limit) * 100
	}
	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage - raw.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(raw.CPUStats.SystemUsage - raw.PreCPUStats.SystemUsage)
	cpus := float64(raw.CPUStats.OnlineCPUs)
	if cpus == 0 {
		cpus = 1
	}
	if sysDelta > 0 && cpuDelta >= 0 {
		info.CPUPercent = (cpuDelta / sysDelta) * cpus * 100
	}
	return info, nil
}

func (c *Client) ImageID(ctx context.Context, ref string) (string, error) {
	var raw struct {
		ID string `json:"Id"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/images/"+url.PathEscape(ref)+"/json", nil, &raw); err != nil {
		return "", err
	}
	return raw.ID, nil
}

// CheckUpdate compares the container's image ID to the local tagged image.
// When pull is true, the tagged image is refreshed from the registry first.
func (c *Client) CheckUpdate(ctx context.Context, containerName, imageRef string, pull bool) (*UpdateCheck, error) {
	info, err := c.Inspect(ctx, containerName)
	if err != nil {
		return nil, err
	}
	ref := imageRef
	if ref == "" {
		ref = info.Image
	}
	out := &UpdateCheck{Image: ref, CurrentImageID: info.ImageID}
	if pull {
		if err := c.pullImage(ctx, ref, nil); err != nil {
			return nil, err
		}
		out.Pulled = true
	}
	latest, err := c.ImageID(ctx, ref)
	if err != nil {
		// No local image for tag yet — treat as unknown / no update signal.
		return out, nil
	}
	out.LatestImageID = latest
	out.UpdateAvailable = info.ImageID != "" && latest != "" && info.ImageID != latest
	return out, nil
}

// ListStack returns sibling containers in the same compose project.
func (c *Client) ListStack(ctx context.Context, project string) ([]ContainerInfo, error) {
	if project == "" {
		return nil, nil
	}
	all, err := c.ListAll(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ContainerInfo, 0)
	for _, item := range all {
		if item.ComposeProject == project {
			out = append(out, item)
		}
	}
	return out, nil
}

// Docker multiplexes stdout/stderr with an 8-byte header when TTY is false.
func decodeDockerLogs(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	// Heuristic: if it looks multiplexed, strip headers.
	var b strings.Builder
	i := 0
	for i+8 <= len(data) {
		stream := data[i]
		if stream > 2 {
			// Not multiplexed — return as plain text.
			return string(data)
		}
		size := int(data[i+4])<<24 | int(data[i+5])<<16 | int(data[i+6])<<8 | int(data[i+7])
		i += 8
		if size < 0 || i+size > len(data) {
			return string(data)
		}
		b.Write(data[i : i+size])
		i += size
	}
	if b.Len() == 0 {
		return string(data)
	}
	return b.String()
}

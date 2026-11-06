//go:build !windows

package docker

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"
)

func newHTTPClient(host string) (*http.Client, string, error) {
	base := "http://localhost"
	transport := &http.Transport{}
	switch {
	case host == "":
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 3 * time.Second}
			return d.DialContext(ctx, "unix", "/var/run/docker.sock")
		}
	case strings.HasPrefix(host, "unix://"):
		path := strings.TrimPrefix(host, "unix://")
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 3 * time.Second}
			return d.DialContext(ctx, "unix", path)
		}
	case strings.HasPrefix(host, "tcp://"):
		base = "http://" + strings.TrimPrefix(host, "tcp://")
	default:
		base = host
	}
	return &http.Client{Transport: transport}, base, nil
}

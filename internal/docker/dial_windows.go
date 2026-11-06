//go:build windows

package docker

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
)

func newHTTPClient(host string) (*http.Client, string, error) {
	base := "http://localhost"
	transport := &http.Transport{}
	switch {
	case host == "":
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return winio.DialPipeContext(ctx, `\\.\pipe\docker_engine`)
		}
	case strings.HasPrefix(host, "npipe://"):
		path := strings.TrimPrefix(host, "npipe://")
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return winio.DialPipeContext(ctx, path)
		}
	case strings.HasPrefix(host, "tcp://"):
		base = "http://" + strings.TrimPrefix(host, "tcp://")
	case strings.HasPrefix(host, "unix://"):
		// uncommon on Windows; fall through to tcp-like
		base = "http://localhost"
	default:
		base = host
	}
	_ = time.Second
	return &http.Client{Transport: transport}, base, nil
}

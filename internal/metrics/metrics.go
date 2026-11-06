package metrics

import (
	"context"
	"runtime"
	"time"

	"github.com/fampep/slipway/internal/docker"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

type Snapshot struct {
	Timestamp   time.Time `json:"timestamp"`
	Hostname    string    `json:"hostname"`
	Platform    string    `json:"platform"`
	UptimeSec   uint64    `json:"uptime_sec"`
	CPUPercent  float64   `json:"cpu_percent"`
	MemUsed     uint64    `json:"mem_used"`
	MemTotal    uint64    `json:"mem_total"`
	MemPercent  float64   `json:"mem_percent"`
	DiskUsed    uint64    `json:"disk_used"`
	DiskTotal   uint64    `json:"disk_total"`
	DiskPercent float64   `json:"disk_percent"`
	NetSentPS   uint64    `json:"net_sent_ps"`
	NetRecvPS   uint64    `json:"net_recv_ps"`
	DockerOK    bool      `json:"docker_ok"`
}

type Service struct {
	docker      *docker.Client
	prevNet     net.IOCountersStat
	prevNetTime time.Time
	hasPrevNet  bool
}

func New(cli *docker.Client) *Service {
	return &Service{docker: cli}
}

func (s *Service) Snapshot(ctx context.Context) Snapshot {
	out := Snapshot{
		Timestamp: time.Now().UTC(),
		Platform:  runtime.GOOS + "/" + runtime.GOARCH,
		DockerOK:  s.docker != nil && s.docker.Available(),
	}

	if hi, err := host.InfoWithContext(ctx); err == nil {
		out.Hostname = hi.Hostname
		out.UptimeSec = hi.Uptime
	}
	if percents, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(percents) > 0 {
		out.CPUPercent = percents[0]
	}
	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		out.MemUsed = vm.Used
		out.MemTotal = vm.Total
		out.MemPercent = vm.UsedPercent
	}
	path := "/"
	if runtime.GOOS == "windows" {
		path = `C:\`
	}
	if du, err := disk.UsageWithContext(ctx, path); err == nil {
		out.DiskUsed = du.Used
		out.DiskTotal = du.Total
		out.DiskPercent = du.UsedPercent
	}
	if counters, err := net.IOCountersWithContext(ctx, false); err == nil && len(counters) > 0 {
		cur := counters[0]
		now := time.Now()
		if s.hasPrevNet {
			dt := now.Sub(s.prevNetTime).Seconds()
			if dt > 0 {
				if cur.BytesSent >= s.prevNet.BytesSent {
					out.NetSentPS = uint64(float64(cur.BytesSent-s.prevNet.BytesSent) / dt)
				}
				if cur.BytesRecv >= s.prevNet.BytesRecv {
					out.NetRecvPS = uint64(float64(cur.BytesRecv-s.prevNet.BytesRecv) / dt)
				}
			}
		}
		s.prevNet = cur
		s.prevNetTime = now
		s.hasPrevNet = true
	}
	return out
}

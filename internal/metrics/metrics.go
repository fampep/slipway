package metrics

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/fampep/slipway/internal/docker"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

type DiskVolume struct {
	Device     string  `json:"device"`
	Mountpoint string  `json:"mountpoint"`
	Fstype     string  `json:"fstype"`
	Used       uint64  `json:"used"`
	Total      uint64  `json:"total"`
	Free       uint64  `json:"free"`
	Percent    float64 `json:"percent"`
	Health     string  `json:"health"` // ok | warn | critical | unknown
}

type Snapshot struct {
	Timestamp   time.Time    `json:"timestamp"`
	Hostname    string       `json:"hostname"`
	Platform    string       `json:"platform"`
	UptimeSec   uint64       `json:"uptime_sec"`
	CPUPercent  float64      `json:"cpu_percent"`
	MemUsed     uint64       `json:"mem_used"`
	MemTotal    uint64       `json:"mem_total"`
	MemPercent  float64      `json:"mem_percent"`
	DiskUsed    uint64       `json:"disk_used"`
	DiskTotal   uint64       `json:"disk_total"`
	DiskPercent float64      `json:"disk_percent"`
	Disks       []DiskVolume `json:"disks"`
	NetSentPS   uint64       `json:"net_sent_ps"`
	NetRecvPS   uint64       `json:"net_recv_ps"`
	DockerOK    bool         `json:"docker_ok"`
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

// hostRoot is the bind-mounted host filesystem (see docker-compose /host).
// Empty means we're running on the host directly.
func hostRoot() string {
	if v := strings.TrimRight(os.Getenv("SLIPWAY_HOST_ROOT"), "/"); v != "" {
		if st, err := os.Stat(v); err == nil && st.IsDir() {
			return v
		}
	}
	if st, err := os.Stat("/host"); err == nil && st.IsDir() {
		return "/host"
	}
	return ""
}

func (s *Service) Snapshot(ctx context.Context) Snapshot {
	out := Snapshot{
		Timestamp: time.Now().UTC(),
		Platform:  runtime.GOOS + "/" + runtime.GOARCH,
		DockerOK:  s.docker != nil && s.docker.Available(),
		Disks:     []DiskVolume{},
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

	out.Disks = collectDisks(ctx)
	if primary := pickPrimaryDisk(out.Disks); primary != nil {
		out.DiskUsed = primary.Used
		out.DiskTotal = primary.Total
		out.DiskPercent = primary.Percent
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

func collectDisks(ctx context.Context) []DiskVolume {
	root := hostRoot()
	parts, err := disk.PartitionsWithContext(ctx, true)
	if err != nil {
		path := "/"
		if runtime.GOOS == "windows" {
			path = `C:\`
		}
		usagePath := path
		if root != "" {
			usagePath = filepath.Join(root, path)
		}
		if du, err := disk.UsageWithContext(ctx, usagePath); err == nil {
			return []DiskVolume{volumeFromUsage("root", path, "", du)}
		}
		return nil
	}

	seenMount := map[string]bool{}
	seenDev := map[string]bool{}
	out := make([]DiskVolume, 0, len(parts))
	for _, p := range parts {
		mp := p.Mountpoint
		// When reading host /proc/mounts via HOST_PROC, paths are host paths.
		// Strip accidental /host prefix from reported mount for display.
		displayMP := mp
		if root != "" && strings.HasPrefix(mp, root+"/") {
			displayMP = strings.TrimPrefix(mp, root)
			if displayMP == "" {
				displayMP = "/"
			}
		}

		if !keepPartition(p.Device, displayMP, p.Fstype) {
			continue
		}
		if seenMount[displayMP] {
			continue
		}

		usagePath := mp
		if root != "" {
			// Prefer reading usage through the bind mount
			candidate := filepath.Join(root, displayMP)
			if displayMP == "/" {
				candidate = root
			}
			if st, err := os.Stat(candidate); err == nil && st.IsDir() {
				usagePath = candidate
			}
		}

		du, err := disk.UsageWithContext(ctx, usagePath)
		if err != nil || du == nil || du.Total == 0 {
			continue
		}
		devKey := fmt.Sprintf("%s|%d", p.Device, du.Total)
		if p.Device != "" && seenDev[devKey] {
			continue
		}
		seenMount[displayMP] = true
		if p.Device != "" {
			seenDev[devKey] = true
		}
		out = append(out, volumeFromUsage(p.Device, displayMP, p.Fstype, du))
	}
	return out
}

func keepPartition(device, mp, fstype string) bool {
	fs := strings.ToLower(fstype)
	dev := strings.ToLower(device)

	skipFS := map[string]bool{
		"tmpfs": true, "devtmpfs": true, "sysfs": true, "proc": true, "cgroup": true,
		"cgroup2": true, "overlay": true, "squashfs": true, "aufs": true, "devpts": true,
		"securityfs": true, "pstore": true, "efivarfs": true, "bpf": true, "debugfs": true,
		"tracefs": true, "fusectl": true, "configfs": true, "mqueue": true, "hugetlbfs": true,
		"rpc_pipefs": true, "binfmt_misc": true, "autofs": true, "nsfs": true, "ramfs": true,
	}
	if skipFS[fs] {
		return false
	}
	noise := []string{
		"/var/lib/docker", "/var/lib/containerd", "/run/docker", "/run/containerd",
		"/snap", "/boot/efi", "/dev", "/proc", "/sys", "/run", "/var/lib/kubelet",
		"/host", // don't list the bind mount itself as a separate weird path when nested
	}
	for _, n := range noise {
		if mp == n || strings.HasPrefix(mp, n+"/") {
			return false
		}
	}
	if strings.Contains(mp, "/containers/") {
		return false
	}
	if strings.HasPrefix(dev, "loop") || strings.Contains(dev, "/loop") {
		return false
	}
	if strings.HasPrefix(dev, "/dev/") || strings.HasPrefix(dev, "//") ||
		fs == "zfs" || fs == "btrfs" || fs == "xfs" || fs == "ext4" || fs == "ext3" || fs == "ext2" ||
		fs == "ntfs" || fs == "vfat" || fs == "exfat" || fs == "fuseblk" ||
		fs == "nfs" || fs == "nfs4" || fs == "cifs" || fs == "smb3" {
		return true
	}
	if mp == "/" || (runtime.GOOS == "windows" && len(mp) == 3 && mp[1] == ':') {
		return true
	}
	return false
}

func volumeFromUsage(device, mount, fstype string, du *disk.UsageStat) DiskVolume {
	health := "ok"
	switch {
	case du.UsedPercent >= 95:
		health = "critical"
	case du.UsedPercent >= 85:
		health = "warn"
	case du.Total == 0:
		health = "unknown"
	}
	return DiskVolume{
		Device:     device,
		Mountpoint: mount,
		Fstype:     fstype,
		Used:       du.Used,
		Total:      du.Total,
		Free:       du.Free,
		Percent:    du.UsedPercent,
		Health:     health,
	}
}

func pickPrimaryDisk(disks []DiskVolume) *DiskVolume {
	if len(disks) == 0 {
		return nil
	}
	for i := range disks {
		if disks[i].Mountpoint == "/" || (len(disks[i].Mountpoint) == 3 && disks[i].Mountpoint[1] == ':') {
			return &disks[i]
		}
	}
	return &disks[0]
}

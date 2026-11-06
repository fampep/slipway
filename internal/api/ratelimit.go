package api

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type rateLimiter struct {
	mu       sync.Mutex
	hits     map[string][]time.Time
	limit    int
	window   time.Duration
	banAfter int
	banFor   time.Duration
	banned   map[string]time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		hits:     map[string][]time.Time{},
		limit:    limit,
		window:   window,
		banAfter: limit * 3,
		banFor:   15 * time.Minute,
		banned:   map[string]time.Time{},
	}
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := splitComma(xff)
		if len(parts) > 0 {
			return parts[0]
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func splitComma(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := trimSpace(s[start:i])
			if part != "" {
				out = append(out, part)
			}
			start = i + 1
		}
	}
	return out
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}

func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if until, ok := rl.banned[key]; ok {
		if now.Before(until) {
			return false
		}
		delete(rl.banned, key)
	}

	cut := now.Add(-rl.window)
	arr := rl.hits[key]
	kept := arr[:0]
	for _, t := range arr {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	kept = append(kept, now)
	rl.hits[key] = kept

	if len(kept) > rl.banAfter {
		rl.banned[key] = now.Add(rl.banFor)
		delete(rl.hits, key)
		return false
	}
	return len(kept) <= rl.limit
}

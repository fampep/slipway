package api

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		host := r.Host
		if host != "" && (strings.EqualFold(origin, "https://"+host) || strings.EqualFold(origin, "http://"+host)) {
			return true
		}
		// Local Vite / common loopback during development
		switch strings.ToLower(origin) {
		case "http://localhost:5173", "http://127.0.0.1:5173",
			"http://localhost:8080", "http://127.0.0.1:8080":
			return true
		}
		return false
	},
}

type Hub struct {
	mu        sync.Mutex
	clients   map[*websocket.Conn]struct{}
	broadcast chan any
}

func NewHub() *Hub {
	return &Hub{
		clients:   map[*websocket.Conn]struct{}{},
		broadcast: make(chan any, 16),
	}
}

func (h *Hub) Run() {
	for msg := range h.broadcast {
		h.mu.Lock()
		for c := range h.clients {
			_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := c.WriteJSON(msg); err != nil {
				_ = c.Close()
				delete(h.clients, c)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) Broadcast(msg any) {
	select {
	case h.broadcast <- msg:
	default:
	}
}

func (h *Hub) add(c *websocket.Conn) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) remove(c *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	_ = c.Close()
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	// requireAuth already ran; double-check session before upgrade.
	user, err := s.deps.Auth.UserFromRequest(r)
	if err != nil || user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.hub.add(conn)
	defer s.hub.remove(conn)

	_ = conn.WriteJSON(s.livePayload())

	conn.SetReadLimit(512)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

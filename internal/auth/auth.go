package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/fampep/slipway/internal/store"
	"golang.org/x/crypto/bcrypt"
)

const (
	CookieName = "slipway_session"
	SessionTTL = 7 * 24 * time.Hour
	bcryptCost = 12
	minUser    = 3
	maxUser    = 64
	minPass    = 8
	maxPass    = 128
)

var (
	ErrInvalidCreds = errors.New("invalid username or password")
	ErrSetupDone    = errors.New("setup already completed")
	ErrNeedsSetup   = errors.New("setup required")
)

type Service struct {
	store *store.Store
}

func New(st *store.Store) *Service {
	return &Service{store: st}
}

func (s *Service) NeedsSetup() (bool, error) {
	n, err := s.store.UserCount()
	if err != nil {
		return false, err
	}
	return n == 0, nil
}

func ValidateUsername(username string) error {
	username = strings.TrimSpace(username)
	if len(username) < minUser || len(username) > maxUser {
		return errors.New("username must be 3–64 characters")
	}
	for _, r := range username {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' || r == '.' {
			continue
		}
		return errors.New("username may only contain letters, numbers, _ - .")
	}
	return nil
}

func ValidatePassword(password string) error {
	if len(password) < minPass || len(password) > maxPass {
		return errors.New("password must be 8–128 characters")
	}
	return nil
}

func (s *Service) Setup(username, password string) (*store.User, string, error) {
	needs, err := s.NeedsSetup()
	if err != nil {
		return nil, "", err
	}
	if !needs {
		return nil, "", ErrSetupDone
	}
	username = strings.TrimSpace(username)
	if err := ValidateUsername(username); err != nil {
		return nil, "", err
	}
	if err := ValidatePassword(password); err != nil {
		return nil, "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, "", err
	}
	user, err := s.store.CreateUser(username, string(hash))
	if err != nil {
		return nil, "", err
	}
	token, err := s.createSession(user.ID)
	return user, token, err
}

func (s *Service) Login(username, password string) (*store.User, string, error) {
	needs, err := s.NeedsSetup()
	if err != nil {
		return nil, "", err
	}
	if needs {
		return nil, "", ErrNeedsSetup
	}
	username = strings.TrimSpace(username)
	user, err := s.store.GetUserByUsername(username)
	if err != nil {
		return nil, "", err
	}
	// Always burn a bcrypt compare on missing users to reduce timing leaks.
	dummy := []byte("$2a$12$000000000000000000000uDummyHashToKeepTiming")
	if user == nil {
		_ = bcrypt.CompareHashAndPassword(dummy, []byte(password))
		return nil, "", ErrInvalidCreds
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return nil, "", ErrInvalidCreds
	}
	token, err := s.createSession(user.ID)
	return user, token, err
}

func (s *Service) Logout(token string) error {
	if token == "" {
		return nil
	}
	return s.store.DeleteSession(token)
}

func (s *Service) UserFromRequest(r *http.Request) (*store.User, error) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return nil, nil
	}
	if len(c.Value) < 32 || len(c.Value) > 128 {
		return nil, nil
	}
	for _, r := range c.Value {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')) {
			return nil, nil
		}
	}
	sess, err := s.store.GetSession(c.Value)
	if err != nil || sess == nil {
		return nil, err
	}
	return s.store.GetUserByID(sess.UserID)
}

func (s *Service) TokenFromRequest(r *http.Request) string {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

func requestSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	proto := strings.ToLower(r.Header.Get("X-Forwarded-Proto"))
	return proto == "https"
}

func (s *Service) SetSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   requestSecure(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().UTC().Add(SessionTTL),
		MaxAge:   int(SessionTTL.Seconds()),
	})
}

func (s *Service) ClearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   requestSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0).UTC(),
	})
}

func (s *Service) createSession(userID int64) (string, error) {
	token, err := randomToken(32)
	if err != nil {
		return "", err
	}
	err = s.store.CreateSession(token, userID, time.Now().UTC().Add(SessionTTL))
	return token, err
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

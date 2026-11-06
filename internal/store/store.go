package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type User struct {
	ID           int64
	Username     string
	PasswordHash string
	CreatedAt    time.Time
}

type InstalledApp struct {
	ID            string
	CatalogID     string
	ContainerID   string
	ContainerName string
	Status        string
	InstalledAt   time.Time
}

type Session struct {
	Token     string
	UserID    int64
	ExpiresAt time.Time
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS installed_apps (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  status TEXT NOT NULL,
  installed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)
	return err
}

func (s *Store) GetSetting(key string) (string, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(`
INSERT INTO settings (key, value) VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
`, key, value)
	return err
}

func (s *Store) UserCount() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

func (s *Store) CreateUser(username, passwordHash string) (*User, error) {
	now := time.Now().UTC()
	res, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, passwordHash, now.Format(time.RFC3339),
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &User{ID: id, Username: username, PasswordHash: passwordHash, CreatedAt: now}, nil
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	u := &User{}
	var created string
	err := s.db.QueryRow(
		`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`,
		username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, created)
	return u, nil
}

func (s *Store) GetUserByID(id int64) (*User, error) {
	u := &User{}
	var created string
	err := s.db.QueryRow(
		`SELECT id, username, password_hash, created_at FROM users WHERE id = ?`,
		id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, created)
	return u, nil
}

func (s *Store) UpdatePasswordHash(userID int64, passwordHash string) error {
	_, err := s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, userID)
	return err
}

func (s *Store) CreateSession(token string, userID int64, expires time.Time) error {
	_, err := s.db.Exec(
		`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, expires.UTC().Format(time.RFC3339),
	)
	return err
}

func (s *Store) GetSession(token string) (*Session, error) {
	sess := &Session{}
	var exp string
	err := s.db.QueryRow(
		`SELECT token, user_id, expires_at FROM sessions WHERE token = ?`,
		token,
	).Scan(&sess.Token, &sess.UserID, &exp)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sess.ExpiresAt, _ = time.Parse(time.RFC3339, exp)
	if time.Now().After(sess.ExpiresAt) {
		_ = s.DeleteSession(token)
		return nil, nil
	}
	return sess, nil
}

func (s *Store) DeleteSession(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *Store) UpsertInstalled(app InstalledApp) error {
	_, err := s.db.Exec(`
INSERT INTO installed_apps (id, catalog_id, container_id, container_name, status, installed_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  container_id=excluded.container_id,
  container_name=excluded.container_name,
  status=excluded.status
`, app.ID, app.CatalogID, app.ContainerID, app.ContainerName, app.Status, app.InstalledAt.UTC().Format(time.RFC3339))
	return err
}

func (s *Store) ListInstalled() ([]InstalledApp, error) {
	rows, err := s.db.Query(`SELECT id, catalog_id, container_id, container_name, status, installed_at FROM installed_apps ORDER BY installed_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InstalledApp
	for rows.Next() {
		var a InstalledApp
		var at string
		if err := rows.Scan(&a.ID, &a.CatalogID, &a.ContainerID, &a.ContainerName, &a.Status, &at); err != nil {
			return nil, err
		}
		a.InstalledAt, _ = time.Parse(time.RFC3339, at)
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) GetInstalled(id string) (*InstalledApp, error) {
	a := &InstalledApp{}
	var at string
	err := s.db.QueryRow(
		`SELECT id, catalog_id, container_id, container_name, status, installed_at FROM installed_apps WHERE id = ?`,
		id,
	).Scan(&a.ID, &a.CatalogID, &a.ContainerID, &a.ContainerName, &a.Status, &at)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	a.InstalledAt, _ = time.Parse(time.RFC3339, at)
	return a, nil
}

func (s *Store) DeleteInstalled(id string) error {
	res, err := s.db.Exec(`DELETE FROM installed_apps WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("app not found")
	}
	return nil
}

func (s *Store) UpdateInstalledStatus(id, status string) error {
	_, err := s.db.Exec(`UPDATE installed_apps SET status = ? WHERE id = ?`, status, id)
	return err
}

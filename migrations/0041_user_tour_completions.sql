-- migrations/0041_user_tour_completions.sql
CREATE TABLE IF NOT EXISTS user_tour_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tour_id TEXT NOT NULL,
  tour_version INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, tour_id)
);

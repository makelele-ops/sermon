CREATE TABLE IF NOT EXISTS chat_limits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_limits_window ON chat_limits(window);

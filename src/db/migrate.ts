import { rawDb } from "."

/**
 * MVP migration: just CREATE TABLE IF NOT EXISTS based on schema.ts.
 * For M2+ we'll switch to drizzle-kit-generated SQL migrations.
 */
const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Learner',
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  gems INTEGER NOT NULL DEFAULT 0,
  target_band REAL NOT NULL DEFAULT 6.5,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  skill TEXT NOT NULL,
  cluster TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1,
  reward_exp INTEGER NOT NULL DEFAULT 50,
  reward_gold INTEGER NOT NULL DEFAULT 10,
  reward_gems INTEGER NOT NULL DEFAULT 0,
  map_x REAL NOT NULL DEFAULT 0.5,
  map_y REAL NOT NULL DEFAULT 0.5,
  payload TEXT,
  generator_version TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS nodes_by_skill ON nodes(skill);
CREATE INDEX IF NOT EXISTS nodes_by_cluster ON nodes(cluster);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_node TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'unlock'
);
CREATE INDEX IF NOT EXISTS edges_by_from ON edges(from_node);
CREATE INDEX IF NOT EXISTS edges_by_to ON edges(to_node);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL DEFAULT 0,
  band REAL,
  payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS attempts_by_user_node ON attempts(user_id, node_id);

CREATE TABLE IF NOT EXISTS unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'progression',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS unlocks_uniq ON unlocks(user_id, node_id);

CREATE TABLE IF NOT EXISTS mastery (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  value REAL NOT NULL DEFAULT 0,
  review_after INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, node_id)
);

CREATE TABLE IF NOT EXISTS phrases (
  id TEXT PRIMARY KEY,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  zh TEXT,
  example TEXT,
  func TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS phrases_by_node ON phrases(node_id);

CREATE TABLE IF NOT EXISTS dictation_lessons (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_zh TEXT NOT NULL,
  paragraphs TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS dictation_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES dictation_lessons(id) ON DELETE CASCADE,
  listens INTEGER NOT NULL DEFAULT 0,
  dictation_text TEXT,
  dictation_accuracy REAL,
  recite_text TEXT,
  recite_accuracy REAL,
  checked_parts TEXT,
  stage TEXT NOT NULL DEFAULT 'listen',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS user_phrases (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phrase_id TEXT NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  mastery REAL NOT NULL DEFAULT 0,
  review_after INTEGER,
  source TEXT NOT NULL DEFAULT 'lesson',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (user_id, phrase_id)
);
`

function main() {
  const db = rawDb()
  db.exec(SQL)

  // Idempotent column additions for DBs created before a column existed.
  const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>
  if (!userCols.some((c) => c.name === "target_band")) {
    db.exec("ALTER TABLE users ADD COLUMN target_band REAL NOT NULL DEFAULT 6.5")
    console.log("[migrate] added users.target_band")
  }

  const progressCols = db.prepare("PRAGMA table_info(dictation_progress)").all() as Array<{ name: string }>
  if (progressCols.length > 0 && !progressCols.some((c) => c.name === "checked_parts")) {
    db.exec("ALTER TABLE dictation_progress ADD COLUMN checked_parts TEXT")
    console.log("[migrate] added dictation_progress.checked_parts")
  }
  if (progressCols.length > 0 && !progressCols.some((c) => c.name === "summary_html")) {
    db.exec("ALTER TABLE dictation_progress ADD COLUMN summary_html TEXT")
    console.log("[migrate] added dictation_progress.summary_html")
  }

  console.log("[migrate] schema ensured at", process.env.IELTS_DB_PATH ?? "./data/ielts.db")
}

main()

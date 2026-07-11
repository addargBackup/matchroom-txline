/** SQLite (better-sqlite3): zero-setup persistence for judges. */
import Database from "better-sqlite3";
import * as path from "node:path";

const file = process.env.DB_FILE ?? path.resolve(process.cwd(), "matchroom.db");
export const db = new Database(file);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  nation TEXT NOT NULL,
  adopted_nation TEXT,
  wallet TEXT,
  is_bot INTEGER DEFAULT 0,
  persona TEXT,
  total_points INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  fixture_id INTEGER NOT NULL,
  name TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, player_id)
);
CREATE TABLE IF NOT EXISTS theses (
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  result INTEGER NOT NULL,          -- 0 home / 1 draw / 2 away
  score_home INTEGER NOT NULL,
  score_away INTEGER NOT NULL,
  confidence INTEGER NOT NULL,      -- 1..3
  hot_take TEXT DEFAULT '',
  sealed_at INTEGER NOT NULL,
  revealed INTEGER DEFAULT 0,
  graded INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  judas INTEGER DEFAULT 0,
  verdict TEXT,
  PRIMARY KEY (room_id, player_id)
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  opens_at INTEGER NOT NULL,        -- wall ms
  closes_at INTEGER NOT NULL,       -- wall ms (answer window)
  state TEXT DEFAULT 'open',        -- open | resolved | void
  answer_index INTEGER,
  meta_json TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS answers (
  card_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  choice INTEGER NOT NULL,
  correct INTEGER,
  points INTEGER DEFAULT 0,
  PRIMARY KEY (card_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_cards_room ON cards(room_id, state);
CREATE INDEX IF NOT EXISTS idx_members_player ON members(player_id);
`);

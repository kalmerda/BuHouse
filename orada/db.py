import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "orada.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS avatars (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  traits TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  emoji TEXT NOT NULL,
  is_npc INTEGER NOT NULL DEFAULT 0,
  wander INTEGER NOT NULL DEFAULT 1,
  place_id TEXT,
  deployed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  avatar_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  avatar_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL,
  other_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  minute INTEGER NOT NULL DEFAULT 840,
  tick INTEGER NOT NULL DEFAULT 0
);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT OR IGNORE INTO world_clock (id, minute, tick) VALUES (1, 840, 0)"
    )
    conn.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "oda_arkadasi.db"


def utcnow():
    return datetime.now(timezone.utc)


def init_db():
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                university_id TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pending_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                university_id TEXT NOT NULL,
                code TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS pending_password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def create_pending_verification(email, password_hash, name, university_id, code, ttl_minutes=15):
    now = utcnow()
    expires = now + timedelta(minutes=ttl_minutes)
    with get_conn() as conn:
        conn.execute("DELETE FROM pending_verifications WHERE email = ?", (email,))
        conn.execute(
            """
            INSERT INTO pending_verifications
            (email, password_hash, name, university_id, code, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email.lower(),
                password_hash,
                name,
                university_id,
                code,
                expires.isoformat(),
                now.isoformat(),
            ),
        )


def get_pending_verification(email):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM pending_verifications WHERE email = ?",
            (email.lower(),),
        ).fetchone()
        return dict(row) if row else None


def delete_pending_verification(email):
    with get_conn() as conn:
        conn.execute("DELETE FROM pending_verifications WHERE email = ?", (email.lower(),))


def create_user(email, password_hash, name, university_id):
    now = utcnow().isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (email, password_hash, name, university_id, verified, created_at)
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (email.lower(), password_hash, name, university_id, now),
        )
        return cur.lastrowid


def get_user_by_email(email):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def create_session(token, user_id, ttl_days=30):
    expires = utcnow() + timedelta(days=ttl_days)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires.isoformat()),
        )


def get_session(token):
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT s.token, s.user_id, s.expires_at, u.email, u.name, u.university_id, u.verified
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        if utcnow() > datetime.fromisoformat(data["expires_at"]):
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None
        return data


def delete_session(token):
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def create_pending_password_reset(email, code, ttl_minutes=15):
    now = utcnow()
    expires = now + timedelta(minutes=ttl_minutes)
    with get_conn() as conn:
        conn.execute("DELETE FROM pending_password_resets WHERE email = ?", (email.lower(),))
        conn.execute(
            """
            INSERT INTO pending_password_resets (email, code, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (email.lower(), code, expires.isoformat(), now.isoformat()),
        )


def get_pending_password_reset(email):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM pending_password_resets WHERE email = ?",
            (email.lower(),),
        ).fetchone()
        return dict(row) if row else None


def delete_pending_password_reset(email):
    with get_conn() as conn:
        conn.execute("DELETE FROM pending_password_resets WHERE email = ?", (email.lower(),))


def update_user_password(email, password_hash):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE email = ?",
            (password_hash, email.lower()),
        )


def user_to_public(user):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "university_id": user["university_id"],
        "verified": bool(user["verified"]),
    }

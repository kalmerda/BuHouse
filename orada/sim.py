from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

from dialogue import generate_exchange
from world import NPCS, PLACE_BY_ID, PLACES

MINUTES_PER_TICK = 8
MOVE_CHANCE = 0.28
TALK_CHANCE = 0.72
MAX_TALKS_PER_TICK = 4
RECENT_PAIR_TICKS = 4


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clock_label(minute: int) -> str:
    minute = minute % (24 * 60)
    return f"{minute // 60:02d}:{minute % 60:02d}"


def seed_npcs(conn) -> None:
    existing = conn.execute("SELECT COUNT(*) AS n FROM avatars WHERE is_npc = 1").fetchone()["n"]
    if existing:
        return
    for npc in NPCS:
        conn.execute(
            """
            INSERT INTO avatars (id, token, name, persona, traits, color, emoji, is_npc, wander, place_id, deployed_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                f"npc-{uuid.uuid4()}",
                npc["name"],
                npc["persona"],
                npc["traits"],
                npc["color"],
                npc["emoji"],
                npc["wander"],
                npc["place_id"],
                now_iso(),
                now_iso(),
            ),
        )
    conn.commit()


def last_memory(conn, a_id: str, b_id: str) -> str | None:
    row = conn.execute(
        """
        SELECT summary FROM memories
        WHERE avatar_id = ? AND other_id = ?
        ORDER BY created_at DESC LIMIT 1
        """,
        (a_id, b_id),
    ).fetchone()
    return row["summary"] if row else None


def _tick_stamp(tick: int) -> str:
    return f"t{tick}"


_pair_cooldown: dict[tuple[str, str], int] = {}


def catch_up(conn, extra_ticks: int = 0) -> dict:
    extra = min(8, max(0, int(extra_ticks or 0)))
    cols = {row[1] for row in conn.execute("PRAGMA table_info(world_clock)")}
    if "last_catch_up" not in cols:
        conn.execute("ALTER TABLE world_clock ADD COLUMN last_catch_up TEXT")
        conn.commit()
    clock = dict(conn.execute("SELECT * FROM world_clock WHERE id = 1").fetchone())
    now = datetime.now(timezone.utc)
    last = clock.get("last_catch_up")
    elapsed = 0
    if last:
        try:
            prev = datetime.fromisoformat(last)
            if extra == 0 and (now - prev).total_seconds() < 20:
                return {
                    "tick": clock["tick"],
                    "time": clock_label(clock["minute"]),
                    "talks": 0,
                    "skipped": True,
                }
            elapsed = min(6, int((now - prev).total_seconds() // 180))
        except ValueError:
            elapsed = 0
    ticks = elapsed + extra
    talks = 0
    result = {"tick": clock["tick"], "time": clock_label(clock["minute"]), "talks": 0}
    for _ in range(ticks):
        result = run_tick(conn)
        talks += result["talks"]
        if talks >= 4:
            break
    conn.execute("UPDATE world_clock SET last_catch_up = ? WHERE id = 1", (now.isoformat(),))
    conn.commit()
    result["talks"] = talks
    return result


def _cool_key(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def run_tick(conn) -> dict:
    clock = conn.execute("SELECT minute, tick FROM world_clock WHERE id = 1").fetchone()
    minute = clock["minute"] + MINUTES_PER_TICK
    tick = clock["tick"] + 1
    conn.execute("UPDATE world_clock SET minute = ?, tick = ? WHERE id = 1", (minute, tick))

    avatars = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM avatars WHERE place_id IS NOT NULL"
        ).fetchall()
    ]

    by_place: dict[str, list[dict]] = {}
    for avatar in avatars:
        by_place.setdefault(avatar["place_id"], []).append(avatar)

    talks = 0
    started = []
    random.shuffle(avatars)
    pairs_tried = set()
    for place_id, group in by_place.items():
        if talks >= MAX_TALKS_PER_TICK:
            break
        if len(group) < 2:
            continue
        random.shuffle(group)
        for i, a in enumerate(group):
            if talks >= MAX_TALKS_PER_TICK:
                break
            for b in group[i + 1 :]:
                key = _cool_key(a["id"], b["id"])
                if key in pairs_tried:
                    continue
                pairs_tried.add(key)
                last_tick = _pair_cooldown.get(key, -99)
                if tick - last_tick < RECENT_PAIR_TICKS:
                    continue
                if random.random() > TALK_CHANCE:
                    continue
                memory = last_memory(conn, a["id"], b["id"])
                messages, summary = generate_exchange(a, b, place_id, memory)
                conv_id = str(uuid.uuid4())
                stamp = _tick_stamp(tick)
                world_time = clock_label(minute)
                created = f"{world_time}|{stamp}"
                conn.execute(
                    "INSERT INTO conversations (id, place_id, started_at) VALUES (?, ?, ?)",
                    (conv_id, place_id, created),
                )
                conn.execute(
                    "INSERT INTO conversation_members (conversation_id, avatar_id) VALUES (?, ?), (?, ?)",
                    (conv_id, a["id"], conv_id, b["id"]),
                )
                for msg in messages:
                    conn.execute(
                        "INSERT INTO messages (id, conversation_id, avatar_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
                        (str(uuid.uuid4()), conv_id, msg["avatar_id"], msg["text"], created),
                    )
                for left, right in ((a, b), (b, a)):
                    conn.execute(
                        "INSERT INTO memories (id, avatar_id, other_id, place_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            str(uuid.uuid4()),
                            left["id"],
                            right["id"],
                            place_id,
                            f"{right['name']} ile {summary}",
                            created,
                        ),
                    )
                _pair_cooldown[key] = tick
                talks += 1
                started.append(
                    {
                        "id": conv_id,
                        "place_id": place_id,
                        "a": a["name"],
                        "b": b["name"],
                        "summary": summary,
                    }
                )
                break

    moved = []
    for avatar in avatars:
        if not avatar["wander"]:
            continue
        if random.random() > MOVE_CHANCE:
            continue
        place = PLACE_BY_ID.get(avatar["place_id"])
        if not place or not place["neighbors"]:
            continue
        nxt = random.choice(place["neighbors"])
        conn.execute("UPDATE avatars SET place_id = ? WHERE id = ?", (nxt, avatar["id"]))
        avatar["place_id"] = nxt
        moved.append({"id": avatar["id"], "place_id": nxt})

    conn.commit()
    return {
        "tick": tick,
        "time": clock_label(minute),
        "moved": len(moved),
        "talks": talks,
        "started": started,
    }


def create_avatar(conn, *, name: str, persona: str, traits: str, color: str, emoji: str) -> dict:
    avatar_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO avatars (id, token, name, persona, traits, color, emoji, is_npc, wander, place_id, deployed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, NULL, NULL, ?)
        """,
        (avatar_id, token, name.strip(), persona.strip(), traits, color, emoji, now_iso()),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM avatars WHERE id = ?", (avatar_id,)).fetchone())


def deploy(conn, avatar_id: str, place_id: str, wander: bool) -> dict:
    if place_id not in PLACE_BY_ID:
        raise ValueError("Bilinmeyen yer")
    conn.execute(
        "UPDATE avatars SET place_id = ?, wander = ?, deployed_at = ? WHERE id = ?",
        (place_id, 1 if wander else 0, now_iso(), avatar_id),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM avatars WHERE id = ?", (avatar_id,)).fetchone())


def recall(conn, avatar_id: str) -> dict:
    conn.execute(
        "UPDATE avatars SET place_id = NULL, wander = 0 WHERE id = ?",
        (avatar_id,),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM avatars WHERE id = ?", (avatar_id,)).fetchone())


def avatar_by_token(conn, token: str) -> dict | None:
    row = conn.execute("SELECT * FROM avatars WHERE token = ?", (token,)).fetchone()
    return dict(row) if row else None


def world_snapshot(conn, me_id: str | None = None) -> dict:
    clock = conn.execute("SELECT minute, tick FROM world_clock WHERE id = 1").fetchone()
    avatars = [dict(r) for r in conn.execute("SELECT id, name, persona, traits, color, emoji, is_npc, wander, place_id FROM avatars").fetchall()]
    recent_rows = conn.execute(
        """
        SELECT c.id, c.place_id, c.started_at
        FROM conversations c
        ORDER BY c.started_at DESC
        LIMIT 8
        """
    ).fetchall()
    recent = []
    for row in recent_rows:
        members = conn.execute(
            """
            SELECT a.id, a.name, a.emoji, a.color
            FROM conversation_members m
            JOIN avatars a ON a.id = m.avatar_id
            WHERE m.conversation_id = ?
            """,
            (row["id"],),
        ).fetchall()
        preview = conn.execute(
            "SELECT text FROM messages WHERE conversation_id = ? ORDER BY rowid ASC LIMIT 1",
            (row["id"],),
        ).fetchone()
        recent.append(
            {
                "id": row["id"],
                "place_id": row["place_id"],
                "place": PLACE_BY_ID.get(row["place_id"], {}).get("name", row["place_id"]),
                "started_at": row["started_at"],
                "members": [dict(m) for m in members],
                "preview": preview["text"] if preview else "",
            }
        )
    return {
        "time": clock_label(clock["minute"]),
        "tick": clock["tick"],
        "places": PLACES,
        "avatars": avatars,
        "recent": recent,
        "me_id": me_id,
    }


def inbox(conn, avatar_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT c.id, c.place_id, c.started_at
        FROM conversations c
        JOIN conversation_members m ON m.conversation_id = c.id
        WHERE m.avatar_id = ?
        ORDER BY c.started_at DESC
        LIMIT 40
        """,
        (avatar_id,),
    ).fetchall()
    events = []
    for row in rows:
        others = conn.execute(
            """
            SELECT a.id, a.name, a.emoji, a.color
            FROM conversation_members m
            JOIN avatars a ON a.id = m.avatar_id
            WHERE m.conversation_id = ? AND a.id != ?
            """,
            (row["id"], avatar_id),
        ).fetchall()
        messages = conn.execute(
            """
            SELECT a.name, a.emoji, msg.text
            FROM messages msg
            JOIN avatars a ON a.id = msg.avatar_id
            WHERE msg.conversation_id = ?
            ORDER BY msg.rowid ASC
            """,
            (row["id"],),
        ).fetchall()
        mem = conn.execute(
            """
            SELECT summary FROM memories
            WHERE avatar_id = ? AND place_id = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (avatar_id, row["place_id"]),
        ).fetchone()
        time_part = row["started_at"].split("|")[0]
        events.append(
            {
                "id": row["id"],
                "time": time_part,
                "place_id": row["place_id"],
                "place": PLACE_BY_ID.get(row["place_id"], {}).get("name", row["place_id"]),
                "others": [dict(o) for o in others],
                "summary": mem["summary"] if mem else "",
                "messages": [dict(m) for m in messages],
            }
        )
    return events


def conversation_detail(conn, conv_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
    if not row:
        return None
    messages = conn.execute(
        """
        SELECT a.name, a.emoji, a.color, msg.text
        FROM messages msg
        JOIN avatars a ON a.id = msg.avatar_id
        WHERE msg.conversation_id = ?
        ORDER BY msg.rowid ASC
        """,
        (conv_id,),
    ).fetchall()
    return {
        "id": row["id"],
        "place": PLACE_BY_ID.get(row["place_id"], {}).get("name", row["place_id"]),
        "started_at": row["started_at"],
        "messages": [dict(m) for m in messages],
    }

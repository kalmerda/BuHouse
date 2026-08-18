"""Orada local server. Production uses a separate Vercel + Supabase project."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

import db
import sim

ROOT = Path(__file__).resolve().parent

conn = db.connect()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db(conn)
    sim.seed_npcs(conn)
    yield
    conn.close()


app = FastAPI(title="Orada", lifespan=lifespan)


class CreateAvatarIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    persona: str = Field(default="", max_length=280)
    traits: list[str] = Field(default_factory=list)
    color: str = Field(default="#e8a87c", max_length=16)
    emoji: str = Field(default="🙂", max_length=8)


class DeployIn(BaseModel):
    place_id: str
    wander: bool = True


class FastForwardIn(BaseModel):
    ticks: int = Field(default=8, ge=1, le=8)


def require_me(x_avatar_token: str | None) -> dict:
    if not x_avatar_token:
        raise HTTPException(401, "Avatar yok")
    me = sim.avatar_by_token(conn, x_avatar_token)
    if not me:
        raise HTTPException(401, "Avatar bulunamadı")
    return me


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/styles.css")
def styles():
    return FileResponse(ROOT / "styles.css")


@app.get("/app.js")
def app_js():
    return FileResponse(ROOT / "app.js")


@app.get("/config.js")
def config_js():
    path = ROOT / "config.js"
    if path.exists():
        return FileResponse(path)
    return PlainTextResponse("window.ORADA_CONFIG = {};", media_type="application/javascript")


@app.post("/api/avatars")
def create_avatar(body: CreateAvatarIn):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "İsim gerekli")
    traits = ",".join(t.strip() for t in body.traits if t.strip())
    persona = body.persona.strip() or "Karşılaştığı insanlarla kendi sesimle konuşur."
    avatar = sim.create_avatar(
        conn,
        name=name,
        persona=persona,
        traits=traits,
        color=body.color,
        emoji=body.emoji,
    )
    return {
        "id": avatar["id"],
        "token": avatar["token"],
        "name": avatar["name"],
        "persona": avatar["persona"],
        "traits": avatar["traits"],
        "color": avatar["color"],
        "emoji": avatar["emoji"],
        "place_id": avatar["place_id"],
        "wander": bool(avatar["wander"]),
    }


@app.get("/api/me")
def me(x_avatar_token: str | None = Header(default=None)):
    avatar = require_me(x_avatar_token)
    return {
        "id": avatar["id"],
        "name": avatar["name"],
        "persona": avatar["persona"],
        "traits": avatar["traits"],
        "color": avatar["color"],
        "emoji": avatar["emoji"],
        "place_id": avatar["place_id"],
        "wander": bool(avatar["wander"]),
        "is_npc": bool(avatar["is_npc"]),
    }


@app.get("/api/world")
def world(x_avatar_token: str | None = Header(default=None)):
    sim.catch_up(conn, 0)
    me_id = None
    if x_avatar_token:
        found = sim.avatar_by_token(conn, x_avatar_token)
        if found:
            me_id = found["id"]
    return sim.world_snapshot(conn, me_id)


@app.post("/api/deploy")
def deploy_avatar(body: DeployIn, x_avatar_token: str | None = Header(default=None)):
    me = require_me(x_avatar_token)
    try:
        avatar = sim.deploy(conn, me["id"], body.place_id, body.wander)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "place_id": avatar["place_id"], "wander": bool(avatar["wander"])}


@app.post("/api/recall")
def recall_avatar(x_avatar_token: str | None = Header(default=None)):
    me = require_me(x_avatar_token)
    sim.recall(conn, me["id"])
    return {"ok": True}


@app.post("/api/fast-forward")
def fast_forward(body: FastForwardIn, x_avatar_token: str | None = Header(default=None)):
    require_me(x_avatar_token)
    result = sim.catch_up(conn, body.ticks)
    return {"ok": True, "ticks": body.ticks, "time": result["time"], "talks": result["talks"]}


@app.get("/api/inbox")
def get_inbox(x_avatar_token: str | None = Header(default=None)):
    me = require_me(x_avatar_token)
    return {"events": sim.inbox(conn, me["id"])}


@app.get("/api/conversations/{conv_id}")
def get_conversation(conv_id: str):
    detail = sim.conversation_detail(conn, conv_id)
    if not detail:
        raise HTTPException(404, "Sohbet yok")
    return detail

"""Orada — avatars stay on the map and talk while you are away."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import db
import sim

STATIC = Path(__file__).resolve().parent / "static"
TICK_SECONDS = 12

conn = db.connect()
lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db(conn)
    sim.seed_npcs(conn)
    task = asyncio.create_task(ticker())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    conn.close()


app = FastAPI(title="Orada", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


async def ticker():
    while True:
        await asyncio.sleep(TICK_SECONDS)
        async with lock:
            sim.run_tick(conn)


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
    ticks: int = Field(default=15, ge=1, le=60)


def require_me(x_avatar_token: str | None) -> dict:
    if not x_avatar_token:
        raise HTTPException(401, "Avatar yok")
    me = sim.avatar_by_token(conn, x_avatar_token)
    if not me:
        raise HTTPException(401, "Avatar bulunamadı")
    return me


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.post("/api/avatars")
async def create_avatar(body: CreateAvatarIn):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "İsim gerekli")
    traits = ",".join(t.strip() for t in body.traits if t.strip())
    persona = body.persona.strip() or "Karşılaştığı insanlarla kendi sesimle konuşur."
    async with lock:
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
    me_id = None
    if x_avatar_token:
        found = sim.avatar_by_token(conn, x_avatar_token)
        if found:
            me_id = found["id"]
    return sim.world_snapshot(conn, me_id)


@app.post("/api/deploy")
async def deploy_avatar(body: DeployIn, x_avatar_token: str | None = Header(default=None)):
    me = require_me(x_avatar_token)
    try:
        async with lock:
            avatar = sim.deploy(conn, me["id"], body.place_id, body.wander)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "place_id": avatar["place_id"], "wander": bool(avatar["wander"])}


@app.post("/api/recall")
async def recall_avatar(x_avatar_token: str | None = Header(default=None)):
    me = require_me(x_avatar_token)
    async with lock:
        sim.recall(conn, me["id"])
    return {"ok": True}


@app.post("/api/fast-forward")
async def fast_forward(body: FastForwardIn, x_avatar_token: str | None = Header(default=None)):
    require_me(x_avatar_token)
    results = []
    async with lock:
        for _ in range(body.ticks):
            results.append(sim.run_tick(conn))
    last = results[-1]
    return {"ok": True, "ticks": len(results), "time": last["time"], "talks": sum(r["talks"] for r in results)}


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

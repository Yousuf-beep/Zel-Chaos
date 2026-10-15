"""Per-user companion memory, organised into conversations (nola.conversations) of messages (nola.chat_messages),
plus a rolling notes summary the model writes about the user across all her chats (nola.companion_notes).

Every query is scoped by user_id, so one account can never read or delete another's chats, even with a guessed id.
Message text and meta, titles, notes and reports are sealed with AES-GCM (services.crypto) before they reach the
database. Messages older than HISTORY_TTL_DAYS are pruned. Runs on Supabase Postgres, or SQLite without DATABASE_URL."""
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import config
from services import crypto
from services.db import Database, db as default_db

_STOP = set("""about after again also always been before being cant could didnt does doing dont during feel feeling from have having
here just know like make more much really should since some still than that thats their them then there these they thing think this
those very want what when where which while will with would your youre yours hello thank thanks okay yeah""".split())


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[^\W\d_]{4,}", text.lower()) if w not in _STOP}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts(v: Any) -> float:
    if isinstance(v, datetime):
        return v.timestamp()
    if isinstance(v, (int, float)):
        return float(v)
    d = datetime.fromisoformat(str(v))
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp()


def _pack(text: str, meta: dict) -> tuple[str, dict]:
    """With a key, text and meta travel together inside one sealed value and the meta column stays empty."""
    if crypto.enabled():
        return crypto.seal_json({"t": text, "m": meta}), {}
    return text, meta


def _unpack(text: str, meta: Any) -> tuple[str, dict]:
    if text.startswith(crypto.PREFIX):
        p = crypto.unseal_json(text, {})
        return p.get("t", ""), p.get("m", {})
    meta = json.loads(meta) if isinstance(meta, str) else (meta or {})
    return text, meta


def _row_to_msg(mid: int, role: str, text: str, meta: Any, created_at: Any) -> dict:
    text, meta = _unpack(text, meta)
    return {**meta, "id": mid, "role": role, "text": text, "at": _ts(created_at)}


class Memory:
    def __init__(self, database: Database | None = None):
        self.db = database or default_db
        self.ttl_days = config.HISTORY_TTL_DAYS

    @property
    def backend(self) -> str:
        return self.db.backend

    # ── conversations ──
    async def create_conversation(self, uid: str, title: str = "") -> dict:
        cid, now = secrets.token_hex(12), _now()
        await self.db.execute(
            "INSERT INTO nola.conversations (id, user_id, title, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
            cid, uid, crypto.seal(title), now, now)
        return {"id": cid, "title": title, "created_at": now.timestamp(), "updated_at": now.timestamp(), "message_count": 0, "has_report": False}

    async def conversations(self, uid: str) -> list[dict]:
        rows = await self.db.fetchall(
            "SELECT c.id, c.title, c.created_at, c.updated_at, c.report IS NOT NULL, "
            "(SELECT COUNT(*) FROM nola.chat_messages m WHERE m.conversation_id = c.id) "
            "FROM nola.conversations c WHERE c.user_id = %s ORDER BY c.updated_at DESC LIMIT 200", uid)
        return [{"id": r[0], "title": crypto.unseal(r[1]), "created_at": _ts(r[2]), "updated_at": _ts(r[3]),
                 "has_report": bool(r[4]), "message_count": int(r[5])} for r in rows]

    async def conversation(self, uid: str, cid: str) -> Optional[dict]:
        row = await self.db.fetchone(
            "SELECT id, title, created_at, updated_at, report IS NOT NULL FROM nola.conversations WHERE id = %s AND user_id = %s",
            cid, uid)
        if not row:
            return None
        return {"id": row[0], "title": crypto.unseal(row[1]), "created_at": _ts(row[2]), "updated_at": _ts(row[3]), "has_report": bool(row[4])}

    async def set_title(self, uid: str, cid: str, title: str) -> None:
        await self.db.execute("UPDATE nola.conversations SET title = %s WHERE id = %s AND user_id = %s",
                              crypto.seal(title.strip()[:80]), cid, uid)

    async def delete_conversation(self, uid: str, cid: str) -> bool:
        await self.db.execute("DELETE FROM nola.chat_messages WHERE conversation_id = %s AND user_id = %s", cid, uid)
        return bool(await self.db.execute("DELETE FROM nola.conversations WHERE id = %s AND user_id = %s", cid, uid))

    # ── messages ──
    async def append(self, uid: str, cid: str, role: str, text: str, **meta: Any) -> None:
        now = _now()
        stored, stored_meta = _pack(text, meta)
        await self.db.execute(
            "INSERT INTO nola.chat_messages (user_id, conversation_id, role, text, meta, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
            uid, cid, role, stored, stored_meta, now)
        await self.db.execute("UPDATE nola.conversations SET updated_at = %s WHERE id = %s AND user_id = %s", now, cid, uid)
        await self.db.execute(
            "INSERT INTO nola.companion_notes (user_id, since_refresh) VALUES (%s, 1) "
            "ON CONFLICT (user_id) DO UPDATE SET since_refresh = nola.companion_notes.since_refresh + 1", uid)
        if role == "user":
            cutoff = now - timedelta(days=self.ttl_days)
            await self.db.execute("DELETE FROM nola.chat_messages WHERE user_id = %s AND created_at < %s", uid, cutoff)
            await self.db.execute("DELETE FROM nola.conversations WHERE user_id = %s AND updated_at < %s", uid, cutoff)

    async def messages(self, uid: str, cid: Optional[str] = None, last: Optional[int] = None) -> list[dict]:
        """One conversation's messages, or (cid=None) her messages across every conversation. Oldest first."""
        limit = last or config.HISTORY_MAX_MESSAGES
        if cid:
            rows = await self.db.fetchall(
                "SELECT id, role, text, meta, created_at FROM nola.chat_messages WHERE user_id = %s AND conversation_id = %s "
                "ORDER BY id DESC LIMIT %s", uid, cid, limit)
        else:
            rows = await self.db.fetchall(
                "SELECT id, role, text, meta, created_at FROM nola.chat_messages WHERE user_id = %s ORDER BY id DESC LIMIT %s",
                uid, limit)
        return [_row_to_msg(*r) for r in reversed(rows)]

    async def search(self, uid: str, query: str, exclude_ids: set[int] = frozenset(), k: int = 4) -> list[dict]:
        """Older user messages from any of her chats that share words with the query: lets the companion recall
        what she said weeks ago. Messages already in the model's recent window are skipped."""
        q = _words(query)
        if not q:
            return []
        msgs = [m for m in await self.messages(uid) if m["id"] not in exclude_ids and m["role"] == "user"]
        scored = [(len(q & _words(m["text"])), i, m) for i, m in enumerate(msgs)]
        top = sorted((s for s in scored if s[0] > 0), key=lambda s: (s[0], s[1]), reverse=True)[:k]
        return [m for _, _, m in sorted(top, key=lambda s: s[1])]

    # ── long-term notes ──
    async def notes(self, uid: str) -> str:
        row = await self.db.fetchone("SELECT notes FROM nola.companion_notes WHERE user_id = %s", uid)
        return crypto.unseal(row[0]) if row else ""

    async def set_notes(self, uid: str, notes: str) -> None:
        await self.db.execute(
            "INSERT INTO nola.companion_notes (user_id, notes, since_refresh, updated_at) VALUES (%s, %s, 0, %s) "
            "ON CONFLICT (user_id) DO UPDATE SET notes = excluded.notes, since_refresh = 0, updated_at = excluded.updated_at",
            uid, crypto.seal(notes), _now())

    async def since_notes(self, uid: str) -> int:
        row = await self.db.fetchone("SELECT since_refresh FROM nola.companion_notes WHERE user_id = %s", uid)
        return row[0] if row else 0

    # ── doctor-visit reports ──
    async def report(self, uid: str, cid: str) -> tuple[Optional[dict], int]:
        """The saved report and how many messages the conversation had when it was made (to spot a stale report)."""
        row = await self.db.fetchone("SELECT report, report_msg_count FROM nola.conversations WHERE id = %s AND user_id = %s", cid, uid)
        if not row or not row[0]:
            return None, 0
        return crypto.unseal_json(row[0]), int(row[1])

    async def set_report(self, uid: str, cid: str, report: dict, msg_count: int) -> None:
        await self.db.execute("UPDATE nola.conversations SET report = %s, report_msg_count = %s WHERE id = %s AND user_id = %s",
                              crypto.seal_json(report), msg_count, cid, uid)

    async def clear(self, uid: str) -> None:
        await self.db.execute("DELETE FROM nola.chat_messages WHERE user_id = %s", uid)
        await self.db.execute("DELETE FROM nola.conversations WHERE user_id = %s", uid)
        await self.db.execute("DELETE FROM nola.companion_notes WHERE user_id = %s", uid)


memory = Memory()

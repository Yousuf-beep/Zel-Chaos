"""Per-user companion memory: every chat message (sakhi.chat_messages) plus a rolling notes summary the model writes
about the user (sakhi.companion_notes). Messages older than HISTORY_TTL_DAYS are pruned.
Without DATABASE_URL (tests, offline development) it keeps everything in process memory instead."""
import json
import re
import time
from typing import Any, Optional

import config
from services.db import Database, db as default_db

_STOP = set("""about after again also always been before being cant could didnt does doing dont during feel feeling from have having
here just know like make more much really should since some still than that thats their them then there these they thing think this
those very want what when where which while will with would your youre yours hello thank thanks okay yeah""".split())


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[^\W\d_]{4,}", text.lower()) if w not in _STOP}


def _row_to_msg(role: str, text: str, meta: Any, created_at: Any) -> dict:
    meta = json.loads(meta) if isinstance(meta, str) else (meta or {})
    at = created_at.timestamp() if hasattr(created_at, "timestamp") else float(created_at)
    return {**meta, "role": role, "text": text, "at": at}


class Memory:
    def __init__(self, database: Database | None = None):
        self.db = database or default_db
        self.ttl_days = config.HISTORY_TTL_DAYS
        self._mem: dict[str, Any] = {}

    @property
    def persistent(self) -> bool:
        return self.db.is_postgres

    @property
    def backend(self) -> str:
        return "postgres" if self.persistent else "memory"

    async def append(self, uid: str, role: str, text: str, **meta: Any) -> None:
        if self.persistent:
            await self.db.execute("INSERT INTO sakhi.chat_messages (user_id, role, text, meta) VALUES (%s, %s, %s, %s)",
                                  uid, role, text, meta)
            await self.db.execute(
                "INSERT INTO sakhi.companion_notes (user_id, since_refresh) VALUES (%s, 1) "
                "ON CONFLICT (user_id) DO UPDATE SET since_refresh = sakhi.companion_notes.since_refresh + 1", uid)
            if role == "user":
                await self.db.execute("DELETE FROM sakhi.chat_messages WHERE user_id = %s AND created_at < now() - make_interval(days => %s)",
                                      uid, self.ttl_days)
            return
        lst = self._mem.setdefault(f"{uid}:messages", [])
        lst.append({**meta, "role": role, "text": text, "at": time.time()})
        del lst[:-config.HISTORY_MAX_MESSAGES]
        self._mem[f"{uid}:since"] = self._mem.get(f"{uid}:since", 0) + 1

    async def messages(self, uid: str, last: Optional[int] = None) -> list[dict]:
        if self.persistent:
            rows = await self.db.fetchall(
                "SELECT role, text, meta, created_at FROM sakhi.chat_messages WHERE user_id = %s ORDER BY id DESC LIMIT %s",
                uid, last or config.HISTORY_MAX_MESSAGES)
            return [_row_to_msg(*r) for r in reversed(rows)]
        lst = self._mem.get(f"{uid}:messages", [])
        return list(lst[-last:] if last else lst)

    async def search(self, uid: str, query: str, skip_recent: int, k: int = 4) -> list[dict]:
        """Older user messages that share words with the query: lets the companion recall what she said weeks ago."""
        q = _words(query)
        if not q:
            return []
        msgs = await self.messages(uid)
        older = msgs[:-skip_recent] if skip_recent else msgs
        scored = [(len(q & _words(m["text"])), i, m) for i, m in enumerate(older) if m["role"] == "user"]
        top = sorted((s for s in scored if s[0] > 0), key=lambda s: (s[0], s[1]), reverse=True)[:k]
        return [m for _, _, m in sorted(top, key=lambda s: s[1])]

    async def notes(self, uid: str) -> str:
        if self.persistent:
            row = await self.db.fetchone("SELECT notes FROM sakhi.companion_notes WHERE user_id = %s", uid)
            return row[0] if row else ""
        return self._mem.get(f"{uid}:notes", "")

    async def set_notes(self, uid: str, notes: str) -> None:
        if self.persistent:
            await self.db.execute(
                "INSERT INTO sakhi.companion_notes (user_id, notes, since_refresh, updated_at) VALUES (%s, %s, 0, now()) "
                "ON CONFLICT (user_id) DO UPDATE SET notes = excluded.notes, since_refresh = 0, updated_at = now()", uid, notes)
            return
        self._mem[f"{uid}:notes"] = notes
        self._mem[f"{uid}:since"] = 0

    async def since_notes(self, uid: str) -> int:
        if self.persistent:
            row = await self.db.fetchone("SELECT since_refresh FROM sakhi.companion_notes WHERE user_id = %s", uid)
            return row[0] if row else 0
        return self._mem.get(f"{uid}:since", 0)

    async def clear(self, uid: str) -> None:
        if self.persistent:
            await self.db.execute("DELETE FROM sakhi.chat_messages WHERE user_id = %s", uid)
            await self.db.execute("DELETE FROM sakhi.companion_notes WHERE user_id = %s", uid)
        for k in [k for k in self._mem if k.startswith(f"{uid}:")]:
            del self._mem[k]


memory = Memory()

"""Database access. Supabase Postgres (asyncpg pool) when DATABASE_URL is set; otherwise a local SQLite file, used by
tests and offline development. SQL is written once: `%s` placeholders and `nola.` table prefixes, rewritten for SQLite.
The Postgres schema lives in supabase/migrations; the SQLite schema below mirrors it."""
import asyncio
import json
import logging
import re
import sqlite3
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

import config

log = logging.getLogger("nola.db")

_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL UNIQUE,
  pw_hash BLOB NOT NULL, salt BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cycle_profiles (user_id TEXT PRIMARY KEY, cycle_length INTEGER NOT NULL, period_length INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS period_starts (user_id TEXT NOT NULL, start_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, start_date));
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, report TEXT, report_msg_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id, updated_at);
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, text TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS chat_messages_conv_idx ON chat_messages (conversation_id, id);
CREATE TABLE IF NOT EXISTS companion_notes (user_id TEXT PRIMARY KEY, notes TEXT NOT NULL DEFAULT '',
  since_refresh INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
"""
_PARAM = re.compile(r"%s")


def _to_pg(sql: str) -> str:
    n = 0

    def repl(_):
        nonlocal n
        n += 1
        return f"${n}"

    return _PARAM.sub(repl, sql)


def _sqlite_value(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return v


class Database:
    def __init__(self, url: str = config.DATABASE_URL, sqlite_path: str = config.AUTH_DB_PATH):
        self.url = url
        self.sqlite_path = sqlite_path
        self._pool = None
        self._sqlite: Optional[sqlite3.Connection] = None
        self._sqlite_lock = threading.Lock()
        self._open_lock = asyncio.Lock()

    @property
    def is_postgres(self) -> bool:
        return bool(self.url)

    @property
    def backend(self) -> str:
        return "postgres" if self.is_postgres else "sqlite"

    async def open(self) -> None:
        if self._pool is not None or self._sqlite is not None:
            return
        async with self._open_lock:
            if self._pool is not None or self._sqlite is not None:
                return
            if self.is_postgres:
                import asyncpg

                async def init(conn):
                    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

                # statement_cache_size=0 keeps it compatible with Supabase's pgbouncer pooler as well as direct connections.
                self._pool = await asyncpg.create_pool(self.url, min_size=1, max_size=config.DB_POOL_MAX,
                                                       statement_cache_size=0, command_timeout=15, init=init)
                log.info("db: connected to Postgres")
            else:
                if self.sqlite_path != ":memory:":
                    Path(self.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
                conn = sqlite3.connect(self.sqlite_path, check_same_thread=False)
                conn.execute("PRAGMA foreign_keys = ON")
                conn.executescript(_SQLITE_SCHEMA)
                self._sqlite = conn
                log.info("db: DATABASE_URL not set; using SQLite at %s", self.sqlite_path)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    def _sqlite_run(self, sql: str, params: tuple, fetch: str):
        sql = sql.replace("nola.", "").replace("%s", "?")
        with self._sqlite_lock:
            cur = self._sqlite.execute(sql, tuple(_sqlite_value(p) for p in params))
            rows = cur.fetchall() if fetch == "all" else cur.fetchone() if fetch == "one" else cur.rowcount
            self._sqlite.commit()
        return rows

    async def execute(self, sql: str, *params: Any) -> int:
        await self.open()
        if self._pool is not None:
            status = await self._pool.execute(_to_pg(sql), *params)
            tail = status.rsplit(" ", 1)[-1]
            return int(tail) if tail.isdigit() else 0
        return self._sqlite_run(sql, params, "none")

    async def fetchone(self, sql: str, *params: Any) -> Optional[tuple]:
        await self.open()
        if self._pool is not None:
            row = await self._pool.fetchrow(_to_pg(sql), *params)
            return tuple(row.values()) if row is not None else None
        return self._sqlite_run(sql, params, "one")

    async def fetchall(self, sql: str, *params: Any) -> list[tuple]:
        await self.open()
        if self._pool is not None:
            return [tuple(r.values()) for r in await self._pool.fetch(_to_pg(sql), *params)]
        return self._sqlite_run(sql, params, "all")


db = Database()

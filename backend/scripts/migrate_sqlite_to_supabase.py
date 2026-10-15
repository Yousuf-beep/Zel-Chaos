"""One-off copy of the old local SQLite data (backend/data/sakhi.db) into Supabase Postgres.

Usage (from backend/):  python scripts/migrate_sqlite_to_supabase.py [path/to/sakhi.db] [--dry-run]

Safe to re-run: every insert is ON CONFLICT DO NOTHING, so rows already in Postgres are left alone.
Expired login tokens are skipped. Chat history was never in SQLite, so there is nothing to copy for it."""
import asyncio
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncpg  # noqa: E402

import config  # noqa: E402


def _ts(v) -> datetime:
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v, tz=timezone.utc)
    d = datetime.fromisoformat(str(v))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _tables(con: sqlite3.Connection) -> set[str]:
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


async def main(path: Path, dry_run: bool) -> None:
    if not config.DATABASE_URL:
        sys.exit("DATABASE_URL is not set in .env")
    if not path.is_file():
        sys.exit(f"No SQLite file at {path}")
    src = sqlite3.connect(path)
    tables = _tables(src)
    token_table = "auth_tokens" if "auth_tokens" in tables else "tokens"
    now = datetime.now(timezone.utc)

    users = src.execute("SELECT id, name, handle, pw_hash, salt, created_at FROM users").fetchall() if "users" in tables else []
    tokens = [t for t in src.execute(f"SELECT token_hash, user_id, expires_at FROM {token_table}").fetchall()
              if _ts(t[2]) > now] if token_table in tables else []
    profiles = src.execute("SELECT user_id, cycle_length, period_length, updated_at FROM cycle_profiles").fetchall() \
        if "cycle_profiles" in tables else []
    starts = src.execute("SELECT user_id, start_date FROM period_starts").fetchall() if "period_starts" in tables else []
    user_ids = {u[0] for u in users}
    print(f"SQLite {path}: {len(users)} users, {len(tokens)} live tokens, {len(profiles)} cycle profiles, {len(starts)} period starts")
    if dry_run:
        return

    con = await asyncpg.connect(config.DATABASE_URL, statement_cache_size=0)
    try:
        async with con.transaction():
            r_users = await con.executemany(
                "INSERT INTO sakhi.users (id, name, handle, pw_hash, salt, created_at) VALUES ($1, $2, $3, $4, $5, $6) "
                "ON CONFLICT DO NOTHING", [(u[0], u[1], u[2], bytes(u[3]), bytes(u[4]), _ts(u[5])) for u in users])
            await con.executemany(
                "INSERT INTO sakhi.auth_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                [(t[0], t[1], _ts(t[2])) for t in tokens if t[1] in user_ids])
            await con.executemany(
                "INSERT INTO sakhi.cycle_profiles (user_id, cycle_length, period_length, updated_at) VALUES ($1, $2, $3, $4) "
                "ON CONFLICT DO NOTHING", [(p[0], p[1], p[2], _ts(p[3])) for p in profiles if p[0] in user_ids])
            await con.executemany(
                "INSERT INTO sakhi.period_starts (user_id, start_date) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                [(s[0], datetime.fromisoformat(s[1]).date()) for s in starts if s[0] in user_ids])
        counts = {t: await con.fetchval(f"SELECT count(*) FROM sakhi.{t}")
                  for t in ("users", "auth_tokens", "cycle_profiles", "period_starts")}
        print("Postgres now has:", counts)
    finally:
        await con.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    asyncio.run(main(Path(args[0]) if args else Path(config.BASE_DIR / "data" / "sakhi.db"), "--dry-run" in sys.argv))

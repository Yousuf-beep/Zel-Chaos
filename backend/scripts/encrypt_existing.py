"""One-off: seals chat data written before encryption existed (chat text + meta, Nola's notes, chat titles).

Usage (from backend/):  python scripts/encrypt_existing.py [--dry-run]
Needs DATABASE_URL and DATA_ENCRYPTION_KEY. Rows already starting with "enc1:" are skipped, so it is safe to re-run.
Keep DATA_ENCRYPTION_KEY backed up: without it, sealed rows cannot be read."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncpg  # noqa: E402

import config  # noqa: E402
from services import crypto  # noqa: E402


class _DryRun(Exception):
    pass


async def main(dry: bool) -> None:
    if not config.DATABASE_URL or not crypto.enabled():
        sys.exit("DATABASE_URL and DATA_ENCRYPTION_KEY must both be set.")
    conn = await asyncpg.connect(config.DATABASE_URL, statement_cache_size=0)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    try:
        async with conn.transaction():
            msgs = await conn.fetch("SELECT id, text, meta FROM nola.chat_messages WHERE text NOT LIKE 'enc1:%'")
            for r in msgs:
                sealed = crypto.seal_json({"t": r["text"], "m": r["meta"] or {}})
                await conn.execute("UPDATE nola.chat_messages SET text = $1, meta = '{}'::jsonb WHERE id = $2", sealed, r["id"])
            notes = await conn.fetch("SELECT user_id, notes FROM nola.companion_notes WHERE notes <> '' AND notes NOT LIKE 'enc1:%'")
            for r in notes:
                await conn.execute("UPDATE nola.companion_notes SET notes = $1 WHERE user_id = $2", crypto.seal(r["notes"]), r["user_id"])
            titles = await conn.fetch("SELECT id, title FROM nola.conversations WHERE title <> '' AND title NOT LIKE 'enc1:%'")
            for r in titles:
                await conn.execute("UPDATE nola.conversations SET title = $1 WHERE id = $2", crypto.seal(r["title"]), r["id"])
            print(f"{'would seal' if dry else 'sealed'}: {len(msgs)} messages, {len(notes)} notes, {len(titles)} titles")
            if dry:
                raise _DryRun  # leaves the transaction rolled back
    except _DryRun:
        pass
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))

"""Applies one SQL migration file to DATABASE_URL in a single transaction.

Usage (from backend/):  python scripts/apply_migration.py ../supabase/migrations/<file>.sql
The migrations are written to be idempotent (IF NOT EXISTS / ON CONFLICT), so re-running one is harmless."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncpg  # noqa: E402

import config  # noqa: E402


async def main(path: Path) -> None:
    if not config.DATABASE_URL:
        sys.exit("DATABASE_URL is not set.")
    sql = path.read_text(encoding="utf-8")
    conn = await asyncpg.connect(config.DATABASE_URL, statement_cache_size=0)
    try:
        async with conn.transaction():
            await conn.execute(sql)
    finally:
        await conn.close()
    print(f"applied {path.name}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    asyncio.run(main(Path(sys.argv[1])))

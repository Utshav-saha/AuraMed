"""
Migration runner. python migrations/run.py [file.sql ...]
Default e 001_fixes.sql chalay. Resend key ta purono function body theke
tule vault e rakhe (jodi age theke na thake).
"""
import asyncio, os, re, sys, pathlib
import asyncpg
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parent
load_dotenv(ROOT.parent / "app" / ".env")


async def move_resend_key_to_vault(conn):
    has = await conn.fetchval("select count(*) from vault.secrets where name = 'resend_api_key'")
    if has:
        return "vault: already set"
    src = await conn.fetchval(
        "select pg_get_functiondef(p.oid) from pg_proc p where proname = 'process_medicine_reminders'"
    ) or ""
    m = re.search(r"resend_api_key text := '([^']+)'", src)
    if not m or m.group(1).lower().startswith("resend api"):
        return "vault: no key found in old function, set manually: select vault.create_secret('<key>', 'resend_api_key')"
    await conn.execute("select vault.create_secret($1, 'resend_api_key')", m.group(1))
    return "vault: key copied"


async def main(files):
    conn = await asyncpg.connect(os.environ["DATABASE_URL"], statement_cache_size=0)
    try:
        print(await move_resend_key_to_vault(conn))
        for f in files:
            sql = (ROOT / f).read_text()
            await conn.execute(sql)
            print("applied", f)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["001_fixes.sql"]))

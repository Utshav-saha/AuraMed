import os
import asyncio
from contextlib import asynccontextmanager

import asyncpg
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
from google import genai
from google.genai import errors as genai_errors
from fastapi import HTTPException

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_KEY2 = os.getenv("GEMINI_API_KEY2") or GEMINI_API_KEY
DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
gemini_client2 = genai.Client(api_key=GEMINI_API_KEY2)

print("Loading nomic embedding model...")
model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)


# ── db pool ──
# supabase pooler (6543) e prepared statement cache off rakhte hobe, nahole random error
_pool: asyncpg.Pool | None = None


async def open_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=1, max_size=8, statement_cache_size=0
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_conn():
    pool = await open_pool()
    async with pool.acquire() as conn:
        yield conn


# ── embedding ──
# model.encode blocking, event loop atkay jay, tai thread e
async def embed_query(text: str) -> list[float]:
    vec = await asyncio.to_thread(model.encode, f"search_query: {text}")
    return vec.tolist()


def gemini_error_to_http(e: Exception) -> HTTPException:
    if isinstance(e, genai_errors.APIError) and getattr(e, "code", None) == 429:
        return HTTPException(503, "AI service is busy right now, try again in a minute.")
    return HTTPException(502, f"AI service error: {e}")

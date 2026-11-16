import json
import re
from typing import AsyncGenerator, Optional
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import supabase, gemini_client, get_conn, embed_query, GEMINI_MODEL

router = APIRouter()


class Turn(BaseModel):
    role: str  # user | assistant
    text: str


class ChatRequest(BaseModel):
    user_question: str
    generic_id: Optional[int] = None
    history: list[Turn] = []


# ── routing: regex diye, gemini lagena ──
_ROUTES = [
    (r"\b(cart|basket|my orders?|checkout)\b", lambda m, q: "/cart", "Opening your cart"),
    (r"\b(scan|upload)\b.*\b(prescription|script|rx)\b", lambda m, q: "/dashboard?scan=1", "Opening the prescription scanner"),
    (r"\b(remind(er|ers)?|alarm)\b", lambda m, q: "/dashboard#reminders", "Opening your reminders"),
    (r"\b(dos(e|age) calc(ulator)?|how many (tablets|pills|doses))\b", lambda m, q: "/dosage", "Opening the dosage calculator"),
    (r"\b(book|appointment|see|visit|consult)\b.*?\b(doctor|dr\.?|specialist|cardiologist|dermatologist|neurologist|physician|gynecologist|pediatrician|ophthalmologist|ent|dentist|orthopedic|psychiatrist|urologist)\b",
     lambda m, q: "/appointments?q=" + quote(m.group(2)) if m.group(2) not in ("doctor", "dr", "dr.", "specialist") else "/appointments",
     "Opening appointments"),
    (r"\b(appointments?)\b", lambda m, q: "/appointments", "Opening appointments"),
    (r"\b(pharmac(y|ies)|drug ?store|where (can i|to) (buy|get|find))\b(?:.*?\b(for|buy|get|find)\b\s+(?P<med>[a-z0-9 \-]+))?",
     lambda m, q: "/location?q=" + quote(m.group("med").strip()) if m.group("med") else "/location",
     "Finding nearby pharmacies"),
    (r"\b(search|find|look ?up|show)\b\s+(?:for\s+)?(?:medicine\s+)?(?P<med>[a-z0-9 \-]{2,})", lambda m, q: "/medicines?q=" + quote(m.group("med").strip()), "Searching medicines"),
    (r"\b(dashboard|home)\b", lambda m, q: "/dashboard", "Going to your dashboard"),
]

# ei word gulo thakle eta question, route na
_QUESTION_HINT = re.compile(r"\b(what|why|how|when|can i|should i|is it|does|side effect|dose|safe|interact|pregnan)\b", re.I)


def detect_route(q: str) -> Optional[tuple[str, str]]:
    s = q.strip().lower()
    for pat, build, label in _ROUTES:
        m = re.search(pat, s, re.I)
        if m:
            path = build(m, s)
            # "search napa" type command e question hint thakle route dei na
            if pat.startswith(r"\b(search") and _QUESTION_HINT.search(s):
                return None
            return path, label
    return None


_RED_FLAGS = re.compile(
    r"\b(chest pain|can'?t breathe|difficulty breathing|unconscious|overdos(e|ed)|suicid|seizure|stroke|heavy bleeding|anaphyla)",
    re.I,
)

SYSTEM = (
    "You are AuraMed's medicine information assistant for patients in Bangladesh.\n"
    "Rules:\n"
    "1. Answer ONLY using the LEAFLET CONTEXT below. If the answer isn't there, say: "
    "\"I couldn't find that in the official leaflet. Please ask a pharmacist or doctor.\"\n"
    "2. Only medicine and health-safety topics. For anything else, politely decline in one sentence.\n"
    "3. Never diagnose, never tell the user which medicine to take or change a prescribed dose. "
    "You may explain what the leaflet says about dosage ranges.\n"
    "4. Be short and clear. Use plain language, short paragraphs or bullets. No markdown headers.\n"
    "5. End with one short line reminding them to confirm with their doctor or pharmacist when relevant.\n"
)


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


async def _leaflet_for_generic(conn, generic_id: int) -> Optional[dict]:
    r = await conn.fetchrow(
        """
        SELECT id, name, indication_description, dosage_description, administration_description, side_effects_description,
               contraindications_description, interaction_description, precautions_description,
               pregnancy_and_lactation_description, overdose_effects_description, pediatric_usage_description
        FROM generics WHERE id = $1
        """,
        generic_id,
    )
    return dict(r) if r else None


def _leaflet_text(g: dict) -> str:
    parts = [
        ("INDICATIONS", g.get("indication_description")), ("DOSAGE", g.get("dosage_description")),
        ("ADMINISTRATION", g.get("administration_description")), ("SIDE EFFECTS", g.get("side_effects_description")),
        ("CONTRAINDICATIONS", g.get("contraindications_description")), ("INTERACTIONS", g.get("interaction_description")),
        ("PRECAUTIONS", g.get("precautions_description")), ("PREGNANCY & LACTATION", g.get("pregnancy_and_lactation_description")),
        ("OVERDOSE", g.get("overdose_effects_description")), ("PEDIATRIC USE", g.get("pediatric_usage_description")),
    ]
    body = "\n".join(f"{k}: {v}" for k, v in parts if v)
    return f"=== {g['name']} ===\n{body}"


async def _find_named_generic(conn, q: str) -> Optional[int]:
    # question er vitore brand/generic naam ache kina, longest word gulo age try kori
    words = re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", q)
    for w in sorted(set(words), key=len, reverse=True)[:6]:
        r = await conn.fetchrow(
            """
            SELECT g.id FROM generics g WHERE lower(g.name) = lower($1)
            UNION ALL
            SELECT m.generic_id FROM medicines m WHERE lower(m.brand_name) = lower($1) AND m.generic_id IS NOT NULL
            LIMIT 1
            """,
            w,
        )
        if r:
            return r["id"]
    return None


async def _build_context(q: str, generic_id: Optional[int]) -> tuple[str, list[str]]:
    async with get_conn() as conn:
        gid = generic_id or await _find_named_generic(conn, q)
        if gid:
            g = await _leaflet_for_generic(conn, gid)
            if g:
                return _leaflet_text(g), [g["name"]]
    # last resort: semantic
    vec = await embed_query(q)
    res = supabase.rpc("match_leaflets", {
        "query_embedding": vec, "match_threshold": 0.4, "match_count": 3, "target_generic_id": None,
    }).execute()
    rows = res.data or []
    return "\n\n".join(f"=== {r['generic_name']} ===\n{r['content']}" for r in rows), [r["generic_name"] for r in rows]


async def _stream(req: ChatRequest) -> AsyncGenerator[str, None]:
    q = req.user_question.strip()

    if _RED_FLAGS.search(q):
        yield _sse({"t": "This sounds like it could be an emergency. Please call 999 or go to the nearest hospital emergency department right now. "
                       "I can only share leaflet information and cannot help in an emergency."})
        yield _sse({"done": True})
        return

    route = detect_route(q)
    if route:
        path, label = route
        yield _sse({"route": path, "t": label + "…"})
        yield _sse({"done": True})
        return

    try:
        context, sources = await _build_context(q, req.generic_id)
    except Exception as e:
        yield _sse({"t": f"Could not look up the leaflet right now ({e})."})
        yield _sse({"done": True})
        return

    if sources:
        yield _sse({"sources": sources})

    history = "\n".join(f"{'User' if t.role == 'user' else 'Assistant'}: {t.text}" for t in req.history[-6:])
    prompt = (
        f"{SYSTEM}\nLEAFLET CONTEXT:\n{context or '(empty)'}\n\n"
        f"{'CONVERSATION SO FAR:' + chr(10) + history + chr(10) if history else ''}"
        f"User: {q}\nAssistant:"
    )
    try:
        async for chunk in await gemini_client.aio.models.generate_content_stream(model=GEMINI_MODEL, contents=prompt):
            if chunk.text:
                yield _sse({"t": chunk.text})
    except Exception as e:
        msg = "The assistant is busy right now (free quota). Please try again in a minute." if "429" in str(e) else f"Assistant error: {e}"
        yield _sse({"t": msg})
    yield _sse({"done": True})


@router.post("/chatbot")
async def chat(req: ChatRequest):
    return StreamingResponse(_stream(req), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

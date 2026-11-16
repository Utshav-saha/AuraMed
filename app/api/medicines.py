import json
import re
from collections import OrderedDict
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from google.genai import types
from pydantic import BaseModel

from app.database import supabase, gemini_client, get_conn, embed_query, GEMINI_MODEL
from app.api.utils import parse_unit_price, parse_pack_price

router = APIRouter()


class SearchResponse(BaseModel):
    medicine_id: int
    brand_name: str
    strength: Optional[str] = None
    manufacturer_name: Optional[str] = None
    generic_name: Optional[str] = None
    similarity: float
    dosage_form: Optional[str] = None
    unit_price: Optional[float] = None


class QueryAnalysis(BaseModel):
    search_type: str
    optimized_query: str


class Suggestion(BaseModel):
    kind: str  # brand | generic
    label: str
    medicine_id: Optional[int] = None
    generic_id: Optional[int] = None
    sub: Optional[str] = None


class Alternative(BaseModel):
    medicine_id: int
    brand_name: str
    strength: Optional[str]
    manufacturer_name: Optional[str]
    dosage_form: Optional[str]
    unit_price: Optional[float]


class MedicineDetails(BaseModel):
    id: int
    brand_name: str
    drug_type: Optional[str] = None
    slug: Optional[str] = None
    strength: Optional[str] = None
    package_container: Optional[str] = None
    package_size: Optional[str] = None
    unit_price: Optional[float] = None
    pack_price: Optional[float] = None
    manufacturer_name: Optional[str] = None
    dosage_form: Optional[str] = None
    dosage_form_id: Optional[int] = None
    generic_id: Optional[int] = None
    generic_name: Optional[str] = None
    drug_class_name: Optional[str] = None
    indication_name: Optional[str] = None
    indication_description: Optional[str] = None
    therapeutic_class_description: Optional[str] = None
    pharmacology_description: Optional[str] = None
    dosage_description: Optional[str] = None
    administration_description: Optional[str] = None
    interaction_description: Optional[str] = None
    contraindications_description: Optional[str] = None
    side_effects_description: Optional[str] = None
    pregnancy_and_lactation_description: Optional[str] = None
    precautions_description: Optional[str] = None
    pediatric_usage_description: Optional[str] = None
    overdose_effects_description: Optional[str] = None
    duration_of_treatment_description: Optional[str] = None
    reconstitution_description: Optional[str] = None
    storage_conditions_description: Optional[str] = None


# gemini free tier, tai same query abar asle cache theke dei
_analysis_cache: "OrderedDict[str, QueryAnalysis]" = OrderedDict()
_CACHE_MAX = 500


def _cache_get(key: str) -> Optional[QueryAnalysis]:
    if key in _analysis_cache:
        _analysis_cache.move_to_end(key)
        return _analysis_cache[key]
    return None


def _cache_put(key: str, val: QueryAnalysis):
    _analysis_cache[key] = val
    if len(_analysis_cache) > _CACHE_MAX:
        _analysis_cache.popitem(last=False)


async def _looks_like_name(conn, q: str) -> bool:
    # brand/generic er sathe prefix match thakle gemini lagbe na
    like = q.lower() + "%"
    if await conn.fetchrow("SELECT 1 FROM medicines WHERE lower(brand_name) LIKE $1 LIMIT 1", like):
        return True
    return bool(await conn.fetchrow("SELECT 1 FROM generics WHERE lower(name) LIKE $1 LIMIT 1", like))


async def _analyze_with_gemini(q: str) -> QueryAnalysis:
    key = re.sub(r"\s+", " ", q.strip().lower())
    if cached := _cache_get(key):
        return cached
    prompt = (
        f'Classify this pharmacy search query: "{q}"\n'
        "If it names a medicine brand or generic, search_type='NAME' and optimized_query=the clean name.\n"
        "If it describes symptoms or a condition, search_type='SYMPTOM' and expand optimized_query into "
        "clinical terms and the drug classes that treat it (e.g. 'Migraine, analgesics, NSAIDs, triptans')."
    )
    resp = await gemini_client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=QueryAnalysis),
    )
    analysis = QueryAnalysis(**json.loads(resp.text))
    _cache_put(key, analysis)
    return analysis


async def _enrich(conn, rows: list[dict]) -> list[dict]:
    if not rows:
        return rows
    extra = await conn.fetch(
        """
        SELECT m.id, m.package_container, d.name AS dosage_form
        FROM medicines m LEFT JOIN dosage_forms d ON d.id = m.dosage_form_id
        WHERE m.id = ANY($1::bigint[])
        """,
        [r["medicine_id"] for r in rows],
    )
    by_id = {r["id"]: r for r in extra}
    for r in rows:
        if e := by_id.get(r["medicine_id"]):
            r["dosage_form"] = e["dosage_form"]
            r["unit_price"] = parse_unit_price(e["package_container"])
    return rows


@router.get("/suggest", response_model=list[Suggestion])
async def suggest(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    q = q.strip().lower()
    if not q:
        return []
    async with get_conn() as conn:
        brands = await conn.fetch(
            """
            SELECT DISTINCT ON (lower(m.brand_name)) m.id, m.brand_name, g.name AS generic_name
            FROM medicines m LEFT JOIN generics g ON g.id = m.generic_id
            WHERE lower(m.brand_name) LIKE $1
            ORDER BY lower(m.brand_name), m.id
            LIMIT $2
            """,
            q + "%", limit,
        )
        gens = await conn.fetch(
            "SELECT id, name FROM generics WHERE lower(name) LIKE $1 ORDER BY name LIMIT $2",
            q + "%", max(2, limit // 2),
        )
    out = [Suggestion(kind="brand", label=r["brand_name"], medicine_id=r["id"], sub=r["generic_name"]) for r in brands]
    out += [Suggestion(kind="generic", label=r["name"], generic_id=r["id"], sub="Generic") for r in gens]
    return out[:limit]


@router.get("/search-medicines", response_model=list[SearchResponse])
async def search(q: str = Query(...), limit: int = Query(10, ge=1, le=50)):
    q = q.strip()
    if not q:
        raise HTTPException(400, "Search query cannot be empty")

    async with get_conn() as conn:
        if await _looks_like_name(conn, q):
            search_type, optimized = "NAME", q
        else:
            try:
                a = await _analyze_with_gemini(q)
                search_type, optimized = a.search_type, a.optimized_query
            except Exception as e:
                # gemini down/quota sesh hole raw text diyei symptom search
                print("gemini analyze failed:", e)
                search_type, optimized = "SYMPTOM", q

        vec = await embed_query(optimized)
        if search_type == "NAME":
            fn, threshold = "match_medicines_by_name", 0.60
        else:
            fn, threshold = "match_medicines_by_symptom", 0.45

        try:
            res = supabase.rpc(fn, {"query_embedding": vec, "match_threshold": threshold, "match_count": limit}).execute()
        except Exception as e:
            raise HTTPException(500, f"Search error: {e}")

        return await _enrich(conn, res.data or [])


@router.get("/fetch_medicine_details", response_model=MedicineDetails)
async def fetch_medicine_details(medicine_id: int):
    async with get_conn() as conn:
        r = await conn.fetchrow(
            """
            SELECT m.id, m.brand_name, m.type, m.slug, m.strength, m.package_container, m.package_size,
                   m.manufacturer_name, m.dosage_form_id, d.name AS dosage_form, m.generic_id,
                   g.name AS generic_name, g.indication_name, g.indication_description,
                   g.therapeutic_class_description, g.pharmacology_description, g.dosage_description,
                   g.administration_description, g.interaction_description, g.contraindications_description,
                   g.side_effects_description, g.pregnancy_and_lactation_description, g.precautions_description,
                   g.pediatric_usage_description, g.overdose_effects_description,
                   g.duration_of_treatment_description, g.reconstitution_description,
                   g.storage_conditions_description, dc.name AS drug_class_name
            FROM medicines m
            LEFT JOIN dosage_forms d ON m.dosage_form_id = d.id
            LEFT JOIN generics g ON m.generic_id = g.id
            LEFT JOIN drug_classes dc ON g.drug_class_id = dc.id
            WHERE m.id = $1
            """,
            medicine_id,
        )
    if not r:
        raise HTTPException(404, "Medicine not found")
    data = dict(r)
    data["drug_type"] = data.pop("type")
    data["unit_price"] = parse_unit_price(data["package_container"])
    data["pack_price"] = parse_pack_price(data["package_size"])
    return MedicineDetails(**data)


@router.get("/alternatives", response_model=list[Alternative])
async def alternatives(medicine_id: int, limit: int = Query(20, ge=1, le=50)):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT o.id, o.brand_name, o.strength, o.manufacturer_name, o.package_container, d.name AS dosage_form
            FROM medicines m
            JOIN medicines o ON o.generic_id = m.generic_id AND o.id <> m.id
                 AND (o.dosage_form_id = m.dosage_form_id OR m.dosage_form_id IS NULL)
            LEFT JOIN dosage_forms d ON d.id = o.dosage_form_id
            WHERE m.id = $1 AND m.generic_id IS NOT NULL
            ORDER BY (o.strength = m.strength) DESC, o.brand_name
            LIMIT $2
            """,
            medicine_id, limit,
        )
    out = [
        Alternative(
            medicine_id=r["id"], brand_name=r["brand_name"], strength=r["strength"],
            manufacturer_name=r["manufacturer_name"], dosage_form=r["dosage_form"],
            unit_price=parse_unit_price(r["package_container"]),
        )
        for r in rows
    ]
    out.sort(key=lambda a: (a.unit_price is None, a.unit_price or 0))
    return out

import math
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import supabase, get_conn

router = APIRouter()


class SearchRequest(BaseModel):
    user_lat: float
    user_lng: float
    search_radius_meters: float = 5000.0
    target_medicine_ids: list[int]
    target_dosage_forms: list[int] = []
    target_quantities: list[int] = []


class CartItem(BaseModel):
    provided_medicine_id: int
    provided_medicine_name: str
    target_medicine_id: int
    is_exact: bool
    stock_count: int


class PharmacyBase(BaseModel):
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    lat: Optional[float] = None
    lng: Optional[float] = None


class OneStopShop(PharmacyBase):
    items: List[CartItem]


class MultiStopItem(BaseModel):
    target_medicine_id: int
    target_medicine_name: str
    provided_medicine_id: int
    provided_medicine_name: str
    is_exact: bool
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    lat: Optional[float] = None
    lng: Optional[float] = None
    stop_order: int


class PartialMatch(PharmacyBase):
    available_medicines: List[CartItem]
    medicine_count: int


class CartResult(BaseModel):
    one_stop_options: List[OneStopShop]
    multi_stop_route: List[MultiStopItem]
    missing_medicine_ids: List[int]
    partial_matches: List[PartialMatch]
    target_names: dict[int, str]


class CheckPharmacyRequest(BaseModel):
    pharmacy_id: int
    medicine_ids: list[int]
    quantities: list[int] = []


class CheckPharmacyItem(BaseModel):
    medicine_id: int
    brand_name: str
    in_stock: bool
    stock_count: int
    substitutes: List[CartItem]


def _haversine(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def _med_names(conn, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = await conn.fetch("SELECT id, brand_name, strength FROM medicines WHERE id = ANY($1::bigint[])", ids)
    return {r["id"]: f"{r['brand_name']} {r['strength']}".strip() if r["strength"] else r["brand_name"] for r in rows}


async def _pharmacy_coords(conn, ids: list[int]) -> dict[int, tuple[float, float]]:
    if not ids:
        return {}
    rows = await conn.fetch(
        "SELECT id, ST_Y(coordinates::geometry) lat, ST_X(coordinates::geometry) lng FROM pharmacies WHERE id = ANY($1::bigint[])",
        ids,
    )
    return {r["id"]: (r["lat"], r["lng"]) for r in rows}


@router.post("/search-pharmacies", response_model=CartResult)
async def search_pharmacies(req: SearchRequest):
    targets = req.target_medicine_ids
    if not targets:
        raise HTTPException(400, "No medicines given")
    n = len(targets)
    qtys = (req.target_quantities + [1] * n)[:n]

    async with get_conn() as conn:
        meta = await conn.fetch(
            """
            SELECT u.id, COALESCE(m.generic_id, 0) generic_id, COALESCE(m.dosage_form_id, 0) dosage_form_id
            FROM unnest($1::bigint[]) WITH ORDINALITY u(id, ord) LEFT JOIN medicines m ON m.id = u.id ORDER BY u.ord
            """,
            targets,
        )
        generic_ids = [r["generic_id"] for r in meta]
        # client dosage form na pathale DB theke
        forms = (req.target_dosage_forms + [0] * n)[:n]
        forms = [f if f else r["dosage_form_id"] for f, r in zip(forms, meta)]

        # ek generic e ekadhik target thakte pare, tai list
        gen_to_targets: dict[int, list[int]] = defaultdict(list)
        for r in meta:
            if r["generic_id"]:
                gen_to_targets[r["generic_id"]].append(r["id"])

        try:
            data = supabase.rpc("find_nearby_pharmacy", {
                "user_lat": req.user_lat, "user_lng": req.user_lng,
                "search_radius_meters": req.search_radius_meters,
                "target_medicine_ids": targets, "target_generic_ids": generic_ids,
                "target_dosage_form_ids": forms, "target_quantities": qtys,
            }).execute().data or []
        except Exception as e:
            raise HTTPException(500, f"Database error: {e}")

        names = await _med_names(conn, list({r["available_medicine_id"] for r in data} | set(targets)))
        coords = await _pharmacy_coords(conn, list({r["pharmacy_id"] for r in data}))

    # ekta row kon kon target cover kore
    def covers(row) -> list[int]:
        if row["is_exact_match"]:
            return [row["available_medicine_id"]]
        return gen_to_targets.get(row["available_generic_id"], [])

    def to_item(row, target_id) -> CartItem:
        return CartItem(
            provided_medicine_id=row["available_medicine_id"],
            provided_medicine_name=names.get(row["available_medicine_id"], "Unknown"),
            target_medicine_id=target_id, is_exact=row["is_exact_match"], stock_count=row["stock_count"],
        )

    by_pharmacy: dict[int, list] = defaultdict(list)
    for row in data:
        by_pharmacy[row["pharmacy_id"]].append(row)

    one_stop, partial = [], []
    for pid, rows in by_pharmacy.items():
        best: dict[int, CartItem] = {}  # target -> best offer, exact wins
        for row in rows:
            for t in covers(row):
                cur = best.get(t)
                if cur is None or (row["is_exact_match"] and not cur.is_exact):
                    best[t] = to_item(row, t)
        lat, lng = coords.get(pid, (None, None))
        base = dict(pharmacy_id=pid, pharmacy_name=rows[0]["pharmacy_name"],
                    distance_meters=rows[0]["distance_meters"], lat=lat, lng=lng)
        items = sorted(best.values(), key=lambda i: targets.index(i.target_medicine_id))
        if len(best) == n:
            one_stop.append(OneStopShop(**base, items=items))
        partial.append(PartialMatch(**base, available_medicines=items, medicine_count=len(best)))

    one_stop.sort(key=lambda x: x.distance_meters)
    partial.sort(key=lambda x: (-x.medicine_count, x.distance_meters))

    # multi-stop: protita target er jonno closest exact, na thakle closest substitute
    route: list[MultiStopItem] = []
    missing = []
    for t in targets:
        exact = [r for r in data if r["is_exact_match"] and r["available_medicine_id"] == t]
        subs = [r for r in data if not r["is_exact_match"] and t in covers(r)]
        pool = exact or subs
        if not pool:
            missing.append(t)
            continue
        r = min(pool, key=lambda x: x["distance_meters"])
        lat, lng = coords.get(r["pharmacy_id"], (None, None))
        route.append(MultiStopItem(
            target_medicine_id=t, target_medicine_name=names.get(t, "Unknown"),
            provided_medicine_id=r["available_medicine_id"],
            provided_medicine_name=names.get(r["available_medicine_id"], "Unknown"),
            is_exact=r["is_exact_match"], pharmacy_id=r["pharmacy_id"], pharmacy_name=r["pharmacy_name"],
            distance_meters=r["distance_meters"], lat=lat, lng=lng, stop_order=0,
        ))

    # stop order: user theke nearest-neighbour
    ordered, cur = [], (req.user_lat, req.user_lng)
    pending = {}
    for item in route:
        pending.setdefault(item.pharmacy_id, []).append(item)
    k = 1
    while pending:
        pid = min(pending, key=lambda p: _haversine(*cur, *(coords.get(p) or cur)))
        for item in pending.pop(pid):
            item.stop_order = k
            ordered.append(item)
        cur = coords.get(pid) or cur
        k += 1

    return CartResult(
        one_stop_options=one_stop[:5], multi_stop_route=ordered, missing_medicine_ids=missing,
        partial_matches=partial[:8], target_names={t: names.get(t, "Unknown") for t in targets},
    )


@router.post("/check-pharmacy", response_model=List[CheckPharmacyItem])
async def check_pharmacy(req: CheckPharmacyRequest):
    n = len(req.medicine_ids)
    qtys = (req.quantities + [1] * n)[:n]
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            WITH want AS (
              SELECT * FROM unnest($2::bigint[], $3::int[]) AS w(med_id, qty)
            ),
            stock AS (
              SELECT pi.medicine_id, sum(pi.stock_count)::int total
              FROM pharmacy_inventory pi
              WHERE pi.pharmacy_id = $1 AND pi.is_recalled = false AND pi.expiry_date >= current_date
              GROUP BY pi.medicine_id
            )
            SELECT w.med_id, w.qty, tm.brand_name, tm.strength, tm.generic_id, tm.dosage_form_id,
                   COALESCE(s.total, 0) AS own_stock,
                   sm.id AS sub_id, sm.brand_name AS sub_brand, sm.strength AS sub_strength, ss.total AS sub_stock
            FROM want w
            JOIN medicines tm ON tm.id = w.med_id
            LEFT JOIN stock s ON s.medicine_id = w.med_id
            LEFT JOIN (medicines sm JOIN stock ss ON ss.medicine_id = sm.id)
                   ON sm.generic_id = tm.generic_id AND sm.dosage_form_id = tm.dosage_form_id
                  AND sm.id <> tm.id AND ss.total >= w.qty
            ORDER BY w.med_id
            """,
            req.pharmacy_id, req.medicine_ids, qtys,
        )
    out: dict[int, CheckPharmacyItem] = {}
    for r in rows:
        it = out.get(r["med_id"])
        if not it:
            it = out[r["med_id"]] = CheckPharmacyItem(
                medicine_id=r["med_id"], brand_name=f"{r['brand_name']} {r['strength'] or ''}".strip(),
                in_stock=r["own_stock"] >= r["qty"], stock_count=r["own_stock"], substitutes=[],
            )
        if r["sub_id"] and r["sub_stock"]:
            it.substitutes.append(CartItem(
                provided_medicine_id=r["sub_id"], provided_medicine_name=f"{r['sub_brand']} {r['sub_strength'] or ''}".strip(),
                target_medicine_id=r["med_id"], is_exact=False, stock_count=r["sub_stock"],
            ))
    return [out[m] for m in req.medicine_ids if m in out]


@router.get("/search-by-name")
async def search_pharmacies_by_name(q: str, limit: int = 5):
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, store_name, ST_Y(coordinates::geometry) lat, ST_X(coordinates::geometry) lng FROM pharmacies WHERE store_name ILIKE $1 LIMIT $2",
            f"%{q}%", limit,
        )
    return [{"pharmacy_id": r["id"], "pharmacy_name": r["store_name"], "lat": r["lat"], "lng": r["lng"]} for r in rows]

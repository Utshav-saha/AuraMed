from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncpg
from collections import defaultdict

from app.database import supabase, DATABASE_URL

router = APIRouter()


# ── Raw RPC row (returned by find_nearby_pharmacy) ─────────────
class SearchResponse(BaseModel):
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    available_medicine_id: int
    available_generic_id: int
    stock_count: int
    is_exact_match: bool


# ── Request ─────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    user_lat: float
    user_lng: float
    search_radius_meters: Optional[float] = 5000.0
    target_medicine_ids: list[int]
    target_quantities: list[int]


# ── Response models ─────────────────────────────────────────────
class CartItem(BaseModel):
    provided_medicine_id: int
    is_exact: bool
    stock_count: int


class OneStopShop(BaseModel):
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    items: List[CartItem]


class MultiStopItem(BaseModel):
    medicine_id: int
    pharmacy_name: str
    distance_meters: float


class AvailableMed(BaseModel):
    medicine_id: int
    stock_count: int
    is_exact: bool


class PartialMatch(BaseModel):
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    available_medicines: List[AvailableMed]
    medicine_count: int


class CartResult(BaseModel):
    one_stop_options: List[OneStopShop]
    multi_stop_route: List[MultiStopItem]
    partial_matches: List[PartialMatch]


# ── Endpoints ───────────────────────────────────────────────────

@router.post("/search-pharmacies", response_model=CartResult)
async def search_pharmacies(request: SearchRequest):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        generic_rows = await conn.fetch(
            "SELECT generic_id FROM medicines WHERE id = ANY($1)",
            request.target_medicine_ids,
        )
        generic_ids_list = [r["generic_id"] for r in generic_rows if r["generic_id"] is not None]

        response = supabase.rpc("find_nearby_pharmacy", {
            "user_lat": request.user_lat,
            "user_lng": request.user_lng,
            "search_radius_meters": request.search_radius_meters,
            "target_medicine_ids": request.target_medicine_ids,
            "target_generic_ids": generic_ids_list,
        }).execute()

        data = response.data
        total_count = len(request.target_medicine_ids)

        # Group all RPC rows by pharmacy_id
        pharmacy_groups: dict[int, list] = defaultdict(list)
        for row in data:
            pharmacy_groups[row["pharmacy_id"]].append(row)

        # ── One-stop shop options (all requested medicines present) ──
        one_stop_options: List[OneStopShop] = []
        for pharm_id, items in pharmacy_groups.items():
            unique_generics = set(item["available_generic_id"] for item in items)
            if len(unique_generics) >= total_count:
                one_stop_options.append(OneStopShop(
                    pharmacy_id=pharm_id,
                    pharmacy_name=items[0]["pharmacy_name"],
                    distance_meters=items[0]["distance_meters"],
                    items=[
                        CartItem(
                            provided_medicine_id=item["available_medicine_id"],
                            is_exact=item["is_exact_match"],
                            stock_count=item["stock_count"],
                        )
                        for item in items
                    ],
                ))

        one_stop_options.sort(key=lambda x: x.distance_meters)
        one_stop_options = one_stop_options[:5]

        # ── Multi-stop route (one pharmacy per medicine, exact matches only) ──
        exact_matches = [row for row in data if row["is_exact_match"]]
        medicine_groups: dict[int, list] = defaultdict(list)
        for row in exact_matches:
            medicine_groups[row["available_medicine_id"]].append(row)

        multi_stop_route: List[MultiStopItem] = []
        for med_id, locations in medicine_groups.items():
            locations.sort(key=lambda x: x["distance_meters"])
            closest = locations[0]
            multi_stop_route.append(MultiStopItem(
                medicine_id=med_id,
                pharmacy_name=closest["pharmacy_name"],
                distance_meters=closest["distance_meters"],
            ))

        # ── Partial matches (any pharmacy with ≥1 requested medicine) ──
        partial_matches: List[PartialMatch] = []
        for pharm_id, items in pharmacy_groups.items():
            seen_meds: dict[int, AvailableMed] = {}
            for item in items:
                mid = item["available_medicine_id"]
                if mid not in seen_meds:
                    seen_meds[mid] = AvailableMed(
                        medicine_id=mid,
                        stock_count=item["stock_count"],
                        is_exact=item["is_exact_match"],
                    )
            partial_matches.append(PartialMatch(
                pharmacy_id=pharm_id,
                pharmacy_name=items[0]["pharmacy_name"],
                distance_meters=items[0]["distance_meters"],
                available_medicines=list(seen_meds.values()),
                medicine_count=len(seen_meds),
            ))

        partial_matches.sort(key=lambda x: (-x.medicine_count, x.distance_meters))
        partial_matches = partial_matches[:5]

        return CartResult(
            one_stop_options=one_stop_options,
            multi_stop_route=multi_stop_route,
            partial_matches=partial_matches,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        await conn.close()


@router.get("/search-by-name")
async def search_pharmacies_by_name(q: str, limit: int = 5):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        rows = await conn.fetch(
            "SELECT id, store_name FROM pharmacies WHERE store_name ILIKE $1 LIMIT $2",
            f"%{q}%",
            limit,
        )
        return [{"pharmacy_id": r["id"], "pharmacy_name": r["store_name"]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        await conn.close()

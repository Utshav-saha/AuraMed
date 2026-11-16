from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.database import supabase, get_conn
from app.api.auth import get_current_patient, CurrentPatient
from app.api.utils import parse_unit_price

router = APIRouter()


class AddToCartRequest(BaseModel):
    medicine_id: int
    count: int = Field(1, ge=1)
    assigned_pharmacy: Optional[int] = None


class UpdateCountRequest(BaseModel):
    cart_id: int
    count: int = Field(..., ge=1)


class CartItemResponse(BaseModel):
    cart_id: int
    medicine_id: int
    brand_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    count: int
    unit_price: Optional[float] = None
    order_status: str
    assigned_pharmacy: Optional[int] = None
    assigned_pharmacy_name: Optional[str] = None
    ordered_at: Optional[str] = None


class CartLine(BaseModel):
    medicine_id: int
    count: int


class CheckoutRequest(BaseModel):
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    search_radius_meters: float = 5000.0


class AssignmentDetail(BaseModel):
    cart_id: int
    medicine_id: int
    brand_name: Optional[str]
    count: int
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float
    line_total: Optional[float]


class CheckoutResponse(BaseModel):
    status: str
    assignments: List[AssignmentDetail]
    unassigned: List[CartItemResponse]
    total_cost: float


class CalculateCostRequest(BaseModel):
    items: List[CartLine]


class CostLineItem(BaseModel):
    medicine_id: int
    brand_name: Optional[str] = None
    package_container: Optional[str] = None
    count: int
    unit_price: Optional[float] = None
    line_total: Optional[float] = None


class CalculateCostResponse(BaseModel):
    line_items: List[CostLineItem]
    total_cost: float
    unpriced_medicine_ids: List[int]


class OrderGroup(BaseModel):
    ordered_at: Optional[str]
    pharmacy_id: Optional[int]
    pharmacy_name: Optional[str]
    status: str
    items: List[CartItemResponse]
    total: float


_CART_SELECT = """
    SELECT c.id AS cart_id, c.medicine_id, c.count, c.order_status, c.price, c.assigned_pharmacy, c.ordered_at,
           m.brand_name, m.strength, m.package_container, d.name AS dosage_form,
           p.store_name AS assigned_pharmacy_name
    FROM patient_cart c
    LEFT JOIN medicines m ON m.id = c.medicine_id
    LEFT JOIN dosage_forms d ON d.id = m.dosage_form_id
    LEFT JOIN pharmacies p ON p.id = c.assigned_pharmacy
"""


def _row_to_item(r) -> CartItemResponse:
    price = float(r["price"]) if r["price"] is not None else parse_unit_price(r["package_container"])
    return CartItemResponse(
        cart_id=r["cart_id"], medicine_id=r["medicine_id"], brand_name=r["brand_name"],
        strength=r["strength"], dosage_form=r["dosage_form"], count=r["count"], unit_price=price,
        order_status=r["order_status"] or "pending", assigned_pharmacy=r["assigned_pharmacy"],
        assigned_pharmacy_name=r["assigned_pharmacy_name"],
        ordered_at=r["ordered_at"].isoformat() if r["ordered_at"] else None,
    )


@router.post("/add_to_cart")
async def add_to_cart(req: AddToCartRequest, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        med = await conn.fetchrow("SELECT package_container FROM medicines WHERE id = $1", req.medicine_id)
        if not med:
            raise HTTPException(404, "Medicine not found")
        price = parse_unit_price(med["package_container"])

        # same med already pending thakle count barai, notun row na
        existing = await conn.fetchrow(
            """
            SELECT id FROM patient_cart
            WHERE patient_id = $1 AND medicine_id = $2 AND order_status = 'pending'
              AND assigned_pharmacy IS NOT DISTINCT FROM $3
            """,
            me.id, req.medicine_id, req.assigned_pharmacy,
        )
        if existing:
            await conn.execute("UPDATE patient_cart SET count = count + $2 WHERE id = $1", existing["id"], req.count)
            return {"cart_id": existing["id"], "merged": True}

        row = await conn.fetchrow(
            """
            INSERT INTO patient_cart (medicine_id, count, order_status, assigned_pharmacy, patient_id, price)
            VALUES ($1, $2, 'pending', $3, $4, $5) RETURNING id
            """,
            req.medicine_id, req.count, req.assigned_pharmacy, me.id, price,
        )
        return {"cart_id": row["id"], "merged": False}


@router.post("/update_count")
async def update_count(req: UpdateCountRequest, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        res = await conn.execute(
            "UPDATE patient_cart SET count = $1 WHERE id = $2 AND patient_id = $3 AND order_status = 'pending'",
            req.count, req.cart_id, me.id,
        )
    if res == "UPDATE 0":
        raise HTTPException(404, "Cart item not found")
    return {"ok": True}


@router.post("/remove_from_cart")
async def remove_from_cart(cart_id: int, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        res = await conn.execute(
            "DELETE FROM patient_cart WHERE id = $1 AND patient_id = $2 AND order_status = 'pending'", cart_id, me.id
        )
    if res == "DELETE 0":
        raise HTTPException(404, "Cart item not found")
    return {"message": "Cart item removed"}


@router.post("/clear")
async def clear_cart(me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        await conn.execute("DELETE FROM patient_cart WHERE patient_id = $1 AND order_status = 'pending'", me.id)
    return {"ok": True}


@router.get("/get_cart_items", response_model=List[CartItemResponse])
async def get_cart_items(me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        rows = await conn.fetch(_CART_SELECT + " WHERE c.patient_id = $1 AND c.order_status = 'pending' ORDER BY c.id", me.id)
    return [_row_to_item(r) for r in rows]


@router.post("/calculate_total_cost", response_model=CalculateCostResponse)
async def calculate_total_cost(req: CalculateCostRequest):
    ids = [i.medicine_id for i in req.items]
    async with get_conn() as conn:
        rows = await conn.fetch("SELECT id, brand_name, package_container FROM medicines WHERE id = ANY($1::bigint[])", ids)
    info = {r["id"]: r for r in rows}
    lines, total, unpriced = [], 0.0, []
    for it in req.items:
        r = info.get(it.medicine_id)
        price = parse_unit_price(r["package_container"]) if r else None
        line_total = round(price * it.count, 2) if price is not None else None
        if line_total is None:
            unpriced.append(it.medicine_id)
        else:
            total += line_total
        lines.append(CostLineItem(
            medicine_id=it.medicine_id, brand_name=r["brand_name"] if r else None,
            package_container=r["package_container"] if r else None, count=it.count,
            unit_price=price, line_total=line_total,
        ))
    return CalculateCostResponse(line_items=lines, total_cost=round(total, 2), unpriced_medicine_ids=unpriced)


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(req: CheckoutRequest, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        cart = await conn.fetch(_CART_SELECT + " WHERE c.patient_id = $1 AND c.order_status = 'pending' ORDER BY c.id", me.id)
        if not cart:
            raise HTTPException(400, "Cart is empty")

        lat, lng = req.user_lat, req.user_lng
        if lat is None or lng is None:
            home = await conn.fetchrow(
                "SELECT ST_Y(home_location::geometry) lat, ST_X(home_location::geometry) lng FROM patients WHERE id = $1", me.id
            )
            if not home or home["lat"] is None:
                raise HTTPException(400, "Location needed for checkout. Allow location access or set a home address.")
            lat, lng = home["lat"], home["lng"]

        med_ids = [r["medicine_id"] for r in cart]
        meta = await conn.fetch(
            """
            SELECT u.id, COALESCE(m.generic_id, 0) generic_id, COALESCE(m.dosage_form_id, 0) dosage_form_id
            FROM unnest($1::bigint[]) WITH ORDINALITY u(id, ord) LEFT JOIN medicines m ON m.id = u.id ORDER BY u.ord
            """,
            med_ids,
        )
        rpc = supabase.rpc("find_nearby_pharmacy", {
            "user_lat": lat, "user_lng": lng, "search_radius_meters": req.search_radius_meters,
            "target_medicine_ids": med_ids,
            "target_generic_ids": [r["generic_id"] for r in meta],
            "target_quantities": [r["count"] for r in cart],
            "target_dosage_form_ids": [r["dosage_form_id"] for r in meta],
        }).execute().data or []

        # medicine -> {pharmacy_id: row}, exact match only
        offers: dict[int, dict[int, dict]] = defaultdict(dict)
        for row in rpc:
            if row["is_exact_match"]:
                offers[row["available_medicine_id"]][row["pharmacy_id"]] = row

        assignments, unassigned, total = [], [], 0.0
        async with conn.transaction():
            for item in cart:
                cands = offers.get(item["medicine_id"], {})
                pick = None
                # user nijei pharmacy choose korle setai agey
                if item["assigned_pharmacy"] and item["assigned_pharmacy"] in cands:
                    pick = cands[item["assigned_pharmacy"]]
                elif cands:
                    pick = min(cands.values(), key=lambda r: r["distance_meters"])
                if not pick or pick["stock_count"] < item["count"]:
                    unassigned.append(_row_to_item(item))
                    continue

                # stock kata: age expire hobe emon batch theke
                remaining = item["count"]
                batches = await conn.fetch(
                    """
                    SELECT id, stock_count FROM pharmacy_inventory
                    WHERE pharmacy_id = $1 AND medicine_id = $2 AND is_recalled = false
                      AND expiry_date >= current_date AND stock_count > 0
                    ORDER BY expiry_date FOR UPDATE
                    """,
                    pick["pharmacy_id"], item["medicine_id"],
                )
                for b in batches:
                    if remaining <= 0:
                        break
                    take = min(remaining, b["stock_count"])
                    await conn.execute("UPDATE pharmacy_inventory SET stock_count = stock_count - $1 WHERE id = $2", take, b["id"])
                    remaining -= take
                if remaining > 0:
                    raise HTTPException(409, f"Stock changed for {item['brand_name']}, try again")

                await conn.execute(
                    "INSERT INTO sales_records (pharmacy_id, medicine_id, quantity_sold) VALUES ($1, $2, $3)",
                    pick["pharmacy_id"], item["medicine_id"], item["count"],
                )
                price = float(item["price"]) if item["price"] is not None else parse_unit_price(item["package_container"])
                await conn.execute(
                    """
                    UPDATE patient_cart SET assigned_pharmacy = $1, order_status = 'confirmed', ordered_at = now(), price = $2
                    WHERE id = $3
                    """,
                    pick["pharmacy_id"], price, item["cart_id"],
                )
                line_total = round(price * item["count"], 2) if price else None
                total += line_total or 0
                assignments.append(AssignmentDetail(
                    cart_id=item["cart_id"], medicine_id=item["medicine_id"], brand_name=item["brand_name"],
                    count=item["count"], pharmacy_id=pick["pharmacy_id"], pharmacy_name=pick["pharmacy_name"],
                    distance_meters=pick["distance_meters"], line_total=line_total,
                ))

    status = "checkout_complete" if not unassigned else ("partial" if assignments else "nothing_available")
    return CheckoutResponse(status=status, assignments=assignments, unassigned=unassigned, total_cost=round(total, 2))


@router.get("/past_orders", response_model=List[OrderGroup])
async def past_orders(me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        rows = await conn.fetch(
            _CART_SELECT + " WHERE c.patient_id = $1 AND c.order_status <> 'pending' ORDER BY c.ordered_at DESC NULLS LAST, c.id DESC",
            me.id,
        )
    groups: dict[tuple, OrderGroup] = {}
    for r in rows:
        key = (r["ordered_at"].replace(second=0, microsecond=0) if r["ordered_at"] else None, r["assigned_pharmacy"])
        item = _row_to_item(r)
        g = groups.get(key)
        if not g:
            g = groups[key] = OrderGroup(
                ordered_at=item.ordered_at, pharmacy_id=r["assigned_pharmacy"],
                pharmacy_name=r["assigned_pharmacy_name"], status=item.order_status, items=[], total=0.0,
            )
        g.items.append(item)
        g.total = round(g.total + (item.unit_price or 0) * item.count, 2)
    return list(groups.values())

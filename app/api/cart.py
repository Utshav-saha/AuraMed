from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncpg
import re
from collections import defaultdict
from datetime import datetime

from app.database import supabase, DATABASE_URL

router = APIRouter()


def _parse_unit_price(package_container: Optional[str]) -> Optional[float]:
    if not package_container:
        return None

    after_symbol = re.search(r"৳\s*([0-9]+(?:\.[0-9]+)?)", package_container)
    if after_symbol:
        return float(after_symbol.group(1))

    first_number = re.search(r"([0-9]+(?:\.[0-9]+)?)", package_container)
    if first_number:
        return float(first_number.group(1))

    return None

class AddToCartRequest(BaseModel):
    medicine_id: int
    count: int
    order_status : str = "pending"
    assigned_pharmacy : Optional[int] = None
    patient_id : int

class CartItemResponse(BaseModel):
    cart_id: int
    medicine_id: int
    count: int
    order_status: str
    assigned_pharmacy_name: Optional[str] = None
    patient_id: int

class CartItem(BaseModel):
    medicine_id: int
    count: int
   
class CheckoutRequest(BaseModel):
    patient_id: int
    items: List[CartItem]
    user_lat: float
    user_lng: float
    search_radius_meters: Optional[float] = 5000.0


class AssignmentDetail(BaseModel):
    medicine_id: int
    pharmacy_id: int
    pharmacy_name: str
    distance_meters: float


class CheckoutResponse(BaseModel):
    status: str
    assignments: List[AssignmentDetail]
    unassigned_medicine_ids: List[int]


class CalculateCostRequest(BaseModel):
    items: List[CartItem]


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
    


@router.post("/add_to_cart")
async def add_to_cart(request: AddToCartRequest):
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        package_container_row = await conn.fetchrow(
            "SELECT package_container FROM medicines WHERE id = $1",
            request.medicine_id,
        )
        price = _parse_unit_price(package_container_row["package_container"])
        query = """
            INSERT INTO patient_cart (medicine_id, count, order_status, assigned_pharmacy, patient_id, price)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        """
        result = await conn.fetchrow(query, request.medicine_id, request.count, request.order_status, request.assigned_pharmacy, request.patient_id, price)
        return {"cart_id": result["id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

@router.post("/remove_from_cart")
async def remove_from_cart(cart_id: int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = "DELETE FROM patient_cart WHERE id = $1"
        result = await conn.execute(query, cart_id)
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Cart item not found")
        return {"message": "Cart item removed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()


@router.get("/get_cart_items", response_model=List[CartItemResponse])
async def get_cart_items(patient_id: int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            SELECT c.id AS cart_id, c.medicine_id, c.count, c.order_status, c.patient_id, c.price,
                   p.store_name AS assigned_pharmacy_name
            FROM patient_cart c
            LEFT JOIN pharmacies p ON c.assigned_pharmacy = p.id
            WHERE c.patient_id = $1
        """
        results = await conn.fetch(query, patient_id)
        return [
            CartItemResponse(
                cart_id=record["cart_id"],
                medicine_id=record["medicine_id"],
                count=record["count"],
                order_status=record["order_status"],
                assigned_pharmacy_name=record["assigned_pharmacy_name"],
                patient_id=record["patient_id"]
            )
            for record in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout_cart(request: CheckoutRequest):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        medicine_ids = [item.medicine_id for item in request.items]
        quantity_map = {item.medicine_id: item.count for item in request.items}
        quantities = [item.count for item in request.items]

        meta_rows = await conn.fetch(
            """
            SELECT COALESCE(m.generic_id, 0) AS generic_id,
                   COALESCE(m.dosage_form_id, 0) AS dosage_form_id
            FROM unnest($1::bigint[]) WITH ORDINALITY AS u(id, ord)
            LEFT JOIN medicines m ON m.id = u.id
            ORDER BY u.ord
            """,
            medicine_ids,
        )
        generic_ids = [r["generic_id"] for r in meta_rows]
        dosage_form_ids = [r["dosage_form_id"] for r in meta_rows]

        rpc_data = supabase.rpc(
            "find_nearby_pharmacy",
            {
                "user_lat": request.user_lat,
                "user_lng": request.user_lng,
                "search_radius_meters": request.search_radius_meters,
                "target_medicine_ids": medicine_ids,
                "target_generic_ids": generic_ids,
                "target_quantities": quantities,
                "target_dosage_form_ids": dosage_form_ids,
            },
        ).execute().data

        exact_matches = [
            row for row in rpc_data
            if row["is_exact_match"]
            and row["stock_count"] >= quantity_map.get(row["available_medicine_id"], 1)
        ]

        medicine_groups: dict[int, list] = defaultdict(list)
        for row in exact_matches:
            medicine_groups[row["available_medicine_id"]].append(row)

        assignments: List[AssignmentDetail] = []
        unassigned: List[int] = []

        for med_id in medicine_ids:
            candidates = medicine_groups.get(med_id, [])
            if not candidates:
                unassigned.append(med_id)
                continue

            closest = min(candidates, key=lambda r: r["distance_meters"])
            assignments.append(
                AssignmentDetail(
                    medicine_id=med_id,
                    pharmacy_id=closest["pharmacy_id"],
                    pharmacy_name=closest["pharmacy_name"],
                    distance_meters=closest["distance_meters"],
                )
            )

        for detail in assignments:
            await conn.execute(
                """
                UPDATE patient_cart
                SET assigned_pharmacy = $1, order_status = 'confirmed'
                WHERE patient_id = $2
                  AND medicine_id = $3
                  AND order_status = 'pending'
                """,
                detail.pharmacy_id,
                request.patient_id,
                detail.medicine_id,
            )

        return CheckoutResponse(
            status="checkout_complete",
            assignments=assignments,
            unassigned_medicine_ids=unassigned,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Checkout error: {str(e)}")
    finally:
        await conn.close()


@router.post("/calculate_total_cost", response_model=CalculateCostResponse)
async def calculate_total_cost(request: CalculateCostRequest):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        medicine_ids = [item.medicine_id for item in request.items]
        rows = await conn.fetch(
            "SELECT id, brand_name, package_container FROM medicines WHERE id = ANY($1)",
            medicine_ids,
        )
        info = {r["id"]: r for r in rows}

        line_items: List[CostLineItem] = []
        total_cost = 0.0
        unpriced: List[int] = []

        for item in request.items:
            row = info.get(item.medicine_id)
            brand_name = row["brand_name"] if row else None
            package_container = row["package_container"] if row else None
            unit_price = _parse_unit_price(package_container)

            if unit_price is None:
                line_total = None
                unpriced.append(item.medicine_id)
            else:
                line_total = round(unit_price * item.count, 2)
                total_cost += line_total

            line_items.append(
                CostLineItem(
                    medicine_id=item.medicine_id,
                    brand_name=brand_name,
                    package_container=package_container,
                    count=item.count,
                    unit_price=unit_price,
                    line_total=line_total,
                )
            )

        return CalculateCostResponse(
            line_items=line_items,
            total_cost=round(total_cost, 2),
            unpriced_medicine_ids=unpriced,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cost calculation error: {str(e)}")
    finally:
        await conn.close()


@router.get("/past_orders", response_model=List[CartItemResponse])
async def past_orders(patient_id: int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            SELECT c.id AS cart_id, c.medicine_id, c.count, c.order_status, c.patient_id,
                   p.store_name AS assigned_pharmacy_name
            FROM patient_cart c
            LEFT JOIN pharmacies p ON c.assigned_pharmacy = p.id
            WHERE c.patient_id = $1 AND c.order_status != 'pending'
        """
        results = await conn.fetch(query, patient_id)
        return [
            CartItemResponse(
                cart_id=record["cart_id"],
                medicine_id=record["medicine_id"],
                count=record["count"],
                order_status=record["order_status"],
                assigned_pharmacy_name=record["assigned_pharmacy_name"],
                patient_id=record["patient_id"]
            )
            for record in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()
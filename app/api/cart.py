from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncpg
from collections import defaultdict 
from datetime import datetime

from app.database import supabase, DATABASE_URL

router = APIRouter()

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
    


@router.post("/add_to_cart")
async def add_to_cart(request: AddToCartRequest):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            INSERT INTO patient_cart (medicine_id, count, order_status, assigned_pharmacy, patient_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        """
        result = await conn.fetchrow(query, request.medicine_id, request.count, request.order_status, request.assigned_pharmacy, request.patient_id)
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
            SELECT c.id AS cart_id, c.medicine_id, c.count, c.order_status, c.patient_id,
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

        # Resolve generic_ids so the RPC can also consider generic equivalents
        generic_rows = await conn.fetch(
            "SELECT generic_id FROM medicines WHERE id = ANY($1)",
            medicine_ids,
        )
        generic_ids = [r["generic_id"] for r in generic_rows if r["generic_id"]]

        rpc_data = supabase.rpc(
            "find_nearby_pharmacy",
            {
                "user_lat": request.user_lat,
                "user_lng": request.user_lng,
                "search_radius_meters": request.search_radius_meters,
                "target_medicine_ids": medicine_ids,
                "target_generic_ids": generic_ids,
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
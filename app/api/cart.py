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


@router.post("/add_to_cart")
async def add_to_cart(request: AddToCartRequest):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            INSERT INTO cart (medicine_id, count, order_status, assigned_pharmacy, patient_id)
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
        query = "DELETE FROM cart WHERE id = $1"
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
                   p.name AS assigned_pharmacy_name
            FROM cart c
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


@router.post("/checkout")

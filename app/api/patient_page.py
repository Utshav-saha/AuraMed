from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncpg
from collections import defaultdict 
from datetime import datetime

from app.database import supabase, DATABASE_URL

router = APIRouter()

class Coordinate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    
class PatientResponse(BaseModel):
    patient_id: int
    name: str
    email: str
    user_id: int
    home_location: Coordinate


class PrescriptionItem(BaseModel):
    medicine_id: int
    dosage_instruction: str
    duration: int

class PrescriptionResponse(BaseModel):
    prescription_id: int
    patient_id: int
    doctor_id: int
    prescribed_at: datetime
    disease_diagnosis: str
    location_issued: Coordinate
    items: List[PrescriptionItem]


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


@router.get("/get_patient", response_model=PatientResponse)
async def get_patient(user_id: int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            SELECT id AS patient_id, name, email, user_id, ST_Y(home_location::geometry) AS latitude, ST_X(home_location::geometry) AS longitude
            FROM patients
            WHERE user_id = $1
        """
        result = await conn.fetchrow(query, user_id)
        if not result:
            raise HTTPException(status_code=404, detail="Patient not found")

        lat = result["latitude"]
        lon = result["longitude"]
        if lat is None or lon is None:
            raise HTTPException(status_code=500, detail="Missing home_location coordinates")

        return PatientResponse(
            patient_id=result["patient_id"],
            name=result["name"],
            email=result["email"],
            user_id=result["user_id"],
            home_location=Coordinate(latitude=float(lat), longitude=float(lon))
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()


@router.get("/get_prescriptions", response_model=List[PrescriptionResponse])
async def get_prescriptions(patient_id: int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            SELECT p.id AS prescription_id, p.patient_id, p.doctor_id, p.prescribed_at, p.disease_diagnosis,
                   ST_Y(p.location_issued::geometry) AS latitude, ST_X(p.location_issued::geometry) AS longitude,
                   pi.medicine_id, pi.dosage_instruction, pi.duration
            FROM prescriptions p
            LEFT JOIN prescription_items pi ON p.id = pi.prescription_id
            WHERE p.patient_id = $1
        """
        results = await conn.fetch(query, patient_id)
        if not results:
            raise HTTPException(status_code=404, detail="No prescriptions found for this patient")

        prescriptions: dict[int, PrescriptionResponse] = {}

        for record in results:
            presc_id = record["prescription_id"]

            if presc_id not in prescriptions:
                lat = record["latitude"]
                lon = record["longitude"]
                if lat is None or lon is None:
                    raise HTTPException(status_code=500, detail="Missing location_issued coordinates")

                prescriptions[presc_id] = PrescriptionResponse(
                    prescription_id=presc_id,
                    patient_id=record["patient_id"],
                    doctor_id=record["doctor_id"],
                    prescribed_at=record["prescribed_at"],
                    disease_diagnosis=record["disease_diagnosis"],
                    location_issued=Coordinate(latitude=float(lat), longitude=float(lon)),
                    items=[]
                )

            if record["medicine_id"] is not None:
                prescriptions[presc_id].items.append(PrescriptionItem(
                    medicine_id=record["medicine_id"],
                    dosage_instruction=record["dosage_instruction"],
                    duration=record["duration"]
                ))

        return list(prescriptions.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()


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
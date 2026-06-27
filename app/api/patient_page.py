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
    specialization: Optional[str] = None
    doctorName: Optional[str] = None
    prescribed_at: datetime
    disease_diagnosis: str
    location_issued: Coordinate
    items: List[PrescriptionItem]


class TotalDosage(BaseModel):
    medicine_id: int
    total_dosage: int


class DosageCalculationRequest(BaseModel):
    items: List[PrescriptionItem]

class DosageCalculationResponse(BaseModel):
    total_dosages: List[TotalDosage]


class NotificationRequest(BaseModel):
    patient_email: str
    medicine_name: str
    schedule_time: datetime
    status: str = "pending"  # Default status is "pending"



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
                   pi.medicine_id, pi.dosage_instruction, pi.duration, d.specialization AS specialization, d.name AS doctorName
            FROM prescriptions p
            LEFT JOIN prescription_items pi ON p.id = pi.prescription_id
            LEFT JOIN doctors d ON p.doctor_id = d.id
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
                    specialization=record["specialization"],
                    doctorName=record["doctorName"],
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



@router.post("/calculate_dosage", response_model=DosageCalculationResponse)
async def calculate_dosage(request: DosageCalculationRequest):
    dict_dosage = defaultdict(int)
    
    for item in request.items:
        try:
            daily_dosage = sum(int(num) for num in item.dosage_instruction.split('+'))
            total = daily_dosage * item.duration
            dict_dosage[item.medicine_id] += total
            
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid dosage instruction '{item.dosage_instruction}' for medicine ID {item.medicine_id}. Must contain only numbers and '+'."
            )

    response_list = [
        TotalDosage(medicine_id=med_id, total_dosage=total) 
        for med_id, total in dict_dosage.items()
    ]
    
    return DosageCalculationResponse(total_dosages=response_list)

@router.post("/send_notification")
async def send_notification(request: NotificationRequest):
    try:
        # Insert the notification into the database
        response = supabase.table("notifications").insert({
            "patient_email": request.patient_email,
            "medicine_name": request.medicine_name,
            "schedule_time": request.schedule_time.isoformat(),
            "status": request.status
        }).execute()

        if response.status_code != 201:
            raise HTTPException(status_code=500, detail="Failed to insert notification into the database")

        return {"message": "Notification scheduled successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
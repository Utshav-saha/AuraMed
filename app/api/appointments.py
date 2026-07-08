from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import date, time, datetime
from app.database import supabase 

router = APIRouter()

class BookAppointmentRequest(BaseModel):
    patient_id: int
    doctor_id: int
    hospital_id: int 
    appointment_date: date
    appointment_time: time
    availability_id: int 

@router.get("/search")
async def search_available_doctors(q: Optional[str] = None):
   
    try:
        query = supabase.table("doctors").select(
            "id, name, specialization, "
            "hospital_doctor_availability(id, time_slot, available_slots, date, "
            "hospitals(id, name, coordinates))"
        )
        
        if q:
            query = query.or_(f"name.ilike.%{q}%,specialization.ilike.%{q}%")
            
        result = query.execute()
        
        active_doctors = []
        for doc in result.data:
            if doc.get("hospital_doctor_availability"):
                active_doctors.append(doc)
                
        return {"data": active_doctors}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")



@router.post("/book")
async def book_appointment(payload: BookAppointmentRequest):
    try:
        avail_res = supabase.table("hospital_doctor_availability") \
            .select("available_slots") \
            .eq("id", payload.availability_id) \
            .single() \
            .execute()
            
        if not avail_res.data or avail_res.data["available_slots"] <= 0:
            raise HTTPException(status_code=400, detail="This time slot is no longer available.")
            
        
        appt_data = {
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "date": payload.appointment_date.isoformat(),
            "time": payload.appointment_time.isoformat()
        }
        
        insert_res = supabase.table("Appointments").insert(appt_data).execute()
        
        # Step 3: Decrement the available slots count
        new_count = avail_res.data["available_slots"] - 1
        supabase.table("hospital_doctor_availability") \
            .update({"available_slots": new_count}) \
            .eq("id", payload.availability_id) \
            .execute()
            
        return {
            "message": "Appointment booked successfully!",
            "appointment": insert_res.data[0]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Booking failed: {str(e)}")


# ==========================================
# 4. View My Appointments (Upcoming & Past)
# ==========================================
@router.get("/my-appointments")
async def get_my_appointments(
    patient_id: int, 
    status: str = Query(..., description="Must be 'upcoming' or 'past'")
):
    """
    Fetches booked appointments for a specific patient.
    """
    if status not in ["upcoming", "past"]:
        raise HTTPException(status_code=400, detail="Status must be 'upcoming' or 'past'")
        
    try:
        today = date.today().isoformat()
        
        query = supabase.table("Appointments").select(
            "id, date, time, doctors(id, name, specialization)"
        ).eq("patient_id", patient_id)
        
        # Filter logic based on current date
        if status == "upcoming":
            # Date is today or in the future
            query = query.gte("date", today)
        else:
            # Date is in the past
            query = query.lt("date", today)
            
        # Sort by date (descending for past, ascending for upcoming)
        sort_order = False if status == "past" else True
        query = query.order("date", desc=not sort_order).order("time", desc=not sort_order)
        
        result = query.execute()
        
        return {"data": result.data}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch appointments: {str(e)}")
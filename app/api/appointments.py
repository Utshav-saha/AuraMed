import re
from datetime import date, time, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from app.database import get_conn
from app.api.auth import get_current_patient, CurrentPatient

router = APIRouter()
DHAKA = ZoneInfo("Asia/Dhaka")


class BookRequest(BaseModel):
    availability_id: int


class Slot(BaseModel):
    id: int
    date: Optional[date]
    time_slot: str
    available_slots: int
    hospital_id: Optional[int]
    hospital_name: Optional[str]
    hospital_contact: Optional[str]


class DoctorResult(BaseModel):
    id: int
    name: str
    specialization: Optional[str]
    slots: list[Slot]


class AppointmentOut(BaseModel):
    id: int
    date: date
    time: time
    time_slot: Optional[str]
    status: str
    doctor_id: int
    doctor_name: Optional[str]
    specialization: Optional[str]
    hospital_name: Optional[str]
    hospital_contact: Optional[str]


def _today() -> date:
    return datetime.now(DHAKA).date()


# "09:00 - 11:30" / "9:30 AM" / "Evening (6-8pm)" -> start time
def slot_start(slot: str) -> time:
    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", slot, re.I)
    if not m:
        return time(9, 0)
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower()
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return time(min(h, 23), min(mi, 59))


@router.get("/search", response_model=list[DoctorResult])
async def search_available_doctors(q: Optional[str] = None):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT d.id doctor_id, d.name, d.specialization,
                   a.id slot_id, a.date, a.time_slot, a.available_slots,
                   h.id hospital_id, h.name hospital_name, h.contact_number
            FROM doctors d
            JOIN hospital_doctor_availability a ON a.doctor_id = d.id
            LEFT JOIN hospitals h ON h.id = a.hospital_id
            WHERE a.available_slots > 0 AND (a.date IS NULL OR a.date >= $1)
              AND ($2::text IS NULL OR d.name ILIKE '%' || $2 || '%' OR d.specialization ILIKE '%' || $2 || '%')
            ORDER BY d.name, a.date NULLS LAST, a.time_slot
            """,
            _today(), q.strip() if q else None,
        )
    docs: dict[int, DoctorResult] = {}
    for r in rows:
        d = docs.get(r["doctor_id"])
        if not d:
            d = docs[r["doctor_id"]] = DoctorResult(id=r["doctor_id"], name=r["name"], specialization=r["specialization"], slots=[])
        d.slots.append(Slot(
            id=r["slot_id"], date=r["date"], time_slot=r["time_slot"], available_slots=r["available_slots"],
            hospital_id=r["hospital_id"], hospital_name=r["hospital_name"], hospital_contact=r["contact_number"],
        ))
    return list(docs.values())


@router.post("/book")
async def book_appointment(req: BookRequest, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        async with conn.transaction():
            # ek query te slot komai, race hole dujon ekta slot pabe na
            slot = await conn.fetchrow(
                """
                UPDATE hospital_doctor_availability
                SET available_slots = available_slots - 1
                WHERE id = $1 AND available_slots > 0 AND (date IS NULL OR date >= $2)
                RETURNING id, doctor_id, hospital_id, date, time_slot
                """,
                req.availability_id, _today(),
            )
            if not slot:
                raise HTTPException(400, "This time slot is no longer available.")
            dup = await conn.fetchrow(
                "SELECT 1 FROM \"Appointments\" WHERE patient_id = $1 AND availability_id = $2 AND status = 'booked'",
                me.id, req.availability_id,
            )
            if dup:
                raise HTTPException(409, "You already have an appointment in this slot.")
            appt = await conn.fetchrow(
                """
                INSERT INTO "Appointments" (patient_id, doctor_id, hospital_id, availability_id, date, time, time_slot, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked') RETURNING id, date, time
                """,
                me.id, slot["doctor_id"], slot["hospital_id"], slot["id"],
                slot["date"] or _today(), slot_start(slot["time_slot"]), slot["time_slot"],
            )
    return {"message": "Appointment booked", "appointment": dict(appt)}


@router.post("/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: int, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                UPDATE "Appointments" SET status = 'cancelled'
                WHERE id = $1 AND patient_id = $2 AND status = 'booked' RETURNING availability_id
                """,
                appointment_id, me.id,
            )
            if not row:
                raise HTTPException(404, "Appointment not found")
            if row["availability_id"]:
                await conn.execute(
                    "UPDATE hospital_doctor_availability SET available_slots = available_slots + 1 WHERE id = $1",
                    row["availability_id"],
                )
    return {"ok": True}


@router.get("/my-appointments", response_model=list[AppointmentOut])
async def my_appointments(status: str = Query("upcoming"), me: CurrentPatient = Depends(get_current_patient)):
    if status not in ("upcoming", "past"):
        raise HTTPException(400, "status must be upcoming or past")
    cmp = ">=" if status == "upcoming" else "<"
    order = "ASC" if status == "upcoming" else "DESC"
    async with get_conn() as conn:
        rows = await conn.fetch(
            f"""
            SELECT a.id, a.date, a.time, a.time_slot, a.status, a.doctor_id,
                   d.name doctor_name, d.specialization, h.name hospital_name, h.contact_number
            FROM "Appointments" a
            LEFT JOIN doctors d ON d.id = a.doctor_id
            LEFT JOIN hospitals h ON h.id = a.hospital_id
            WHERE a.patient_id = $1 AND a.date {cmp} $2
            ORDER BY a.date {order}, a.time {order}
            """,
            me.id, _today(),
        )
    return [
        AppointmentOut(
            id=r["id"], date=r["date"], time=r["time"], time_slot=r["time_slot"], status=r["status"],
            doctor_id=r["doctor_id"], doctor_name=r["doctor_name"], specialization=r["specialization"],
            hospital_name=r["hospital_name"], hospital_contact=r["contact_number"],
        )
        for r in rows
    ]

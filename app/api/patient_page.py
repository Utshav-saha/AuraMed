from collections import defaultdict
from datetime import datetime, date, time, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.database import get_conn
from app.api.auth import get_current_patient, CurrentPatient
from app.api.utils import parse_dose, daily_total

router = APIRouter()
DHAKA = ZoneInfo("Asia/Dhaka")
DOSE_LABELS = ["Morning", "Noon", "Night"]


class Coordinate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class PatientResponse(BaseModel):
    patient_id: int
    name: str
    email: str
    user_id: str
    home_location: Optional[Coordinate] = None


class PrescriptionItem(BaseModel):
    item_id: int
    medicine_id: Optional[int]
    medicine_name: Optional[str]
    brand_name: Optional[str]
    generic_name: Optional[str]
    strength: Optional[str]
    dosage_form: Optional[str]
    dosage_instruction: str
    duration: int
    dose: list[float]


class PrescriptionResponse(BaseModel):
    prescription_id: int
    doctor_id: Optional[int]
    doctorName: Optional[str]
    specialization: Optional[str]
    prescribed_at: datetime
    disease_diagnosis: Optional[str]
    raw_ocr_text: Optional[str]
    location_issued: Optional[Coordinate]
    reminders_set: bool
    items: List[PrescriptionItem]


class DosageItem(BaseModel):
    medicine_id: int
    dosage_instruction: str
    duration: int


class DosageCalculationRequest(BaseModel):
    items: List[DosageItem]


class TotalDosage(BaseModel):
    medicine_id: int
    total_dosage: float
    per_day: float


class DosageCalculationResponse(BaseModel):
    total_dosages: List[TotalDosage]


class ReminderTimes(BaseModel):
    morning: str = "08:00"
    noon: str = "14:00"
    night: str = "21:00"


class CreateRemindersRequest(BaseModel):
    prescription_id: int
    times: ReminderTimes = ReminderTimes()
    start_date: Optional[date] = None


class ReminderOut(BaseModel):
    id: int
    prescription_id: Optional[int]
    medicine_name: str
    dose_label: Optional[str]
    schedule_time: datetime
    status: str


@router.get("/get_patient", response_model=PatientResponse)
async def get_patient(me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        r = await conn.fetchrow(
            "SELECT ST_Y(home_location::geometry) lat, ST_X(home_location::geometry) lng FROM patients WHERE id = $1", me.id
        )
    loc = Coordinate(latitude=r["lat"], longitude=r["lng"]) if r and r["lat"] is not None else None
    return PatientResponse(patient_id=me.id, name=me.name, email=me.email, user_id=me.user_id, home_location=loc)


@router.put("/home_location")
async def set_home_location(loc: Coordinate, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE patients SET home_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3",
            loc.longitude, loc.latitude, me.id,
        )
    return {"ok": True}


@router.get("/get_prescriptions", response_model=List[PrescriptionResponse])
async def get_prescriptions(me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id prescription_id, p.doctor_id, p.created_at, p.disease_diagnosis, p.raw_ocr_text,
                   ST_Y(p.location_issued::geometry) lat, ST_X(p.location_issued::geometry) lng,
                   d.name doctor_name, d.specialization,
                   pi.id item_id, pi.medicine_id, pi.medicine_name, pi.dosage_instruction, pi.duration_days,
                   m.brand_name, m.strength, g.name generic_name, df.name dosage_form,
                   EXISTS (SELECT 1 FROM patient_reminders r WHERE r.prescription_id = p.id AND r.status = 'pending') reminders_set
            FROM prescriptions p
            LEFT JOIN doctors d ON d.id = p.doctor_id
            LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
            LEFT JOIN medicines m ON m.id = pi.medicine_id
            LEFT JOIN generics g ON g.id = m.generic_id
            LEFT JOIN dosage_forms df ON df.id = m.dosage_form_id
            WHERE p.patient_id = $1
            ORDER BY p.created_at DESC, pi.id
            """,
            me.id,
        )
    out: dict[int, PrescriptionResponse] = {}
    for r in rows:
        pid = r["prescription_id"]
        if pid not in out:
            loc = Coordinate(latitude=r["lat"], longitude=r["lng"]) if r["lat"] is not None else None
            out[pid] = PrescriptionResponse(
                prescription_id=pid, doctor_id=r["doctor_id"], doctorName=r["doctor_name"],
                specialization=r["specialization"], prescribed_at=r["created_at"],
                disease_diagnosis=r["disease_diagnosis"], raw_ocr_text=r["raw_ocr_text"],
                location_issued=loc, reminders_set=r["reminders_set"], items=[],
            )
        if r["item_id"] is not None:
            # purono row e "Napa: 1-0-0" format e naam instruction er vitore
            name = r["medicine_name"]
            instr = r["dosage_instruction"]
            if not name and not r["brand_name"] and ":" in instr:
                name, instr = [s.strip() for s in instr.split(":", 1)]
            out[pid].items.append(PrescriptionItem(
                item_id=r["item_id"], medicine_id=r["medicine_id"], medicine_name=name,
                brand_name=r["brand_name"], generic_name=r["generic_name"], strength=r["strength"],
                dosage_form=r["dosage_form"], dosage_instruction=instr, duration=r["duration_days"],
                dose=parse_dose(instr),
            ))
    return list(out.values())


@router.post("/calculate_dosage", response_model=DosageCalculationResponse)
async def calculate_dosage(req: DosageCalculationRequest):
    totals: dict[int, float] = defaultdict(float)
    per_day: dict[int, float] = defaultdict(float)
    for it in req.items:
        d = daily_total(it.dosage_instruction)
        if d == 0:
            raise HTTPException(400, f"Could not read dose pattern '{it.dosage_instruction}'. Use the 1+0+1 format.")
        per_day[it.medicine_id] += d
        totals[it.medicine_id] += d * it.duration
    return DosageCalculationResponse(
        total_dosages=[TotalDosage(medicine_id=m, total_dosage=t, per_day=per_day[m]) for m, t in totals.items()]
    )


def _parse_hhmm(s: str) -> time:
    try:
        h, m = s.split(":")
        return time(int(h), int(m))
    except Exception:
        raise HTTPException(400, f"Bad time '{s}', use HH:MM")


@router.post("/reminders")
async def create_reminders(req: CreateRemindersRequest, me: CurrentPatient = Depends(get_current_patient)):
    slots = [_parse_hhmm(req.times.morning), _parse_hhmm(req.times.noon), _parse_hhmm(req.times.night)]
    start = req.start_date or datetime.now(DHAKA).date()
    now = datetime.now(DHAKA)

    async with get_conn() as conn:
        items = await conn.fetch(
            """
            SELECT pi.dosage_instruction, pi.duration_days, COALESCE(m.brand_name, pi.medicine_name) name, m.strength
            FROM prescriptions p JOIN prescription_items pi ON pi.prescription_id = p.id
            LEFT JOIN medicines m ON m.id = pi.medicine_id
            WHERE p.id = $1 AND p.patient_id = $2
            """,
            req.prescription_id, me.id,
        )
        if not items:
            raise HTTPException(404, "Prescription not found or has no medicines")

        rows = []
        for it in items:
            name = it["name"] or "Medicine"
            if it["strength"]:
                name = f"{name} {it['strength']}"
            dose = parse_dose(it["dosage_instruction"])
            for day in range(it["duration_days"]):
                d = start + timedelta(days=day)
                for idx, qty in enumerate(dose):
                    if qty <= 0:
                        continue
                    at = datetime.combine(d, slots[idx], tzinfo=DHAKA)
                    if at <= now:
                        continue
                    rows.append((me.email, name, at, me.id, req.prescription_id, DOSE_LABELS[idx]))

        async with conn.transaction():
            # abar set korle purono pending gulo muche notun kori
            await conn.execute(
                "DELETE FROM patient_reminders WHERE prescription_id = $1 AND patient_id = $2 AND status = 'pending'",
                req.prescription_id, me.id,
            )
            if rows:
                await conn.executemany(
                    """
                    INSERT INTO patient_reminders (patient_email, medicine_name, schedule_time, patient_id, prescription_id, dose_label)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    rows,
                )
    return {"created": len(rows)}


@router.get("/reminders", response_model=List[ReminderOut])
async def list_reminders(limit: int = 50, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, prescription_id, medicine_name, dose_label, schedule_time, status
            FROM patient_reminders
            WHERE patient_id = $1 AND status = 'pending' AND schedule_time >= now() - interval '1 hour'
            ORDER BY schedule_time LIMIT $2
            """,
            me.id, limit,
        )
    return [ReminderOut(**dict(r)) for r in rows]


@router.delete("/reminders/{prescription_id}")
async def delete_reminders(prescription_id: int, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        res = await conn.execute(
            "DELETE FROM patient_reminders WHERE prescription_id = $1 AND patient_id = $2 AND status = 'pending'",
            prescription_id, me.id,
        )
    return {"deleted": int(res.split()[-1])}

import io
import re
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, Depends
from google.genai import types
from PIL import Image
from pydantic import BaseModel

from app.database import gemini_client2, supabase, get_conn, embed_query, GEMINI_MODEL, gemini_error_to_http
from app.api.auth import get_current_patient, CurrentPatient

router = APIRouter()

MAX_IMAGE_DIM = 2048
MATCH_THRESHOLD = 0.60


class ExtractedMedicine(BaseModel):
    name: str
    dosage_pattern: str
    meal_timing: Optional[str] = None
    duration_days: int
    dosage_form: Optional[str] = None
    strength: Optional[str] = None


class PrescriptionExtraction(BaseModel):
    doctor_name: Optional[str] = None
    doctor_specialization: Optional[str] = None
    disease_diagnosis: Optional[str] = None
    raw_ocr_text: str
    medicines: list[ExtractedMedicine]


class MedicineVariant(BaseModel):
    medicine_id: int
    brand_name: str
    strength: Optional[str]
    dosage_form_id: Optional[int]
    dosage_form_name: Optional[str]


class ScannedMedicine(BaseModel):
    scanned_name: str
    scanned_strength: Optional[str]
    scanned_dosage_form: Optional[str]
    medicine_id: Optional[int]
    brand_name: Optional[str]
    generic_name: Optional[str]
    strength: Optional[str]
    dosage_form_id: Optional[int]
    dosage_form_name: Optional[str]
    similarity: Optional[float]
    variants: list[MedicineVariant]
    dosage_instruction: str
    duration_days: int


class ScanReviewResponse(BaseModel):
    doctor_name: Optional[str]
    doctor_specialization: Optional[str]
    disease_diagnosis: Optional[str]
    raw_ocr_text: str
    medicines: list[ScannedMedicine]


class DosageForm(BaseModel):
    id: int
    name: str


class SaveMedicineItem(BaseModel):
    medicine_id: Optional[int] = None
    medicine_name: Optional[str] = None
    dosage_form_id: Optional[int] = None
    dosage_instruction: str
    duration_days: int


class SavePrescriptionRequest(BaseModel):
    doctor_name: Optional[str] = None
    doctor_specialization: Optional[str] = None
    disease_diagnosis: Optional[str] = None
    raw_ocr_text: Optional[str] = None
    medicines: list[SaveMedicineItem]


def _preprocess_image(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(img.size) > MAX_IMAGE_DIM:
        img.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


async def _extract(image_bytes: bytes) -> PrescriptionExtraction:
    prompt = (
        "You are a medical OCR assistant. Read this prescription image.\n"
        "Return: doctor_name, doctor_specialization (degrees), disease_diagnosis (chief complaint), "
        "raw_ocr_text (verbatim transcription), and medicines[] with:\n"
        " - name: as written (brand or generic), without strength\n"
        " - strength: e.g. '500 mg', '125 mg/5 ml' or null\n"
        " - dosage_form: tablet/capsule/syrup/injection/drop or null\n"
        " - dosage_pattern: morning+noon+night counts, e.g. '1+0+1'. Convert 'BD'→'1+0+1', 'TDS'→'1+1+1', 'OD'→'1+0+0', 'HS'→'0+0+1'. Use ½ for half.\n"
        " - meal_timing: 'Before food' / 'After food' / null\n"
        " - duration_days: integer (7 if unclear)\n"
        "Use null for anything unreadable."
    )
    resp = await gemini_client2.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=[types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"), prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=PrescriptionExtraction),
    )
    return PrescriptionExtraction.model_validate_json(resp.text)


async def _match_medicine(name: str) -> Optional[dict]:
    vec = await embed_query(name)
    res = supabase.rpc("match_medicines_by_name", {
        "query_embedding": vec, "match_threshold": MATCH_THRESHOLD, "match_count": 1,
    }).execute()
    return res.data[0] if res.data else None


async def _all_forms(conn) -> list[dict]:
    return [dict(r) for r in await conn.fetch("SELECT id, name FROM dosage_forms ORDER BY name")]


def _match_form(name: Optional[str], forms: list[dict]) -> Optional[int]:
    if not name:
        return None
    n = name.strip().lower().rstrip("s")
    for f in forms:
        if f["name"].lower() == n or f["name"].lower().rstrip("s") == n:
            return f["id"]
    for f in forms:
        fn = f["name"].lower()
        if fn in n or n in fn:
            return f["id"]
    return None


async def _variants(conn, brand: str, forms_by_id: dict) -> list[MedicineVariant]:
    rows = await conn.fetch(
        "SELECT id, brand_name, strength, dosage_form_id FROM medicines WHERE lower(brand_name) = lower($1) ORDER BY id", brand
    )
    return [
        MedicineVariant(medicine_id=r["id"], brand_name=r["brand_name"], strength=r["strength"],
                        dosage_form_id=r["dosage_form_id"], dosage_form_name=forms_by_id.get(r["dosage_form_id"]))
        for r in rows
    ]


def _norm(s: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""


def _pick_variant(variants, strength, form_id, default_id):
    best, score_best = None, 0
    for v in variants:
        score = 0
        if form_id and v.dosage_form_id == form_id:
            score += 2
        ns, nv = _norm(strength), _norm(v.strength)
        if ns and nv and (nv.startswith(ns) or ns.startswith(nv)):
            score += 1
        if score > score_best:
            best, score_best = v, score
    if best:
        return best
    return next((v for v in variants if v.medicine_id == default_id), variants[0] if variants else None)


async def _resolve_doctor(conn, name: Optional[str], spec: Optional[str]) -> Optional[int]:
    if not name or not name.strip():
        return None
    name = name.strip()
    row = await conn.fetchrow("SELECT id FROM doctors WHERE lower(name) = lower($1) LIMIT 1", name)
    if row:
        return row["id"]
    row = await conn.fetchrow("INSERT INTO doctors (name, specialization) VALUES ($1, $2) RETURNING id", name, spec)
    return row["id"]


@router.get("/dosage_forms", response_model=list[DosageForm])
async def list_dosage_forms():
    async with get_conn() as conn:
        return await _all_forms(conn)


@router.get("/medicine_variants", response_model=list[MedicineVariant])
async def medicine_variants(brand_name: str):
    async with get_conn() as conn:
        forms = {f["id"]: f["name"] for f in await _all_forms(conn)}
        return await _variants(conn, brand_name, forms)


@router.post("/scan", response_model=ScanReviewResponse)
async def scan_prescription(file: UploadFile = File(...), _: CurrentPatient = Depends(get_current_patient)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Uploaded file must be an image.")
    try:
        img = _preprocess_image(await file.read())
    except Exception as e:
        raise HTTPException(422, f"Could not read image: {e}")

    try:
        ex = await _extract(img)
    except Exception as e:
        raise gemini_error_to_http(e)

    async with get_conn() as conn:
        forms = await _all_forms(conn)
        forms_by_id = {f["id"]: f["name"] for f in forms}
        out = []
        for med in ex.medicines:
            match = await _match_medicine(med.name)
            form_id = _match_form(med.dosage_form, forms)
            variants, sel = [], None
            if match:
                variants = await _variants(conn, match["brand_name"], forms_by_id)
                sel = _pick_variant(variants, med.strength, form_id, match["medicine_id"])
            instr = med.dosage_pattern.strip() or "1+0+1"
            if med.meal_timing:
                instr = f"{instr} • {med.meal_timing}"
            out.append(ScannedMedicine(
                scanned_name=med.name, scanned_strength=med.strength, scanned_dosage_form=med.dosage_form,
                medicine_id=sel.medicine_id if sel else None,
                brand_name=sel.brand_name if sel else (match["brand_name"] if match else None),
                generic_name=match["generic_name"] if match else None,
                strength=sel.strength if sel else None,
                dosage_form_id=sel.dosage_form_id if sel else form_id,
                dosage_form_name=sel.dosage_form_name if sel else forms_by_id.get(form_id),
                similarity=match["similarity"] if match else None,
                variants=variants, dosage_instruction=instr, duration_days=max(1, med.duration_days),
            ))
    return ScanReviewResponse(
        doctor_name=ex.doctor_name, doctor_specialization=ex.doctor_specialization,
        disease_diagnosis=ex.disease_diagnosis, raw_ocr_text=ex.raw_ocr_text, medicines=out,
    )


async def _insert_items(conn, prescription_id: int, meds: list[SaveMedicineItem]):
    await conn.executemany(
        """
        INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage_instruction, duration_days)
        VALUES ($1, $2, $3, $4, $5)
        """,
        [(prescription_id, m.medicine_id, m.medicine_name, m.dosage_instruction.strip(), max(1, m.duration_days)) for m in meds],
    )


@router.post("/save_prescription")
async def save_prescription(req: SavePrescriptionRequest, me: CurrentPatient = Depends(get_current_patient)):
    if not req.medicines:
        raise HTTPException(400, "Add at least one medicine")
    async with get_conn() as conn:
        async with conn.transaction():
            doctor_id = await _resolve_doctor(conn, req.doctor_name, req.doctor_specialization)
            row = await conn.fetchrow(
                """
                INSERT INTO prescriptions (doctor_id, patient_id, raw_ocr_text, disease_diagnosis)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                doctor_id, me.id, req.raw_ocr_text, req.disease_diagnosis,
            )
            await _insert_items(conn, row["id"], req.medicines)
    return {"prescription_id": row["id"], "doctor_id": doctor_id, "item_count": len(req.medicines)}


@router.put("/{prescription_id}")
async def edit_prescription(prescription_id: int, req: SavePrescriptionRequest, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        async with conn.transaction():
            doctor_id = await _resolve_doctor(conn, req.doctor_name, req.doctor_specialization)
            res = await conn.execute(
                """
                UPDATE prescriptions SET doctor_id = $1, disease_diagnosis = $2,
                       raw_ocr_text = COALESCE($3, raw_ocr_text)
                WHERE id = $4 AND patient_id = $5
                """,
                doctor_id, req.disease_diagnosis, req.raw_ocr_text, prescription_id, me.id,
            )
            if res == "UPDATE 0":
                raise HTTPException(404, "Prescription not found")
            await conn.execute("DELETE FROM prescription_items WHERE prescription_id = $1", prescription_id)
            if req.medicines:
                await _insert_items(conn, prescription_id, req.medicines)
    return {"ok": True}


@router.post("/add_prescription_from_qr")
async def add_prescription_from_qr(id: int, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        # sudhu owner-less prescription claim kora jabe
        res = await conn.execute(
            "UPDATE prescriptions SET patient_id = $1 WHERE id = $2 AND (patient_id IS NULL OR patient_id = $1)", me.id, id
        )
    if res == "UPDATE 0":
        raise HTTPException(404, "Prescription not found or already linked to another patient")
    return {"ok": True}


@router.post("/remove_prescription")
async def remove_prescription(id: int, me: CurrentPatient = Depends(get_current_patient)):
    async with get_conn() as conn:
        res = await conn.execute("DELETE FROM prescriptions WHERE id = $1 AND patient_id = $2", id, me.id)
    if res == "DELETE 0":
        raise HTTPException(404, "Prescription not found")
    return {"ok": True}

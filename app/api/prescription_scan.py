import io
from typing import Optional
import asyncpg
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from google.genai import types
from PIL import Image
from pydantic import BaseModel

from app.database import DATABASE_URL, gemini_client, model, supabase

router = APIRouter()

MAX_IMAGE_DIM = 2048
MEDICINE_MATCH_THRESHOLD = 0.60
MEDICINE_MATCH_COUNT = 1


# --- Pydantic schemas for Gemini structured extraction ---

class ExtractedMedicine(BaseModel):
    name: str
    dosage_instruction: str
    duration_days: int


class PrescriptionExtraction(BaseModel):
    doctor_name: Optional[str] = None
    doctor_specialization: Optional[str] = None
    disease_diagnosis: Optional[str] = None
    raw_ocr_text: str
    medicines: list[ExtractedMedicine]


# --- Response schema ---

class PrescriptionItemResult(BaseModel):
    medicine_id: Optional[int]
    brand_name: Optional[str]
    generic_name: Optional[str]
    dosage_instruction: str
    duration_days: int
    similarity: Optional[float]


class PrescriptionScanResponse(BaseModel):
    prescription_id: int
    doctor_id: Optional[int]
    doctor_name: Optional[str]
    disease_diagnosis: Optional[str]
    raw_ocr_text: str
    items: list[PrescriptionItemResult]


# --- Helpers ---

def _preprocess_image(raw_bytes: bytes) -> tuple[bytes, str]:
    """Normalize image to RGB JPEG, resize if too large."""
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    w, h = img.size
    if w > MAX_IMAGE_DIM or h > MAX_IMAGE_DIM:
        img.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def _extract_prescription_data(image_bytes: bytes, mime_type: str) -> PrescriptionExtraction:
    """Call Gemini Vision to extract structured data from the prescription image."""
    prompt = (
        "You are a medical OCR assistant. Analyze this prescription image carefully.\n"
        "Extract the following information:\n"
        "1. doctor_name: The prescribing doctor's full name (null if not visible).\n"
        "2. doctor_specialization: The doctor's specialization/degree (null if not visible).\n"
        "3. disease_diagnosis: The diagnosed condition or chief complaint (null if not visible).\n"
        "4. raw_ocr_text: A verbatim transcription of all readable text on the prescription.\n"
        "5. medicines: A list of prescribed medicines, each with:\n"
        "   - name: The medicine name as written (brand or generic).\n"
        "   - dosage_instruction: Full dosage directions in dosage_morning + dosage_noon + dosage_night format (eg, 1+0+1).\n"
        "   - duration_days: Duration as an integer number of days (estimate 7 if unclear).\n"
        "Return only valid JSON matching the schema. If a field cannot be determined, use null."
    )

    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=PrescriptionExtraction,
        ),
    )

    return PrescriptionExtraction.model_validate_json(response.text)


def _resolve_doctor(name: Optional[str], specialization: Optional[str]) -> Optional[int]:
    """Find doctor by name (case-insensitive), insert if not found. Returns doctor_id or None."""
    if not name:
        return None

    existing = (
        supabase.table("doctors")
        .select("id")
        .ilike("name", name.strip())
        .limit(1)
        .execute()
    )

    if existing.data:
        return existing.data[0]["id"]

    inserted = (
        supabase.table("doctors")
        .insert({"name": name.strip(), "specialization": specialization})
        .execute()
    )

    if inserted.data:
        return inserted.data[0]["id"]

    return None


def _match_medicine(medicine_name: str) -> Optional[dict]:
    """Embed the medicine name and run match_medicines_by_name. Returns best match or None."""
    query_vector = model.encode(f"search_query: {medicine_name}").tolist()

    result = supabase.rpc(
        "match_medicines_by_name",
        {
            "query_embedding": query_vector,
            "match_threshold": MEDICINE_MATCH_THRESHOLD,
            "match_count": MEDICINE_MATCH_COUNT,
        },
    ).execute()

    if result.data:
        return result.data[0]

    return None


# --- Endpoint ---

@router.post("/scan", response_model=PrescriptionScanResponse)
async def scan_prescription(
    file: UploadFile = File(..., description="Prescription image (JPEG/PNG/WEBP)"),
    patient_id: Optional[int] = Query(None, description="Authenticated patient's ID"),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    try:
        raw_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {e}")

    try:
        image_bytes, mime_type = _preprocess_image(raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image preprocessing failed: {e}")

    try:
        extraction = _extract_prescription_data(image_bytes, mime_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OCR extraction failed: {e}")

    # Resolve or create doctor
    try:
        doctor_id = _resolve_doctor(extraction.doctor_name, extraction.doctor_specialization)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Doctor lookup/insert failed: {e}")

    # Insert prescription record
    try:
        prescription_row = (
            supabase.table("prescriptions")
            .insert(
                {
                    "doctor_id": doctor_id,
                    "patient_id": patient_id,
                    "raw_ocr_text": extraction.raw_ocr_text,
                    "disease_diagnosis": extraction.disease_diagnosis,
                }
            )
            .execute()
        )
        prescription_id: int = prescription_row.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to save prescription: {e}")

    # Match medicines and build prescription_items rows
    items_to_insert = []
    item_results: list[PrescriptionItemResult] = []

    for med in extraction.medicines:
        match = _match_medicine(med.name)

        medicine_id = match["medicine_id"] if match else None
        brand_name = match.get("brand_name") if match else None
        generic_name = match.get("generic_name") if match else None
        similarity = match.get("similarity") if match else None

        items_to_insert.append(
            {
                "prescription_id": prescription_id,
                "medicine_id": medicine_id,
                "dosage_instruction": med.dosage_instruction,
                "duration_days": max(1, med.duration_days),
            }
        )

        item_results.append(
            PrescriptionItemResult(
                medicine_id=medicine_id,
                brand_name=brand_name,
                generic_name=generic_name,
                dosage_instruction=med.dosage_instruction,
                duration_days=med.duration_days,
                similarity=similarity,
            )
        )

    if items_to_insert:
        try:
            supabase.table("prescription_items").insert(items_to_insert).execute()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to save prescription items: {e}")

    return PrescriptionScanResponse(
        prescription_id=prescription_id,
        doctor_id=doctor_id,
        doctor_name=extraction.doctor_name,
        disease_diagnosis=extraction.disease_diagnosis,
        raw_ocr_text=extraction.raw_ocr_text,
        items=item_results,
    )


@router.post("/add_prescription_from_qr")
async def add_prescription_from_qr(patient_id: int, id: int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:

        query = """
            update prescriptions
            set patient_id = $1
            where id = $2
        """
        await conn.execute(query, patient_id, id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

@router.post("/remove_prescription")
async def remove_prescription(patient_id: int , id:int):
    conn = await asyncpg.connect(DATABASE_URL)
    try:

        Query = """
                delete from prescriptions
                where patient_id = $1 and id = $2
                """
        
        await conn.execute(Query, patient_id, id)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()

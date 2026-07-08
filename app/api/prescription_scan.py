import io
import re
from typing import Optional
import asyncpg
from fastapi import APIRouter, File, HTTPException, UploadFile
from google.genai import types
from PIL import Image
from pydantic import BaseModel

from app.database import DATABASE_URL, gemini_client, model, supabase

router = APIRouter()

MAX_IMAGE_DIM = 2048
MEDICINE_MATCH_THRESHOLD = 0.60
MEDICINE_MATCH_COUNT = 1



class ExtractedMedicine(BaseModel):
    name: str
    dosage_instruction: str
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
    slug: Optional[str]
    package_container: Optional[str]
    package_size: Optional[str]
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
    dosage_form_id: Optional[int] = None
    dosage_instruction: str
    duration_days: int


class SavePrescriptionRequest(BaseModel):
    patient_id: Optional[int] = None
    doctor_name: Optional[str] = None
    doctor_specialization: Optional[str] = None
    disease_diagnosis: Optional[str] = None
    raw_ocr_text: Optional[str] = None
    medicines: list[SaveMedicineItem]


class SavePrescriptionResponse(BaseModel):
    prescription_id: int
    doctor_id: Optional[int]
    item_count: int



def _preprocess_image(raw_bytes: bytes) -> tuple[bytes, str]:

    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    w, h = img.size
    if w > MAX_IMAGE_DIM or h > MAX_IMAGE_DIM:
        img.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def _extract_prescription_data(image_bytes: bytes, mime_type: str) -> PrescriptionExtraction:
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
        "   - duration_days: Duration as an integer number of days (estimate 7 if unclear).\n" \
        "   - dosage_form: The dosage form (e.g., tablet, syrup, injection) if visible, else null.\n"
        "   - strength: The strength/dose per unit as written (e.g., '500 mg', '250 mg/vial', '125 mg/5 ml') if visible, else null.\n"
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


def _get_all_dosage_forms() -> list[dict]:
    result = supabase.table("dosage_forms").select("id, name").order("name").execute()
    return result.data or []


def _match_dosage_form(name: Optional[str], all_forms: list[dict]) -> tuple[Optional[int], Optional[str]]:
    
    if not name:
        return None, None

    n = name.strip().lower()
    if not n:
        return None, None

    for f in all_forms:
        if f["name"].strip().lower() == n:
            return f["id"], f["name"]

    n_sing = n[:-1] if n.endswith("s") else n
    for f in all_forms:
        fn = f["name"].strip().lower()
        fn_sing = fn[:-1] if fn.endswith("s") else fn
        if fn_sing == n_sing:
            return f["id"], f["name"]

    for f in all_forms:
        fn = f["name"].strip().lower()
        if fn in n or n in fn:
            return f["id"], f["name"]

    return None, None


def _get_brand_variants(brand_name: str, forms_by_id: dict[int, str]) -> list[MedicineVariant]:
    if not brand_name:
        return []

    result = (
        supabase.table("medicines")
        .select("id, brand_name, strength, slug, package_container, package_size, dosage_form_id")
        .ilike("brand_name", brand_name.strip())
        .execute()
    )

    variants: list[MedicineVariant] = []
    for row in result.data or []:
        variants.append(
            MedicineVariant(
                medicine_id=row["id"],
                brand_name=row["brand_name"],
                strength=row.get("strength"),
                slug=row.get("slug"),
                package_container=row.get("package_container"),
                package_size=row.get("package_size"),
                dosage_form_id=row.get("dosage_form_id"),
                dosage_form_name=forms_by_id.get(row.get("dosage_form_id")),
            )
        )
    return variants


def _normalize_strength(s: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""


def _strength_matches(scanned: Optional[str], variant: Optional[str]) -> bool:
    ns, nv = _normalize_strength(scanned), _normalize_strength(variant)
    if not ns or not nv:
        return False
    return nv.startswith(ns) or ns.startswith(nv)


def _select_variant(
    variants: list[MedicineVariant],
    scanned_strength: Optional[str],
    scanned_dosage_form_id: Optional[int],
    default_medicine_id: Optional[int],
) -> Optional[MedicineVariant]:

    if not variants:
        return None

    best, best_score = None, 0
    for v in variants:
        score = 0
        if scanned_dosage_form_id and v.dosage_form_id == scanned_dosage_form_id:
            score += 2
        if _strength_matches(scanned_strength, v.strength):
            score += 1
        if score > best_score:
            best, best_score = v, score

    if best is not None:
        return best

    for v in variants:
        if v.medicine_id == default_medicine_id:
            return v
    return variants[0]




@router.get("/medicine_variants", response_model=list[MedicineVariant])
async def medicine_variants(brand_name: str):
    try:
        forms_by_id = {f["id"]: f["name"] for f in _get_all_dosage_forms()}
        return _get_brand_variants(brand_name, forms_by_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch medicine variants: {e}")


@router.get("/dosage_forms", response_model=list[DosageForm])
async def list_dosage_forms():
    try:
        return _get_all_dosage_forms()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch dosage forms: {e}")

@router.post("/scan", response_model=ScanReviewResponse)
async def scan_prescription(
    file: UploadFile = File(..., description="Prescription image (JPEG/PNG/WEBP)"),
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

    try:
        all_forms = _get_all_dosage_forms()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch dosage forms: {e}")

    forms_by_id = {f["id"]: f["name"] for f in all_forms}
    scanned_medicines: list[ScannedMedicine] = []

    for med in extraction.medicines:
        try:
            match = _match_medicine(med.name)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Medicine matching failed: {e}")

        scanned_form_id, _ = _match_dosage_form(med.dosage_form, all_forms)

        variants: list[MedicineVariant] = []
        selected: Optional[MedicineVariant] = None
        if match:
            try:
                variants = _get_brand_variants(match["brand_name"], forms_by_id)
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"Failed to fetch medicine variants: {e}")
            selected = _select_variant(
                variants, med.strength, scanned_form_id, match["medicine_id"]
            )

        scanned_medicines.append(
            ScannedMedicine(
                scanned_name=med.name,
                scanned_strength=med.strength,
                scanned_dosage_form=med.dosage_form,
                medicine_id=selected.medicine_id if selected else None,
                brand_name=selected.brand_name if selected else (match.get("brand_name") if match else None),
                generic_name=match.get("generic_name") if match else None,
                strength=selected.strength if selected else None,
                dosage_form_id=selected.dosage_form_id if selected else scanned_form_id,
                dosage_form_name=selected.dosage_form_name if selected else forms_by_id.get(scanned_form_id),
                similarity=match.get("similarity") if match else None,
                variants=variants,
                dosage_instruction=med.dosage_instruction,
                duration_days=max(1, med.duration_days),
            )
        )

    return ScanReviewResponse(
        doctor_name=extraction.doctor_name,
        doctor_specialization=extraction.doctor_specialization,
        disease_diagnosis=extraction.disease_diagnosis,
        raw_ocr_text=extraction.raw_ocr_text,
        medicines=scanned_medicines,
    )


@router.post("/save_prescription", response_model=SavePrescriptionResponse)
async def save_prescription(payload: SavePrescriptionRequest):
   
    try:
        doctor_id = _resolve_doctor(payload.doctor_name, payload.doctor_specialization)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Doctor lookup/insert failed: {e}")

    try:
        prescription_row = (
            supabase.table("prescriptions")
            .insert(
                {
                    "doctor_id": doctor_id,
                    "patient_id": payload.patient_id,
                    "raw_ocr_text": payload.raw_ocr_text,
                    "disease_diagnosis": payload.disease_diagnosis,
                }
            )
            .execute()
        )
        prescription_id: int = prescription_row.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to save prescription: {e}")

    items_to_insert = [
        {
            "prescription_id": prescription_id,
            "medicine_id": item.medicine_id,
            "dosage_instruction": item.dosage_instruction,
            "duration_days": max(1, item.duration_days),
        }
        for item in payload.medicines
    ]

    if items_to_insert:
        try:
            supabase.table("prescription_items").insert(items_to_insert).execute()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to save prescription items: {e}")

    return SavePrescriptionResponse(
        prescription_id=prescription_id,
        doctor_id=doctor_id,
        item_count=len(items_to_insert),
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


@router.post("/edit_prescription")
async def edit_prescription(patient_id: int, id: int, updated_data: dict):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        query = """
            UPDATE prescriptions
            SET
                doctor_id = $3,
                disease_diagnosis = $4
            WHERE patient_id = $1 AND id = $2
        """
        await conn.execute(query, patient_id, id, updated_data.get("doctor_id"), updated_data.get("disease_diagnosis"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await conn.close()
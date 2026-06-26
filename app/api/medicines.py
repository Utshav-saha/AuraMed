from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import json
from google.genai import types
from app.database import supabase, model, gemini_client

router = APIRouter()

class SearchResponse(BaseModel):
    medicine_id: int
    brand_name: str
    strength: Optional[str] = None
    manufacturer_name: Optional[str] = None
    generic_name: str
    similarity: float

class QueryAnalysis(BaseModel):
    search_type: str
    optimized_query: str


class MedicineDetails(BaseModel):
    id: int
    brand_name : str
    drug_type: Optional[str] = None 
    slug: Optional[str] = None 
    strength: Optional[str] = None 
    package_container: Optional[str] = None 
    package_size: Optional[str] = None 
    manufacturer_name: Optional[str] = None 
    dosage_form: Optional[str] = None 
    generic_name: Optional[str] = None 
    indication_name: Optional[str] = None 
    indication_description: Optional[str] = None 
    therapeutic_class_description: Optional[str] = None 
    pharmacology_description: Optional[str] = None 
    dosage_description: Optional[str] = None 
    administration_description: Optional[str] = None 
    interaction_description: Optional[str] = None 
    contraindications_description: Optional[str] = None 
    side_effects_description: Optional[str] = None 
    pregnancy_and_lactation_description: Optional[str] = None 
    precautions_description: Optional[str] = None 
    pediatric_usage_description: Optional[str] = None 
    overdose_effects_description: Optional[str] = None 
    duration_of_treatment_description: Optional[str] = None 
    reconstitution_description: Optional[str] = None 
    storage_conditions_description: Optional[str] = None 

@router.get("/search-medicines", response_model=list[SearchResponse])
async def search(
    q: str = Query(..., description="Type a symptom or a medicine name"),
    limit: int = Query(10, ge=1, le=50)
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
        
    try:
        prompt = f"""
        Analyze this user search query for a pharmacy app: "{q}"
        If it is a specific medicine brand or generic name (e.g., 'Napa', 'Paracetamol'), return search_type as 'NAME' and the clean name.
        If it describes symptoms or a medical condition (e.g., 'headache', 'burning chest'), return search_type as 'SYMPTOM'. 
        For SYMPTOM, expand the optimized_query into clinical terms and drug classes that treat it (e.g., 'Migraine, analgesics, NSAIDs, throbbing cranial pain').
        """
        
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=QueryAnalysis,
            ),
        )
        
        analysis = json.loads(response.text)
        search_type = analysis.get("search_type")
        optimized_query = analysis.get("optimized_query")
        
        formatted_query = f"search_query: {optimized_query}"
        query_vector = model.encode(formatted_query).tolist()
        
        if search_type == "NAME":
            db_function = "match_medicines_by_name"
            threshold = 0.60
        else:
            db_function = "match_medicines_by_symptom"
            threshold = 0.45
            
        db_response = supabase.rpc(
            db_function,
            {
                "query_embedding": query_vector,
                "match_threshold": threshold,
                "match_count": limit
            }
        ).execute()
        
        return db_response.data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Smart Search Error: {str(e)}")
    

@router.get("/fetch_medicine_details")